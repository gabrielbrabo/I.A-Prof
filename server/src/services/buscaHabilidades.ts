import { Habilidade } from "../models/Habilidade";

export interface Candidata {
  codigo: string;
  habilidade: string;
  fonte: string;
  uf: string | null;
  objetoConhecimento: string | null;
  unidadeTematica: string | null;
}

// Palavras sem peso na busca
const STOP = new Set(
  "a o e de da do das dos em no na nos nas um uma para por com sem que se ao aos as os seu sua ou como entre sobre mais".split(" ")
);

export function normalizar(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
}

function tokens(txt: string): string[] {
  return normalizar(txt)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => (t.length > 5 ? t.slice(0, 5) : t)); // radical simples: multiplicacao ~ multiplicar
}

// Filtro base: ano + (BNCC nacional OU curriculo da UF escolhida)
export function filtroBase(ano: string, uf?: string | null) {
  const origens: Array<Record<string, unknown>> = [{ uf: null }];
  if (uf) origens.push({ uf: uf.toUpperCase() });
  return { anos: ano, $or: origens };
}

export async function listarComponentes(ano: string, uf?: string | null): Promise<string[]> {
  const lista = (await Habilidade.distinct("componente", filtroBase(ano, uf))) as string[];
  return lista.sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Ranqueia as habilidades do componente/ano pela semelhanca com o conteudo da aula
export async function buscarCandidatas(params: {
  ano: string;
  uf?: string | null;
  componente: string;
  consulta: string;
  limite?: number;
}): Promise<Candidata[]> {
  const docs = await Habilidade.find({ ...filtroBase(params.ano, params.uf), componente: params.componente }).lean();
  const q = new Set(tokens(params.consulta));

  const pontuadas = docs.map((d) => {
    const obj = new Set(tokens(`${d.objetoConhecimento ?? ""} ${d.unidadeTematica ?? ""}`));
    const hab = new Set(tokens(d.habilidade));
    let score = 0;
    for (const t of q) {
      if (obj.has(t)) score += 3;
      if (hab.has(t)) score += 1;
    }
    if (d.uf) score += 0.5; // leve preferencia pelo curriculo local
    return { d, score };
  });

  pontuadas.sort((a, b) => b.score - a.score || a.d.codigo.localeCompare(b.d.codigo));
  return pontuadas.slice(0, params.limite ?? 60).map(({ d }) => ({
    codigo: d.codigo,
    habilidade: d.habilidade,
    fonte: d.fonte,
    uf: d.uf ?? null,
    objetoConhecimento: d.objetoConhecimento ?? null,
    unidadeTematica: d.unidadeTematica ?? null,
  }));
}
