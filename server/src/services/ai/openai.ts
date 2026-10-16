import { env } from "../../config/env";
import { somarUso } from "../uso";

// Chamada ao GPT (OpenAI Responses API) com Structured Outputs: a resposta volta como JSON valido no schema.
// Usada para gerar e ajustar atividades (texto, questoes, gabarito, cabecalho, estilo).

export type ParteOpenAI = { type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" };

export const gptLigado = () => !!env.openaiKey;

type RespostaApi = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string } | null;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

export async function chamarJsonOpenAI<T>(params: {
  system: string;
  partes: ParteOpenAI[];
  nome: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  modelo?: string;
  raciocinio?: string;
  cacheKey?: string; // instrucoes fixas ficam em cache na OpenAI (entrada repetida custa ~10%)
}): Promise<T> {
  if (!gptLigado()) throw new Error("Geração de atividades não configurada (OPENAI_API_KEY).");
  const modelo = params.modelo || env.openaiModeloAtividade;
  const body: Record<string, unknown> = {
    model: modelo,
    instructions: params.system,
    input: [{ role: "user", content: params.partes }],
    max_output_tokens: params.maxTokens ?? 32000,
    text: { format: { type: "json_schema", name: params.nome, schema: params.schema, strict: true } },
    store: false,
    ...(params.cacheKey ? { prompt_cache_key: params.cacheKey } : {}),
  };
  const esforco = params.raciocinio ?? env.openaiRaciocinio;
  if (esforco) body.reasoning = { effort: esforco };

  const enviar = (b: Record<string, unknown>) =>
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify(b),
      signal: AbortSignal.timeout(300000),
    });

  let resp = await enviar(body);
  let dados = (await resp.json().catch(() => ({}))) as RespostaApi;
  // Modelo sem "reasoning" (ex.: modelos antigos): tenta de novo sem o parametro
  if (!resp.ok && body.reasoning && /reasoning/i.test(dados.error?.message ?? "")) {
    delete body.reasoning;
    resp = await enviar(body);
    dados = (await resp.json().catch(() => ({}))) as RespostaApi;
  }
  if (!resp.ok) {
    const e = new Error(dados.error?.message || `Erro ${resp.status} na OpenAI`) as Error & { status?: number };
    e.status = resp.status;
    throw e;
  }

  // Custo entra no limite de I.A do professor
  const entrada = dados.usage?.input_tokens ?? 0;
  const cache = dados.usage?.input_tokens_details?.cached_tokens ?? 0;
  somarUso(modelo, Math.max(0, entrada - cache), dados.usage?.output_tokens ?? 0, cache);

  if (dados.status === "incomplete") {
    throw new Error(`Resposta da I.A cortada (${dados.incomplete_details?.reason || "tamanho"}). Tente pedir menos questões de uma vez.`);
  }
  const conteudo = (dados.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const recusa = conteudo.find((c) => c.type === "refusal");
  if (recusa) throw new Error("A I.A não aceitou este pedido. Reescreva o pedido da atividade.");
  const texto = conteudo
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error(`A I.A não retornou JSON válido (${params.nome})`);
  }
}
