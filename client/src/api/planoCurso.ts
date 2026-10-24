import { api, BASE } from "./client";
import { cabecalhoAuth, lerResposta } from "../lib/sessao";

export type TipoPeriodo = "bimestre" | "trimestre" | "semestre";

export interface ItemPlano {
  componente: string;
  codigo: string | null;
  habilidade: string | null;
  conteudo: string | null;
  noBanco: boolean;
  recomposicao?: boolean; // habilidade de recomposicao (retomada de ano anterior)
  conferir?: boolean; // entrou pela rede de seguranca da leitura: conferir
  origemTexto?: "oficial" | "documento" | null; // texto oficial (BNCC/curriculo do estado) ou lido do documento
  textoOficial?: string | null; // sugestao: texto oficial quando o do PDF e quase igual (provavel erro de digitacao)
}

export interface PeriodoPlano {
  numero: number;
  inicio: string;
  fim: string;
  itens: ItemPlano[];
}

export interface PlanoCurso {
  _id?: string;
  professor?: string | null;
  turma?: string | null;
  ano: string;
  uf?: string | null;
  anoLetivo: number;
  tipoPeriodo: TipoPeriodo;
  periodos: PeriodoPlano[];
  arquivos?: string[];
  // so no plano "efetivo" (aulas e atividades): meu = cadastrado pelo professor; base = plano oficial do estado
  // (ex.: SEE-MG, por bimestre); bncc = habilidades do ano (sem divisao oficial por bimestre)
  origem?: "meu" | "base" | "bncc";
  fonte?: string | null;
}

export interface ResultadoExtracao {
  modoErrado?: ModoErrado | null;
  metodo: "sem-ia" | "ia";
  divisaoEncontrada: boolean;
  naoIdentificados: number;
  foraDaLeitura?: string[]; // codigos vistos no documento que nao entraram (conferencia)
  recuperados?: string[]; // codigos fora da coluna esperada que entraram pela rede de seguranca
  citadosFora?: string[]; // PDF em tabela: codigos citados so em outras colunas (ex.: orientacoes) — nao sao habilidades
  semPeriodo?: string[]; // ano todo: codigos sem periodo indicado no documento (nao entraram)
  avisoPeriodo?: string | null; // por periodo: documento indica outro periodo
  versaoLeitura?: string; // versao da leitura do servidor (confirma reinicio)
  arquivos: string[];
  periodos: Array<{ numero: number; itens: ItemPlano[] }>;
  total: number;
}

// Datas padrao (iguais as do servidor) — usadas na hora, sem depender da API
const DATAS_PADRAO: Record<TipoPeriodo, Array<[string, string]>> = {
  bimestre: [
    ["02-01", "04-15"],
    ["04-16", "07-10"],
    ["07-25", "09-30"],
    ["10-01", "12-20"],
  ],
  trimestre: [
    ["02-01", "05-15"],
    ["05-16", "08-31"],
    ["09-01", "12-20"],
  ],
  semestre: [
    ["02-01", "07-10"],
    ["07-25", "12-20"],
  ],
};

// Periodos novos comecam com as datas zeradas: o professor cadastra conforme o calendario da escola
export function periodosPadrao(tipo: TipoPeriodo, _anoLetivo?: number): PeriodoPlano[] {
  return DATAS_PADRAO[tipo].map((_, idx) => ({ numero: idx + 1, inicio: "", fim: "", itens: [] }));
}

// Problema nas datas de um periodo (null = ok)
export function erroDatas(p: Pick<PeriodoPlano, "inicio" | "fim">): string | null {
  if (!p.inicio || !p.fim) return "Preencha início e fim";
  if (p.inicio > p.fim) return "O início está depois do fim";
  return null;
}

// Erro da leitura: precisaIA = o arquivo so pode ser lido com I.A (o professor decide)
// Aviso de arquivo enviado na opcao errada (ano inteiro x um arquivo de cada periodo)
export interface ModoErrado {
  sugerido: "todos" | "periodo";
  mensagem: string;
}

export class ErroExtracao extends Error {
  constructor(message: string, public precisaIA: boolean, public modoErrado: ModoErrado | null = null) {
    super(message);
  }
}

export const EXTENSOES = ".pdf,.docx,.xlsx,.csv,.txt"; // foto/escaneado exigiria I.A: nao aceito no plano

export const planoApi = {
  padrao: (tipo: TipoPeriodo, anoLetivo: number) =>
    api<PeriodoPlano[]>(`/planos-curso/padrao?tipo=${tipo}&anoLetivo=${anoLetivo}`),

  // efetivo: sem plano do professor, devolve o plano oficial do estado (uf) ou as habilidades do ano (BNCC)
  obter: (ano: string, anoLetivo: number, turma?: string, opcoes?: { efetivo?: boolean; uf?: string | null; divisao?: string | null }) => {
    const qs = new URLSearchParams({ ano, anoLetivo: String(anoLetivo) });
    if (turma) qs.set("turma", turma);
    if (opcoes?.efetivo) qs.set("efetivo", "1");
    if (opcoes?.uf && /^[A-Z]{2}$/i.test(opcoes.uf)) qs.set("uf", opcoes.uf.toUpperCase());
    if (opcoes?.divisao) qs.set("divisao", opcoes.divisao);
    return api<PlanoCurso | null>(`/planos-curso?${qs.toString()}`);
  },

  // Envia os arquivos (multipart) para a I.A extrair as habilidades por periodo
  // Sem I.A por padrao. permitirIA so quando o professor autoriza (arquivo escaneado/sem codigos no ano todo).
  extrair: async (p: {
    arquivos: File[];
    ano: string;
    uf?: string;
    tipoPeriodo: TipoPeriodo;
    periodo: number | "todos";
    permitirIA?: boolean;
  }) => {
    const fd = new FormData();
    p.arquivos.forEach((a) => fd.append("arquivos", a));
    fd.append("ano", p.ano);
    fd.append("uf", p.uf ?? "");
    fd.append("tipoPeriodo", p.tipoPeriodo);
    fd.append("periodo", String(p.periodo));
    if (p.permitirIA) fd.append("permitirIA", "1");
    const resp = await fetch(`${BASE}/planos-curso/extrair`, { method: "POST", body: fd, headers: cabecalhoAuth() });
    if (resp.status === 401) await lerResposta(resp);
    const dados = (await resp.json().catch(() => ({}))) as { message?: string; precisaIA?: boolean; modoErrado?: ModoErrado };
    if (!resp.ok) throw new ErroExtracao(dados.message || `Erro ${resp.status}`, !!dados.precisaIA, dados.modoErrado ?? null);
    return dados as ResultadoExtracao;
  },

  salvar: (plano: PlanoCurso) =>
    api<{ plano: PlanoCurso; codigosCadastrados: number }>("/planos-curso", { method: "POST", body: JSON.stringify(plano) }),

  remover: (id: string) => api<void>(`/planos-curso/${id}`, { method: "DELETE" }),
};
