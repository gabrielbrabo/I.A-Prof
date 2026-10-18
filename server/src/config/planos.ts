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
    precoMensal: 3999,
    limiteIaCentavos: 1600, // ~R$ 16 de I.A por mes
    recursos: ["Gerar aulas com habilidades do plano de curso", "Gerar atividades com gabarito e corrigir à mão", "Leitura do plano de curso sem custo", "Ditado por voz"],
  },
  {
    id: "profissional",
    nome: "Profissional",
    precoMensal: 6999,
    limiteIaCentavos: 3000, // ~R$ 30
    destaque: true,
    recursos: ["Tudo do Essencial", "📷 Correção de atividades com foto (a I.A corrige pelo gabarito)", "Limite de uso quase 2x maior que o Essencial", "Aulas no seu formato (I.A aprende com suas aulas)"],
  },
  {
    id: "premium",
    nome: "Premium",
    precoMensal: 10999,
    limiteIaCentavos: 5500, // ~R$ 55
    recursos: ["Tudo do Profissional", "Limite de uso quase 2x maior que o Profissional (3,4x o Essencial)", "Prioridade nas novas ferramentas"],
  },
];

export type Ciclo = "mensal" | "anual";
export const precoDoCiclo = (p: Plano, ciclo: Ciclo) => (ciclo === "anual" ? p.precoMensal * 10 : p.precoMensal); // anual = 2 meses gratis
export const planoPorId = (id: string) => PLANOS.find((p) => p.id === id) ?? null;

// Teste gratis: 30 dias, com 30 aulas e 7 atividades (cada ajuste tambem conta como 1).
// Aulas acabam com 30 aulas OU 30 dias; atividades com 7 atividades OU 30 dias (o que vier primeiro).
// No teste e no Essencial: gerar, corrigir a mao e lancar notas; a correcao com foto (I.A) e do Profissional e Premium.
// Orcamento: 30 aulas (~R$ 0,12 = R$ 3,60) + 7 atividades/ajustes (~R$ 0,64 = R$ 4,48) = ~R$ 8,10; R$ 10 da folga.
export const TESTE = { dias: 30, aulas: 30, atividades: 7, limiteIaCentavos: 1000 };
