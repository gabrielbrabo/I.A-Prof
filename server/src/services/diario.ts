import { env, diarioLigado } from "../config/env";

// Cliente da API do Diario escolar (X Escolar). Servidor -> servidor: a chave fica so aqui no backend.
export class ErroDiario extends Error {
  constructor(message: string, public status: number, public dados: Record<string, unknown> = {}) {
    super(message);
  }
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown, token?: string): Promise<T> {
  if (!diarioLigado()) throw new ErroDiario("Integração com o D.E.V não configurada no servidor.", 503);
  let resp: Response;
  try {
    resp = await fetch(`${env.diario.url}/integracao/iaprof${caminho}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-iaprof-chave": env.diario.chave,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(60000), // Diario no plano gratis pode estar "acordando"
    });
  } catch (e) {
    // Mostra o motivo real (sem expor a chave) para facilitar achar o problema de configuracao
    const err = e as { name?: string; cause?: { code?: string; message?: string }; message?: string };
    const codigo = err.cause?.code || err.name || "";
    console.error(`[diario] falha ao chamar ${env.diario.url}/integracao/iaprof${caminho.split("?")[0]}:`, codigo, err.cause?.message || err.message);
    const motivo =
      codigo === "TimeoutError" || codigo === "AbortError"
        ? "o D.E.V demorou demais para responder (pode estar iniciando)."
        : codigo === "ENOTFOUND" || codigo === "EAI_AGAIN"
          ? "o endereço do D.E.V (DIARIO_API_URL) não foi encontrado."
          : codigo === "ECONNREFUSED"
            ? "o servidor do D.E.V recusou a conexão (está desligado ou o endereço/porta está errado)."
            : codigo.startsWith("ERR_TLS") || codigo.includes("CERT")
              ? "problema de certificado (https) no endereço do D.E.V."
              : `erro de conexão (${codigo || "desconhecido"}).`;
    throw new ErroDiario(`Não foi possível falar com o D.E.V: ${motivo}`, 502);
  }
  const dados = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (resp.status === 404 && !dados.msg) {
    // rota nao existe: D.E.V sem a atualizacao da integracao ou DIARIO_API_URL apontando para o lugar errado
    throw new ErroDiario("O D.E.V respondeu, mas não tem a integração com o I.A Prof (atualize o servidor do D.E.V ou confira o DIARIO_API_URL).", 502);
  }
  if (!resp.ok) throw new ErroDiario(String(dados.msg || `Erro no D.E.V (${resp.status})`), resp.status, dados);
  return dados as T;
}

export interface TurmaDiario {
  id: string;
  nome: string;
  serie: string;
  ano: string;
  turno?: string;
  escola: string;
  papel: "REGENTE" | "ED_FISICA";
}

export const diario = {
  vincular: (cpf: string, senha: string) => chamar<{ token: string; nome: string; escolas: string[] }>("POST", "/vincular", { cpf, senha }),
  turmas: (token: string, ano?: string) => chamar<{ nome: string; turmas: TurmaDiario[] }>("GET", `/turmas${ano ? `?ano=${encodeURIComponent(ano)}` : ""}`, undefined, token),
  verificarAula: (token: string, idTurma: string, data: string) =>
    chamar<{ podeRegistrar: boolean; motivo?: string; existe: boolean; id: string | null; descricao: string | null }>(
      "GET",
      `/aulas/verificar?id_turma=${encodeURIComponent(idTurma)}&data=${encodeURIComponent(data)}`,
      undefined,
      token
    ),
  registrarAula: (token: string, corpo: { id_turma: string; data: string; descricao: string; modo?: "substituir" | "juntar" }) =>
    chamar<{ ok: boolean; id: string; acao: "criada" | "substituida" | "juntada" }>("POST", "/aulas", corpo, token),
};
