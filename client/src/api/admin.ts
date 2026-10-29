import { api } from "./client";
import type { Atividade } from "./atividades";

// Painel admin (so leitura)
export interface LinhaAdmin {
  id: string;
  nome: string;
  email: string;
  criadoEm: string | null;
  acesso: "teste" | "assinante" | "bloqueado" | null;
  planoNome: string | null;
  usoPercentual: number;
  aulas: number;
  atividades: number;
  correcoes: number;
  planosCurso: number;
  dev: SituacaoDev;
  aulasNoDev: number;
  ultimaNoDev: string | null;
  planosComAlerta: number;
  seriesSemPlano: string[]; // series usadas no ano letivo atual sem plano de curso
  ultimoUso: string | null;
}
export type SituacaoDev = "conectado" | "conexao_antiga" | "desconectado" | "pendente" | "nunca";
export interface AulaAdmin {
  _id: string;
  data: string;
  turma: string | null;
  ano: string;
  uf: string | null;
  periodo: number | null;
  entrada: string;
  textoFinal: string;
  itens: Array<{ componente: string; conteudo: string; habilidades: Array<{ codigo: string; habilidade?: string | null }> }>;
  diarioEnviadoEm: string | null;
  createdAt: string;
}
export interface AtividadeAdmin {
  _id: string;
  titulo: string;
  componente: string;
  ano: string;
  periodo: number;
  turma: string | null;
  detalhes: string;
  origem: "ia" | "externa";
  semNota: boolean;
  valorTotal: number;
  questoes: number;
  habilidades: Array<{ codigo: string }>;
  createdAt: string;
}
export interface DetalheAdmin {
  usuario: {
    id: string;
    nome: string;
    email: string;
    criadoEm: string | null;
    testeAte: string;
    testeAulas: number;
    testeAtividades: number;
    creditosCentavos: number;
    dev: {
      situacao: SituacaoDev;
      nome: string | null;
      escolas: string[];
      conectadoEm: string | null;
      aoVivo: { ok: boolean; mensagem: string; turmas?: number } | null;
      aulasEnviadas: number;
      ultimaEnviada: string | null;
    };
  };
  situacao: { acesso: string; planoNome: string | null; motivo: string | null; uso: { percentual: number } } | null;
  assinatura: { planoId: string; ciclo: string; metodo: string; status: string; periodoFim: string | null; cancelarNoFim: boolean } | null;
  usos: Array<{ mes: string; custoCentavos: number; aulas: number; atividades: number; correcoes: number }>;
  aulas: AulaAdmin[];
  atividades: AtividadeAdmin[];
  seriesSemPlano: string[];
  planos: Array<{
    _id: string;
    ano: string;
    anoLetivo: number;
    turma: string | null;
    uf: string | null;
    tipoPeriodo: string;
    arquivos: string[];
    alertas: string[];
    forma: string; // como enviou: ano todo, um arquivo por periodo, a mao...
    periodos: Array<{ numero: number; habilidades: number; manuais: number; arquivos: string[] }>;
  }>;
  envios: Array<{
    _id: string;
    em: string | null;
    ano: string;
    anoLetivo: number | null;
    turma: string | null;
    tipoPeriodo: string;
    modo: "ano" | "periodo";
    periodoEscolhido: number | null;
    arquivos: string[];
    periodosNoDocumento: number[];
    periodosLidos: number[];
    habilidades: number;
    resultado: "ok" | "recusado";
    mensagem: string | null;
  }>;
}

export const adminApi = {
  usuarios: (q = "") => api<LinhaAdmin[]>(`/admin/usuarios${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  usuario: (id: string) => api<DetalheAdmin>(`/admin/usuarios/${id}`),
  atividade: (id: string) => api<Atividade>(`/admin/atividades/${id}`),
};
