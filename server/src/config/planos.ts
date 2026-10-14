// Planos do I.A Prof. Valores em centavos.
// O limite de uso NAO e em quantidade de aulas: e um orcamento mensal de I.A (em centavos de real),
// que vale para todas as ferramentas (aulas hoje; relatorios, chamada etc. no futuro).
// O professor ve so a porcentagem usada do mes.
export interface Plano {
  id: "essencial" | "profissional" | "premium";
  nome: string;
  precoMensal: number; // centavos
  limiteIaCentavos: number; // orcamento mensal de I.A (custo real da API)
  destaque?: boolean;
  recursos: string[];
}

export const PLANOS: Plano[] = [
  {
    id: "essencial",
    nome: "Essencial",
    precoMensal: 2999,
    limiteIaCentavos: 600, // ~R$ 6 de I.A por mes
    recursos: ["Gerar aulas com habilidades do plano de curso", "Leitura do plano de curso sem custo", "Ditado por voz"],
  },
  {
    id: "profissional",
    nome: "Profissional",
    precoMensal: 5999,
    limiteIaCentavos: 1500, // ~R$ 15
    destaque: true,
    recursos: ["Tudo do Essencial", "Limite de uso 2,5x maior", "Aulas no seu formato (I.A aprende com suas aulas)"],
  },
  {
    id: "premium",
    nome: "Premium",
    precoMensal: 9999,
    limiteIaCentavos: 3200, // ~R$ 32
    recursos: ["Tudo do Profissional", "Limite de uso 5x maior que o Essencial", "Prioridade nas novas ferramentas"],
  },
];

export type Ciclo = "mensal" | "anual";
export const precoDoCiclo = (p: Plano, ciclo: Ciclo) => (ciclo === "anual" ? p.precoMensal * 10 : p.precoMensal); // anual = 2 meses gratis
export const planoPorId = (id: string) => PLANOS.find((p) => p.id === id) ?? null;

// Teste gratis: 30 dias OU 30 aulas geradas (o que acabar primeiro)
export const TESTE = { dias: 30, aulas: 30, limiteIaCentavos: 450 }; // ~R$ 0,12 por aula: 30 aulas cabem com folga
