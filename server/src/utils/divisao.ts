// Divisao do ano letivo (rede estadual) por UF — usada quando o professor NAO tem plano de curso cadastrado.
// Conferido nos calendarios oficiais de 2026: MG, ES, PR e RS em trimestres. Os demais ficam em bimestres
// (o professor pode trocar em Configuracoes, ex.: escola municipal com outra divisao).
export type TipoPeriodo = "bimestre" | "trimestre" | "semestre";
export const DIVISAO_POR_UF: Record<string, TipoPeriodo> = { MG: "trimestre", ES: "trimestre", PR: "trimestre", RS: "trimestre" };
export const QTD_PERIODOS: Record<TipoPeriodo, number> = { bimestre: 4, trimestre: 3, semestre: 2 };
export const ehTipoPeriodo = (v: unknown): v is TipoPeriodo => v === "bimestre" || v === "trimestre" || v === "semestre";
export function divisaoDaUf(uf?: string | null, escolhida?: string | null): TipoPeriodo {
  if (ehTipoPeriodo(escolhida)) return escolhida;
  return DIVISAO_POR_UF[(uf ?? "").toUpperCase()] ?? "bimestre";
}
