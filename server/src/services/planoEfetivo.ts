import { PlanoCurso } from "../models/PlanoCurso";
import { PlanoBase } from "../models/PlanoBase";
import { Habilidade } from "../models/Habilidade";
import { nomeAno } from "../utils/anos";

// De onde vem as habilidades da aula/atividade, nesta ordem:
//  1. "meu":  o plano de curso que o professor cadastrou (como sempre foi)
//  2. "base": o plano de curso OFICIAL do estado, por periodo (ex.: SEE-MG) — exato por bimestre
//  3. "bncc": habilidades do ANO (curriculo do estado ou BNCC); sem divisao oficial por periodo,
//             a I.A escolhe a habilidade que combina com o conteudo da aula
export type OrigemPlano = "meu" | "base" | "bncc";
export interface ItemEfetivo {
  componente: string;
  codigo: string | null;
  habilidade: string | null;
  conteudo?: string | null;
  recomposicao?: boolean;
  noBanco?: boolean;
}
export interface PlanoEfetivo {
  _id?: unknown;
  ano: string;
  anoLetivo: number;
  uf: string | null;
  tipoPeriodo: "bimestre" | "trimestre" | "semestre";
  periodos: Array<{ numero: number; inicio: string; fim: string; itens: ItemEfetivo[] }>;
  turma?: string | null;
  origem: OrigemPlano;
  fonte: string | null; // ex.: "Plano de Curso SEE-MG 2026", "BNCC"
}

export async function planoEfetivo(p: { usuario: string; ano: string; anoLetivo: number; turma?: string | null; uf?: string | null }): Promise<PlanoEfetivo | null> {
  // 1. plano do professor
  const meu =
    (p.turma ? await PlanoCurso.findOne({ usuario: p.usuario, ano: p.ano, anoLetivo: p.anoLetivo, turma: p.turma }).lean() : null) ??
    (await PlanoCurso.findOne({ usuario: p.usuario, ano: p.ano, anoLetivo: p.anoLetivo }).sort({ updatedAt: -1 }).lean());
  if (meu) return { ...(meu as unknown as PlanoEfetivo), origem: "meu", fonte: null };

  const uf = p.uf && /^[A-Z]{2}$/i.test(p.uf) ? p.uf.toUpperCase() : null;
  // 2. plano oficial do estado (o mais recente ate o ano letivo pedido; senao o mais recente)
  if (uf) {
    const base =
      (await PlanoBase.findOne({ uf, ano: p.ano, anoLetivo: { $lte: p.anoLetivo } }).sort({ anoLetivo: -1 }).lean()) ??
      (await PlanoBase.findOne({ uf, ano: p.ano }).sort({ anoLetivo: -1 }).lean());
    if (base) {
      return {
        ano: p.ano,
        anoLetivo: p.anoLetivo,
        uf,
        tipoPeriodo: base.tipoPeriodo as PlanoEfetivo["tipoPeriodo"],
        periodos: base.periodos.map((x) => ({ numero: x.numero, inicio: "", fim: "", itens: x.itens.map((i) => ({ ...i, noBanco: true })) })),
        origem: "base",
        fonte: base.fonte,
      };
    }
  }

  // 3. habilidades do ano: curriculo do estado (se importado) ou BNCC — o mesmo conjunto em todos os periodos
  // vale para todas as series: Educacao Infantil (EI01-03), 1o ao 9o ano e Ensino Medio
  if (!p.ano) return null;
  const doEstado = uf ? await Habilidade.find({ anos: p.ano, uf }).lean() : [];
  const lista = doEstado.length ? doEstado : await Habilidade.find({ anos: p.ano, uf: null }).lean();
  if (!lista.length) return null;
  const itens: ItemEfetivo[] = lista
    .map((h) => ({ componente: h.componente, codigo: h.codigo, habilidade: h.habilidade, conteudo: h.objetoConhecimento ?? null, noBanco: true }))
    .sort((a, b) => a.componente.localeCompare(b.componente, "pt-BR") || String(a.codigo).localeCompare(String(b.codigo)));
  return {
    ano: p.ano,
    anoLetivo: p.anoLetivo,
    uf,
    tipoPeriodo: "bimestre",
    periodos: [1, 2, 3, 4].map((numero) => ({ numero, inicio: "", fim: "", itens })),
    origem: "bncc",
    fonte: doEstado.length ? `Currículo de ${uf} (${nomeAno(p.ano)})` : `BNCC (${nomeAno(p.ano)})`,
  };
}
