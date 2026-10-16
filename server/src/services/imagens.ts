import { env } from "../config/env";
import { somarCustoUsd } from "./uso";

// Ilustracoes das atividades geradas por I.A de imagem (OpenAI). O GPT escreve a atividade e
// descreve cada figura; aqui a figura vira imagem. Sem OPENAI_API_KEY nada e gerado.
export const imagensLigadas = () => !!env.openaiKey;

// Preco por imagem 1024x1024 (USD), usado quando a API nao devolve "usage"
const PRECOS: Record<string, Record<string, number>> = {
  "gpt-image-1-mini": { low: 0.005, medium: 0.011, high: 0.036 },
  "gpt-image-1": { low: 0.011, medium: 0.042, high: 0.167 },
};
// Preco por 1M tokens (USD): texto de entrada / imagem de saida — conferir em developers.openai.com/api/docs/pricing
const PRECOS_TOKENS: Array<{ prefixo: string; entrada: number; saida: number }> = [
  { prefixo: "gpt-image-2.5", entrada: 5, saida: 30 },
  { prefixo: "gpt-image-2", entrada: 5, saida: 30 },
  { prefixo: "gpt-image-1-mini", entrada: 2, saida: 8 },
  { prefixo: "gpt-image-1", entrada: 5, saida: 40 },
];
type Uso = { input_tokens?: number; output_tokens?: number };
function custoUsd(modelo: string, uso?: Uso) {
  if (env.imagemCustoUsd > 0) return env.imagemCustoUsd;
  const t = PRECOS_TOKENS.find((x) => modelo.startsWith(x.prefixo));
  if (t && uso && (uso.output_tokens ?? 0) > 0) return ((uso.input_tokens ?? 0) * t.entrada + (uso.output_tokens ?? 0) * t.saida) / 1_000_000;
  const tabela = PRECOS[modelo] ?? PRECOS["gpt-image-1"];
  return tabela[env.imagemQualidade] ?? tabela.medium;
}

// Estilo fixo: desenho infantil limpo, fundo branco, SEM texto (I.A de imagem erra letras)
function promptDaImagem(descricao: string, serie: string) {
  return [
    `Ilustração para uma atividade escolar impressa de ${serie}.`,
    `Mostre: ${descricao}.`,
    "Estilo: ilustração infantil de livro didático, colorida e alegre, cores vivas, traço limpo com contornos bem definidos, alta nitidez, composição centralizada ocupando bem o quadro, fundo branco liso, sem sombras pesadas.",
    "Sem nenhum texto, letra, número ou palavra escrita na imagem. Sem marca d'água. Apropriado para crianças.",
  ].join(" ");
}

export async function gerarImagem(descricao: string, serie: string): Promise<string> {
  if (!imagensLigadas()) throw new Error("Geração de imagens não configurada (OPENAI_API_KEY).");
  const pedir = async (modelo: string, compacta: number) => {
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.openaiKey}` },
      body: JSON.stringify({
        model: modelo,
        prompt: promptDaImagem(descricao, serie),
        size: "1024x1024",
        quality: env.imagemQualidade,
        ...(compacta === 2 ? { output_format: "jpeg", output_compression: 70 } : compacta === 1 ? { output_format: "jpeg" } : {}), // jpeg ~100 KB: cabe na atividade salva
        n: 1,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const dados = (await resp.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; error?: { message?: string }; usage?: Uso };
    return { resp, dados };
  };
  let modelo = env.imagemModelo;
  let compacta = 2;
  let { resp, dados } = await pedir(modelo, compacta);
  // Parametro nao aceito pelo modelo: tenta sem compressao; modelo indisponivel: usa o gpt-image-1-mini
  if (!resp.ok && resp.status === 400 && /output_(format|compression)/i.test(dados.error?.message ?? "")) {
    compacta = /output_compression/i.test(dados.error?.message ?? "") ? 1 : 0;
    ({ resp, dados } = await pedir(modelo, compacta));
    if (!resp.ok && resp.status === 400 && compacta === 1) ({ resp, dados } = await pedir(modelo, (compacta = 0)));
  }
  if (!resp.ok && (resp.status === 404 || resp.status === 400) && /model/i.test(dados.error?.message ?? "") && modelo !== "gpt-image-1-mini") {
    modelo = "gpt-image-1-mini";
    compacta = 2;
    ({ resp, dados } = await pedir(modelo, compacta));
  }
  if (!resp.ok || !dados.data?.[0]?.b64_json) throw new Error(dados.error?.message || `Erro ${resp.status} ao gerar imagem`);
  somarCustoUsd(custoUsd(modelo, dados.usage)); // entra no limite de I.A do professor
  return `data:image/${compacta ? "jpeg" : "png"};base64,${dados.data[0].b64_json}`;
}

// Gera varias ao mesmo tempo (no maximo `simultaneas` por vez). Falhas viram null (a questao fica com o emoji/desenho).
export async function gerarImagens(descricoes: string[], serie: string, simultaneas = 4): Promise<Array<string | null>> {
  const saida: Array<string | null> = new Array(descricoes.length).fill(null);
  let proxima = 0;
  async function trabalhador() {
    while (proxima < descricoes.length) {
      const i = proxima++;
      try {
        saida[i] = await gerarImagem(descricoes[i], serie);
      } catch (e) {
        console.error("[imagens]", e instanceof Error ? e.message : e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(simultaneas, descricoes.length) }, trabalhador));
  return saida;
}
