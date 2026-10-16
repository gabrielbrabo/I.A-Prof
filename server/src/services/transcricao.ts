import { env } from "../config/env";

// Transcreve audio (pt-BR). Usado nos navegadores sem ditado proprio (tablet, iPhone, Firefox...).
// Usa a Groq (Whisper, mais barata) se tiver GROQ_API_KEY; senao, a OpenAI (OPENAI_API_KEY).
export class ErroTranscricao extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

// Dica de vocabulario para o Whisper acertar termos da escola
const DICA =
  "Registro de aula. Matemática, Língua Portuguesa, Ciências, História, Geografia, Arte, Educação Física, Ensino Religioso, Inglês. Leitura, escrita, tabuada, frações, produção de texto.";

// Custo por hora de audio (USD), para o limite de I.A do professor
export const CUSTO_HORA_VOZ = { groq: 0.04, openai: 0.18 };
export const provedorVoz = (): "groq" | "openai" | null => (env.groqKey ? "groq" : env.openaiKey ? "openai" : null);

export async function transcreverAudio(audio: Buffer, nome: string, tipo: string): Promise<string> {
  const provedor = provedorVoz();
  if (!provedor) {
    console.error("[voz] sem GROQ_API_KEY e sem OPENAI_API_KEY no servidor");
    throw new ErroTranscricao("O ditado por voz está indisponível no momento. Digite o texto ou tente pelo Chrome.", 503);
  }
  if (provedor === "openai") return transcreverOpenAI(audio, nome, tipo);
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(audio)], { type: tipo || "audio/webm" }), nome);
  fd.append("model", env.groqModeloVoz);
  fd.append("language", "pt");
  fd.append("response_format", "json");
  fd.append("temperature", "0");
  fd.append("prompt", DICA);

  const resp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.groqKey}` },
    body: fd,
  });
  const dados = (await resp.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!resp.ok) {
    console.error("[voz] Groq", resp.status, dados.error?.message);
    if (resp.status === 401) throw new ErroTranscricao("Chave da Groq inválida (GROQ_API_KEY).", 502);
    if (resp.status === 429) throw new ErroTranscricao("Muitos ditados ao mesmo tempo. Tente de novo em alguns segundos.", 429);
    throw new ErroTranscricao("Não foi possível transcrever o áudio. Tente de novo.");
  }
  return (dados.text ?? "").trim();
}

async function transcreverOpenAI(audio: Buffer, nome: string, tipo: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(audio)], { type: tipo || "audio/webm" }), nome);
  fd.append("model", env.openaiModeloVoz);
  fd.append("language", "pt");
  fd.append("response_format", "json");
  fd.append("temperature", "0"); // menos "invencao" e repeticao
  fd.append("prompt", DICA);
  const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.openaiKey}` },
    body: fd,
    signal: AbortSignal.timeout(120000),
  });
  const dados = (await resp.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
  if (!resp.ok) {
    console.error("[voz] OpenAI", resp.status, dados.error?.message);
    if (resp.status === 429) throw new ErroTranscricao("Muitos ditados ao mesmo tempo. Tente de novo em alguns segundos.", 429);
    throw new ErroTranscricao("Não foi possível transcrever o áudio. Tente de novo.");
  }
  return (dados.text ?? "").trim();
}
