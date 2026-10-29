import { api, BASE } from "./client";
import { cabecalhoAuth, ErroApi, lerResposta } from "../lib/sessao";

// Ja existe aula salva no mesmo dia (mesma serie/turma)
export class ErroAulaNoDia extends ErroApi {
  constructor(message: string, public existente: { _id: string; data: string; textoFinal: string; periodo?: number | null }) {
    super(message, 409);
  }
}

export interface Opcao {
  codigo: string;
  habilidade: string;
  fonte: string;
}

export interface HabilidadeItem {
  codigo: string;
  habilidade: string;
  fonte: string; // PLANO ou RECOMPOSIÇÃO
  objeto?: string | null; // objeto de conhecimento (quando vai no texto do diario)
}

export interface ItemRegistro {
  componente: string;
  conteudo: string;
  habilidades: HabilidadeItem[]; // uma ou mais habilidades do plano do periodo
  revisar: boolean;
  confianca: "alta" | "baixa" | "memoria"; // baixa = palpite (texto generico); memoria = igual a um registro anterior
  candidatas: Opcao[];
  alterada?: boolean; // so na tela: o professor editou as habilidades e precisa confirmar de novo
}

export interface InfoPlano {
  usado: boolean;
  tipoPeriodo: string | null;
  periodo: number | null;
  habilidadesNoPeriodo: number;
  origem?: "meu" | "base" | "bncc";
  fonte?: string | null;
}

export interface ResultadoGerar {
  plano: InfoPlano;
  abertura?: string[]; // momentos sem componente (Acolhida, Rotina diaria...)
  textoEstilo?: string | null; // texto no formato das aulas anteriores do professor
  itens: ItemRegistro[];
  textoFinal: string;
  compactado: boolean;
  excede: boolean;
}

export interface ConfigLimites {
  limiteEntrada: number;
  limiteRegistro: number; // 0 = sem limite
}

export const configApi = {
  get: () => api<ConfigLimites>("/config"),
};

export interface RegistroSalvo {
  _id: string;
  anoLetivo?: number | null;
  periodo?: number | null;
  itens?: Array<{
    componente: string;
    conteudo: string;
    habilidades?: Array<{ codigo: string; habilidade?: string | null }>;
    conferir?: boolean; // palpite da I.A ainda nao conferido
    codigo?: string | null; // registros antigos (antes de varias habilidades)
    habilidade?: string | null;
  }>;
  professor?: string | null;
  turma?: string | null;
  ano: string;
  uf?: string | null;
  divisao?: string | null; // divisao do ano (sem plano do professor)
  data: string;
  entrada: string;
  textoFinal: string;
  textoEditado?: boolean; // texto final editado a mao
  abertura?: string[];
  diarioTurmaId?: string | null;
  diarioEnviadoEm?: string | null; // enviada ao Diario escolar
  diarioRegistroId?: string | null; // id da aula no Diario
  createdAt: string;
}

// Tipo do corpo de salvar (reaproveitado em atualizar)
export type CorpoSalvar = {
  professor?: string;
  turma?: string;
  diarioTurmaId?: string | null; // turma escolhida do Diario escolar
  ano: string;
  uf?: string | null;
  data: string;
  entrada: string;
  anoLetivo?: number;
  periodo?: number;
  limiteSaida?: number | null;
  textoManual?: string | null;
  duplicado?: "substituir" | "juntar" | "nova";
  abertura?: string[];
  itens: Array<{ componente: string; conteudo: string; habilidades: Array<{ codigo: string; habilidade: string; objeto?: string | null }>; conferir?: boolean }>;
};

export const registroApi = {
  gerar: (body: {
    texto: string;
    ano: string;
    uf?: string | null;
    divisao?: string | null;
    turma?: string | null;
    data?: string | null;
    anoLetivo: number;
    periodo: number;
    limiteSaida?: number | null;
  }) =>
    api<ResultadoGerar>("/registro-aula/gerar", { method: "POST", body: JSON.stringify(body) }),

  // 409 = ja existe aula no mesmo dia: lanca ErroAulaNoDia para o professor escolher (substituir/juntar/nova)
  salvar: async (body: CorpoSalvar) => {
    const resp = await fetch(`${BASE}/registro-aula`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabecalhoAuth() },
      body: JSON.stringify(body),
    });
    if (resp.status === 409) {
      const dados = await resp.clone().json().catch(() => ({}));
      if (dados.conflito) throw new ErroAulaNoDia(dados.message, dados.existente);
    }
    return lerResposta<RegistroSalvo>(resp);
  },

  atualizar: (id: string, body: CorpoSalvar) =>
    api<RegistroSalvo>(`/registro-aula/${id}`, { method: "PUT", body: JSON.stringify(body) }),

  listar: (turma?: string) =>
    api<RegistroSalvo[]>(`/registro-aula${turma ? `?turma=${encodeURIComponent(turma)}` : ""}`),

  remover: (id: string) => api<void>(`/registro-aula/${id}`, { method: "DELETE" }),

  // Reescreve o texto final no formato das aulas do professor (usa I.A)
  formatar: (body: {
    ano: string;
    turma?: string | null;
    abertura: string[];
    limiteSaida?: number | null;
    itens: Array<{ componente: string; conteudo: string; habilidades: Array<{ codigo: string; habilidade: string }> }>;
  }) => api<{ texto: string }>("/registro-aula/formatar", { method: "POST", body: JSON.stringify(body) }),
};

export const habilidadeApi = {
  ufs: () => api<string[]>("/habilidades/ufs"),
  componentes: (ano: string, uf?: string | null) =>
    api<string[]>(`/habilidades/componentes?ano=${encodeURIComponent(ano)}${uf ? `&uf=${uf}` : ""}`),
  buscar: (p: { ano: string; componente: string; uf?: string | null; q?: string }) => {
    const qs = new URLSearchParams({ ano: p.ano, componente: p.componente });
    if (p.uf) qs.set("uf", p.uf);
    if (p.q) qs.set("q", p.q);
    return api<Opcao[]>(`/habilidades?${qs.toString()}`);
  },
};
