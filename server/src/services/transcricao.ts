import { env } from "../config/env";

// Transcreve audio (pt-BR) com o Whisper da Groq. Usado so nos navegadores sem ditado proprio.
export class ErroTranscricao extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

// Dica de vocabulario para o Whisper acertar termos da escola
const DICA =
  "Registro de aula. Matemática, Língua Portuguesa, Ciências, História, Geografia, Arte, Educação Física, Ensino Religioso, Inglês. Leitura, escrita, tabuada, frações, produção de texto.";

export async function transcreverAudio(audio: Buffer, nome: string, tipo: string): Promise<string> {
  if (!env.groqKey) {
    throw new ErroTranscricao(
      "O ditado por voz neste navegador ainda não está configurado (falta GROQ_API_KEY no .env do servidor). Use o Chrome ou o Edge, ou digite o texto.",
      503
    );
  }
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
