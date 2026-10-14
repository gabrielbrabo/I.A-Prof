import { api, BASE } from "./client";
import { cabecalhoAuth, ErroApi, lerResposta } from "../lib/sessao";

// Integracao com o Diario escolar (X Escolar)

export interface SituacaoDiario {
  disponivel: boolean; // servidor configurado para falar com o Diario
  conectado: boolean;
  nome: string | null;
  escolas: string[];
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

// Situacao da data no Diario (antes de salvar)
export interface VerificacaoDiario {
  podeRegistrar: boolean;
  motivo?: string; // por que a data nao pode receber aula (dia nao letivo, periodo fechado...)
  existe: boolean;
  id: string | null;
  descricao: string | null;
}

// Ja existe aula no Diario nesse dia: o professor escolhe substituir ou juntar
export class ErroAulaNoDiario extends ErroApi {
  constructor(message: string, public descricaoAtual: string) {
    super(message, 409);
  }
}
// Conexao com o Diario caiu: precisa conectar de novo
export class ErroReconectarDiario extends ErroApi {
  constructor(message: string) {
    super(message, 409);
  }
}

async function chamar<T>(caminho: string, metodo: string, corpo?: unknown): Promise<T> {
  const resp = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...cabecalhoAuth() },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (resp.status === 409) {
    const d = await resp.clone().json().catch(() => ({}));
    if (d.existe) throw new ErroAulaNoDiario(d.message, d.descricaoAtual ?? "");
    if (d.reconectar) throw new ErroReconectarDiario(d.message);
  }
  return lerResposta<T>(resp);
}

export const nomeTurmaDiario = (t: TurmaDiario) => `${t.serie} ${t.nome}`.replace(/\s+/g, " ").trim();

export const diarioApi = {
  status: () => api<SituacaoDiario>("/diario"),
  conectar: (cpf: string, senha: string) => chamar<SituacaoDiario>("/diario/conectar", "POST", { cpf, senha }),
  desconectar: () => api<{ conectado: false }>("/diario/conectar", { method: "DELETE" }),
  turmas: (ano?: string) => chamar<TurmaDiario[]>(`/diario/turmas${ano ? `?ano=${ano}` : ""}`, "GET"),
  verificar: (turma: string, data: string) =>
    chamar<VerificacaoDiario>(`/diario/verificar?turma=${turma}&data=${data}`, "GET"),
  enviar: (registroId: string, modo?: "substituir" | "juntar") =>
    chamar<{ ok: true; acao: "criada" | "substituida" | "juntada"; enviadoEm: string }>("/diario/enviar", "POST", { registroId, modo }),
};
