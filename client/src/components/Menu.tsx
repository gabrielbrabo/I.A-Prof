// Navegacao por FERRAMENTAS: cada ferramenta e um botao no topo (celular: barra de baixo)
// com seus sub-botoes logo abaixo do cabecalho. Para uma ferramenta nova, acrescente um item em FERRAMENTAS.
export type Tela = "registro" | "plano" | "historico" | "atividade" | "atividades" | "turmas" | "assinatura" | "config";

export interface ItemFerramenta {
  id: Tela;
  rotulo: string;
  icone: string;
  tour?: string;
  curto?: string; // nome curto na barra de sub-botoes do celular
  consumo?: "baixo" | "medio" | "alto"; // quanto usa do limite de I.A (selo verde/amarelo/vermelho)
}
export interface Ferramenta {
  id: string;
  rotulo: string;
  curto: string; // nome curto (barra do celular)
  icone: string;
  itens: ItemFerramenta[];
}

export const FERRAMENTAS: Ferramenta[] = [
  {
    id: "aulas",
    rotulo: "Plano de aulas",
    curto: "Aulas",
    icone: "📚",
    itens: [
      { id: "registro", rotulo: "Gerar aula", icone: "✨", tour: "aba-registro", consumo: "baixo" },
      { id: "plano", rotulo: "Plano de curso", icone: "📘", tour: "aba-plano" },
      { id: "historico", rotulo: "Aulas salvas", icone: "🗂️", tour: "aba-historico" },
    ],
  },
  {
    id: "atividades",
    rotulo: "Atividades/Avaliações",
    curto: "Atividades/Avaliações",
    icone: "📝",
    itens: [
      { id: "atividade", rotulo: "Gerar atividade/avaliação", curto: "Gerar", icone: "✨", tour: "aba-atividade", consumo: "alto" },
      { id: "plano", rotulo: "Plano de curso", curto: "Plano", icone: "📘", tour: "aba-plano-ativ" },
      { id: "atividades", rotulo: "Atividades/avaliações e correções", curto: "Correção", icone: "✅", tour: "aba-atividades", consumo: "medio" },
      { id: "turmas", rotulo: "Turmas e alunos", curto: "Turmas", icone: "👥", tour: "aba-turmas" },
    ],
  },
];

// Ferramenta da tela. Telas que estao em mais de uma ferramenta (Plano de curso) ficam na que o professor abriu.
export const ferramentaDa = (t: Tela, preferida?: string | null) =>
  FERRAMENTAS.find((f) => f.id === preferida && f.itens.some((i) => i.id === t)) ?? FERRAMENTAS.find((f) => f.itens.some((i) => i.id === t)) ?? null;
