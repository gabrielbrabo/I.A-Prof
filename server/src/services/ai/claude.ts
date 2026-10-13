import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../config/env";
import { somarUso } from "../uso";

let cliente: Anthropic | null = null;

function getCliente(): Anthropic {
  if (!env.anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY nao configurada no .env");
  }
  if (!cliente) cliente = new Anthropic({ apiKey: env.anthropicKey });
  return cliente;
}

export interface FormatoJson {
  nome: string; // usado so em logs/erros
  schema: Record<string, unknown>; // JSON Schema (objetos com additionalProperties: false)
}

// Conteudo da mensagem: texto simples ou blocos (PDF, imagem, texto)
export type Conteudo = string | Anthropic.ContentBlockParam[];

// Chama o Claude com Structured Outputs: a resposta sempre volta como JSON valido no schema
// (tool_choice forcado nao e suportado nos modelos novos, por isso usamos output_config.format)
// Respostas grandes (maxTokens > 16000) usam streaming, exigido pelo SDK para chamadas longas.
export async function chamarJson<T>(params: {
  system: string;
  mensagem: Conteudo;
  formato: FormatoJson;
  maxTokens?: number;
  modelo?: string; // sobrescreve o modelo padrao do .env
}): Promise<T> {
  const maxTokens = params.maxTokens ?? 4096;
  const body: Anthropic.MessageCreateParamsNonStreaming = {
    model: params.modelo || env.anthropicModel,
    max_tokens: maxTokens,
    system: params.system,
    messages: [{ role: "user", content: params.mensagem }],
    output_config: {
      format: { type: "json_schema", schema: params.formato.schema },
    },
  };

  const resp =
    maxTokens > 16000
      ? await getCliente().messages.stream(body).finalMessage()
      : await getCliente().messages.create(body);

  // Custo da chamada entra no consumo do mes do professor (limite do plano)
  somarUso(body.model, resp.usage?.input_tokens ?? 0, resp.usage?.output_tokens ?? 0, resp.usage?.cache_read_input_tokens ?? 0);

  if (resp.stop_reason === "max_tokens") {
    throw new Error(`Resposta da IA cortada por tamanho (${params.formato.nome}). Envie o arquivo em partes menores.`);
  }

  const texto = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(`A IA nao retornou JSON valido (${params.formato.nome})`);
  }
}
