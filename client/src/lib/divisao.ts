import { lerPref } from "./prefs";

// Divisao do ano letivo quando o professor NAO tem plano de curso cadastrado.
// Padrao = rede estadual da UF (calendarios oficiais 2026: MG, ES, PR e RS em trimestres; demais em bimestres).
// O professor pode trocar em Configuracoes (ex.: escola municipal com outra divisao).
export type Divisao = "bimestre" | "trimestre" | "semestre";
export const DIVISAO_POR_UF: Record<string, Divisao> = { MG: "trimestre", ES: "trimestre", PR: "trimestre", RS: "trimestre" };
export const ehDivisao = (v: unknown): v is Divisao => v === "bimestre" || v === "trimestre" || v === "semestre";
export const divisaoDaUf = (uf?: string | null): Divisao => DIVISAO_POR_UF[(uf ?? "").toUpperCase()] ?? "bimestre";
// a escolhida em Configuracoes; senao a da UF
export function divisaoAtual(): Divisao {
  const d = lerPref("divisao", "");
  return ehDivisao(d) ? d : divisaoDaUf(lerPref("uf", ""));
}
