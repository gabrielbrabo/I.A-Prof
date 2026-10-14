import { env, diarioLigado } from "../config/env";

// Cliente da API do Diario escolar (X Escolar). Servidor -> servidor: a chave fica so aqui no backend.
export class ErroDiario extends Error {
  constructor(message: string, public status: number, public dados: Record<string, unknown> = {}) {
    super(message);
  }
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown, token?: string): Promise<T> {
  if (!diarioLigado()) throw new ErroDiario("Integração com o Diário escolar não configurada no servidor.", 503);
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
  } catch {
    throw new ErroDiario("Não foi possível falar com o Diário escolar agora. Tente de novo em instantes.", 502);
  }
  const dados = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) throw new ErroDiario(String(dados.msg || `Erro no Diário (${resp.status})`), resp.status, dados);
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
