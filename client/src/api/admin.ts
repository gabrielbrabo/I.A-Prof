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
  devConectado: boolean;
  ultimoUso: string | null;
}
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
    dev: { nome: string | null; escolas: string[]; conectadoEm: string | null } | null;
  };
  situacao: { acesso: string; planoNome: string | null; motivo: string | null; uso: { percentual: number } } | null;
  assinatura: { planoId: string; ciclo: string; metodo: string; status: string; periodoFim: string | null; cancelarNoFim: boolean } | null;
  usos: Array<{ mes: string; custoCentavos: number; aulas: number; atividades: number; correcoes: number }>;
  aulas: AulaAdmin[];
  atividades: AtividadeAdmin[];
  planos: Array<{ _id: string; ano: string; anoLetivo: number; turma: string | null; tipoPeriodo: string; periodos: Array<{ numero: number; habilidades: number }> }>;
}

export const adminApi = {
  usuarios: (q = "") => api<LinhaAdmin[]>(`/admin/usuarios${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  usuario: (id: string) => api<DetalheAdmin>(`/admin/usuarios/${id}`),
  atividade: (id: string) => api<Atividade>(`/admin/atividades/${id}`),
};
