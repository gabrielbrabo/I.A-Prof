import { api, BASE } from "./client";
import { cabecalhoAuth, lerResposta } from "../lib/sessao";

// Ferramenta de atividades (gerar, gabarito, correcao, notas)

export type TipoQuestao = "multipla" | "vf" | "discursiva" | "completar";
export const TIPOS_QUESTAO: Record<TipoQuestao, string> = {
  multipla: "Marcar X (múltipla escolha)",
  vf: "Verdadeiro ou falso",
  discursiva: "Discursiva",
  completar: "Completar / resposta curta",
};
export const TIPOS_DEV = ["Normal", "Prova", "Trabalho", "Outra Atividade"] as const;
export type TipoDev = (typeof TIPOS_DEV)[number];

export interface Figura {
  tipo: "" | "emoji" | "svg";
  conteudo: string;
}
export interface ImagemAtividade {
  id: string;
  nome: string;
  dataUrl: string;
}
export interface Cabecalho {
  escola: string;
  logo: string;
  campos: string[];
}
export interface Estilo {
  fonte: "normal" | "grande" | "extra";
  colorido: boolean;
  caixaAlta?: boolean; // letra bastao
  layout?: "compacto" | "normal" | "amplo"; // aproveitamento da folha
  imagem?: "pequena" | "media" | "grande"; // tamanho das imagens
  colunas?: boolean; // alternativas em 2 colunas
}
// Texto de apoio (leitura e interpretacao)
export interface PontosPeriodo {
  total: number; // 0 = sem limite cadastrado
  usadoDev: number;
  pendente: number;
  restante: number | null;
  aberto: boolean;
}
export interface TextoBase {
  titulo: string;
  conteudo: string;
  imagem: string;
  posicao?: "topo" | "direita" | "esquerda"; // imagem do texto: em cima, ou ao lado com o texto contornando
}
export const CAMPOS_CABECALHO: Array<{ id: string; nome: string }> = [
  { id: "escola", nome: "Escola" },
  { id: "professor", nome: "Professor(a)" },
  { id: "turma", nome: "Turma" },
  { id: "aluno", nome: "Aluno(a)" },
  { id: "data", nome: "Data" },
  { id: "nota", nome: "Nota" },
  { id: "serie", nome: "Série/ano" },
  { id: "periodo", nome: "Período" },
];
// serie e periodo so aparecem se o professor marcar/pedir
export const cabecalhoPadrao = (): Cabecalho => ({ escola: "", logo: "", campos: ["escola", "professor", "turma", "aluno", "data", "nota"] });
export const estiloPadrao = (): Estilo => ({ fonte: "normal", colorido: false, caixaAlta: false, layout: "normal", imagem: "media", colunas: false });
// SVG da I.A mostrado como imagem (o navegador nao roda script dentro de <img>)
export const svgParaSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export interface Questao {
  _id?: string;
  tipo: TipoQuestao;
  enunciado: string;
  alternativas: string[];
  itens: Array<{ texto: string; resposta: "V" | "F" }>;
  resposta: string;
  criterios: string;
  valor: number;
  imagem?: string;
  figura?: Figura;
  linhas?: number; // linhas para resposta (0 = automatico)
}

export interface Atividade {
  _id?: string;
  ano: string;
  uf: string | null;
  anoLetivo: number;
  periodo: number;
  componente: string;
  turma: string | null;
  turmaId: string | null;
  diarioTurmaId: string | null;
  diarioMateriaId: string | null;
  tipoDev: TipoDev;
  detalhes: string;
  titulo: string;
  instrucoes: string;
  questoes: Questao[];
  habilidades: Array<{ codigo: string; habilidade: string }>;
  valorTotal: number;
  imagens?: ImagemAtividade[];
  cabecalho?: Cabecalho;
  estilo?: Estilo;
  texto?: TextoBase;
  diario?: { atividadeId: string | null; enviadoEm: string | null };
  createdAt?: string;
  corrigidas?: number;
  aprovadas?: number;
}

export interface RespostaAluno {
  questao: string;
  resposta: string;
  itens: string[];
  pontos: number;
  comentario: string;
  duvida: boolean;
}
export interface Correcao {
  _id: string;
  alunoId: string;
  alunoNome: string;
  metodo: "manual" | "ia";
  respostas: RespostaAluno[];
  nota: number;
  nomeLido: string | null;
  status: "corrigida" | "aprovada";
  enviadaDiarioEm: string | null;
}

export interface AlunosAtividade {
  fonte: "dev" | "turma" | "nenhuma";
  alunos: Array<{ id: string; nome: string }>;
  dev: {
    materias: Array<{ id: string; nome: string }>;
    periodos: Array<{ label: string; aberto: boolean; totalPontos: number }>;
    papel: string;
    notas?: boolean; // false = Educacao Infantil: notas ficam so no I.A Prof
  } | null;
  correcoes: Correcao[];
}

export interface Turma {
  _id: string;
  nome: string;
  ano: string | null;
  anoLetivo: number | null;
  alunos: Array<{ id: string; nome: string }>;
}

export const letra = (i: number) => String.fromCharCode(65 + i);
const arred = (n: number) => Math.round(n * 100) / 100;

// Mesma regra do servidor: objetivas pelo gabarito; discursiva/completar pelos pontos dados
export function pontuar(q: Questao, r: Pick<RespostaAluno, "resposta" | "itens" | "pontos">): number {
  if (q.tipo === "multipla") return q.resposta && r.resposta.trim().toUpperCase() === q.resposta.toUpperCase() ? q.valor : 0;
  if (q.tipo === "vf") {
    if (!q.itens.length) return 0;
    const certos = q.itens.filter((it, i) => (r.itens[i] || "").toUpperCase() === it.resposta).length;
    return arred((q.valor * certos) / q.itens.length);
  }
  return arred(Math.min(q.valor, Math.max(0, Number(r.pontos) || 0)));
}

// Distribui o total entre as questoes, proporcional aos valores atuais (1 casa decimal)
export function ajustarValores(questoes: Questao[], total: number): Questao[] {
  if (!questoes.length || !(total > 0)) return questoes;
  const soma = questoes.reduce((s, q) => s + (Number(q.valor) || 0), 0);
  const base = soma > 0 ? questoes.map((q) => (Number(q.valor) || 0) / soma) : questoes.map(() => 1 / questoes.length);
  const novos = base.map((b) => Math.round(b * total * 10) / 10);
  const dif = Math.round((total - novos.reduce((s, v) => s + v, 0)) * 10) / 10;
  novos[novos.length - 1] = Math.max(0, Math.round((novos[novos.length - 1] + dif) * 10) / 10);
  return questoes.map((q, i) => ({ ...q, valor: novos[i] }));
}
export const somaValores = (qs: Questao[]) => arred(qs.reduce((s, q) => s + (Number(q.valor) || 0), 0));
export const fmtNum = (n: number) => String(arred(n)).replace(".", ",");

export const atividadesApi = {
  gerar: (b: {
    ano: string;
    anoLetivo: number;
    periodo: number;
    componente: string;
    turma: string | null;
    detalhes: string;
    valorTotal: number;
    habilidades: string[];
    imagens?: ImagemAtividade[]; // miniaturas
    respostas?: string | null;
    atual?: Record<string, unknown> | null;
    ajuste?: string | null;
    escola?: string | null;
    professor?: string | null;
    diarioTurmaId?: string | null; // D.E.V: o servidor confere os pontos do periodo
    diarioMateriaId?: string | null;
    atividadeId?: string | null;
  }) =>
    api<{
      status: "pronta" | "perguntas";
      perguntas: string[];
      titulo: string;
      instrucoes: string;
      questoes: Questao[];
      habilidades: Atividade["habilidades"];
      usouPlano: boolean;
      cabecalho?: Cabecalho;
      estilo?: Estilo;
      texto?: TextoBase;
      imagensIA?: ImagemAtividade[]; // ilustracoes geradas pela I.A de imagem
    }>("/atividades/gerar", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  listar: () => api<Atividade[]>("/atividades"),
  // pontos do periodo no D.E.V (ja lancado + salvo aqui e nao lancado)
  pontosPeriodo: (q: { turma: string; periodo: number; materia: string; excluir?: string | null }) =>
    api<PontosPeriodo>(`/atividades/pontos-periodo?${new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString()}`),
  // o que a I.A ja aprendeu do jeito do professor
  preferencias: () => api<{ texto: string; salvas: number; ajustes: number }>("/atividades/preferencias"),
  esquecerPreferencias: () => api<{ ok: boolean }>("/atividades/preferencias", { method: "DELETE" }),
  obter: (id: string) => api<Atividade>(`/atividades/${id}`),
  salvar: (a: Atividade) =>
    a._id ? api<Atividade>(`/atividades/${a._id}`, { method: "PUT", body: JSON.stringify(a) }) : api<Atividade>("/atividades", { method: "POST", body: JSON.stringify(a) }),
  remover: (id: string) => api<void>(`/atividades/${id}`, { method: "DELETE" }),
  alunos: (id: string) => api<AlunosAtividade>(`/atividades/${id}/alunos`),
  pontos: (id: string) => api<{ total: number; usado: number; restante: number | null; aberto: boolean } | null>(`/atividades/${id}/pontos`),
  salvarCorrecao: (id: string, alunoId: string, b: { alunoNome: string; respostas: RespostaAluno[]; aprovar: boolean; metodo?: "manual" | "ia" }) =>
    api<Correcao>(`/atividades/${id}/correcoes/${encodeURIComponent(alunoId)}`, { method: "PUT", body: JSON.stringify(b) }),
  removerCorrecao: (id: string, alunoId: string) => api<void>(`/atividades/${id}/correcoes/${encodeURIComponent(alunoId)}`, { method: "DELETE" }),
  async corrigirFoto(id: string, alunoId: string, alunoNome: string, fotos: Blob[]): Promise<Correcao> {
    const fd = new FormData();
    fd.append("alunoNome", alunoNome);
    fotos.forEach((f, i) => fd.append("fotos", f, `pagina-${i + 1}.jpg`));
    const resp = await fetch(`${BASE}/atividades/${id}/correcoes/${encodeURIComponent(alunoId)}/foto`, { method: "POST", headers: cabecalhoAuth(), body: fd });
    return lerResposta<Correcao>(resp);
  },
  lancar: (id: string) =>
    api<{ destino: "dev" | "iaprof"; lancadas: number; criadas?: number; atualizadas?: number }>(`/atividades/${id}/lancar`, { method: "POST" }),
};

export const turmasApi = {
  listar: () => api<Turma[]>("/turmas"),
  salvar: (b: { _id?: string; nome: string; ano: string | null; anoLetivo: number | null; alunosTexto: string }) =>
    b._id ? api<Turma>(`/turmas/${b._id}`, { method: "PUT", body: JSON.stringify(b) }) : api<Turma>("/turmas", { method: "POST", body: JSON.stringify(b) }),
  remover: (id: string) => api<void>(`/turmas/${id}`, { method: "DELETE" }),
};

// Reduz a foto no aparelho antes de enviar (mais rapido e gasta menos I.A): lado maior 1600px, JPEG
export async function reduzirFoto(arquivo: File, lado = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo);
    const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * escala);
    c.height = Math.round(bmp.height * escala);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? arquivo), "image/jpeg", 0.82));
  } catch {
    return arquivo;
  }
}

// Imagem do computador do professor -> data URL reduzida (lado maior `lado` px). PNG continua PNG (logo com fundo transparente).
export async function imagemParaDataUrl(arquivo: Blob, lado = 1000): Promise<string> {
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * escala));
  c.height = Math.max(1, Math.round(bmp.height * escala));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return arquivo.type === "image/png" ? c.toDataURL("image/png") : c.toDataURL("image/jpeg", 0.85);
}
// Miniatura (para a I.A ver o que e a imagem gastando pouco)
export async function miniatura(dataUrl: string, lado = 384): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const escala = Math.min(1, lado / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * escala));
  c.height = Math.max(1, Math.round(bmp.height * escala));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
