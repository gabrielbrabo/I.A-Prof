import { api, BASE } from "./client";
import { cabecalhoAuth, ErroApi, lerResposta } from "../lib/sessao";

// Integracao com o Diario escolar (X Escolar)

export interface SituacaoDiario {
  disponivel: boolean; // servidor configurado para falar com o Diario
  conectado: boolean;
  nome: string | null;
  escolas: string[];
  pedido?: PedidoConexao | null; // aguardando o professor aprovar dentro do D.E.V
}

// Pedido de conexao: o e-mail da conta do I.A Prof e diferente do D.E.V; o professor aprova no D.E.V em ate 5 minutos
export interface PedidoConexao {
  id: string;
  expiraEm: string;
  agora: string; // relogio do servidor (o contador nao depende do relogio do aparelho)
  emailDev: string; // e-mail do D.E.V mascarado
}
export type RespostaConectar =
  | { conectado: true; nome: string; escolas: string[] }
  | { conectado: false; pendente: true; pedido: PedidoConexao; nomeDev: string };
export type SituacaoPedido =
  | { status: "conectado"; nome: string | null; escolas: string[] }
  | { status: "pendente"; pedido: PedidoConexao }
  | { status: "expirado" | "cancelado" | "nenhum" };

export interface TurmaDiario {
  id: string;
  nome: string;
  serie: string;
  ano: string;
  turno?: string;
  escola: string;
  papel: "REGENTE" | "ED_FISICA";
  nivel?: string;
  notas?: boolean; // false = escola com conceitos (Educacao Infantil): atividades/notas ficam so no I.A Prof
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
  const pedir = () =>
    fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", ...cabecalhoAuth() },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  let resp: Response;
  try {
    resp = await pedir();
  } catch (e) {
    // queda de rede momentanea: consultas tentam de novo uma vez
    if (metodo !== "GET") throw new ErroApi("Sem conexão com o servidor. Confira a internet e tente de novo.", 0);
    await new Promise((r) => setTimeout(r, 2000));
    resp = await pedir().catch(() => {
      throw new ErroApi("Sem conexão com o servidor. Confira a internet e tente de novo.", 0);
    });
    void e;
  }
  if (resp.status === 409) {
    const d = await resp.clone().json().catch(() => ({}));
    if (d.existe) throw new ErroAulaNoDiario(d.message, d.descricaoAtual ?? "");
    if (d.reconectar) throw new ErroReconectarDiario(d.message);
  }
  return lerResposta<T>(resp);
}

export interface AlunosDiario {
  papel: "REGENTE" | "ED_FISICA";
  alunos: Array<{ id: string; nome: string }>;
  materias: Array<{ id: string; nome: string }>;
  periodos: Array<{ label: string; aberto: boolean; totalPontos: number }>;
  notas?: boolean;
  nivel?: string;
}

// Serie do D.E.V ("4º ANO", "1ª SÉRIE EM", "PRÉ II") -> valor da serie no I.A Prof ("4", "EM", "EI03")
export function anoDaSerie(serie: string | null | undefined): string | null {
  const s = (serie ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (!s) return null;
  if (/MEDIO|\bEM\b|SERIE/.test(s)) return "EM";
  if (/PRE|INFANTIL\s*(4|5)|4\s*ANOS|5\s*ANOS/.test(s)) return "EI03";
  if (/BERCARIO|BEBE|\b0\s*A\s*1/.test(s)) return "EI01";
  if (/MATERNAL|CRECHE|\b[23]\s*ANOS/.test(s)) return "EI02";
  const m = s.match(/\b([1-9])\s*(º|°|O|ª)?\s*ANO/);
  return m ? m[1] : null;
}
export const nomeTurmaDiario = (t: TurmaDiario) => `${t.serie} ${t.nome}`.replace(/\s+/g, " ").trim();

export const diarioApi = {
  status: () => api<SituacaoDiario>("/diario"),
  conectar: (cpf: string, senha: string) => chamar<RespostaConectar>("/diario/conectar", "POST", { cpf, senha }),
  pedido: () => chamar<SituacaoPedido>("/diario/pedido", "GET"),
  cancelarPedido: () => api<{ ok: true }>("/diario/pedido", { method: "DELETE" }),
  desconectar: () => api<{ conectado: false }>("/diario/conectar", { method: "DELETE" }),
  turmas: (ano?: string) => chamar<TurmaDiario[]>(`/diario/turmas${ano ? `?ano=${ano}` : ""}`, "GET"),
  verificar: (turma: string, data: string) =>
    chamar<VerificacaoDiario>(`/diario/verificar?turma=${turma}&data=${data}`, "GET"),
  alunos: (idTurma: string) => chamar<AlunosDiario>(`/diario/turmas/${idTurma}/alunos`, "GET"),
  enviar: (registroId: string, modo?: "substituir" | "juntar") =>
    chamar<{ ok: true; acao: "criada" | "substituida" | "juntada"; enviadoEm: string }>("/diario/enviar", "POST", { registroId, modo }),
};
