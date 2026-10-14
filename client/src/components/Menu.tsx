// Navegacao por FERRAMENTAS: cada ferramenta e um botao no topo (celular: barra de baixo)
// com seus sub-botoes logo abaixo do cabecalho. Para uma ferramenta nova, acrescente um item em FERRAMENTAS.
export type Tela = "registro" | "plano" | "historico" | "assinatura";

export interface ItemFerramenta {
  id: Tela;
  rotulo: string;
  icone: string;
  tour?: string;
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
      { id: "registro", rotulo: "Gerar aula", icone: "✨", tour: "aba-registro" },
      { id: "plano", rotulo: "Plano de curso", icone: "📘", tour: "aba-plano" },
      { id: "historico", rotulo: "Aulas salvas", icone: "🗂️", tour: "aba-historico" },
    ],
  },
];

export const ferramentaDa = (t: Tela) => FERRAMENTAS.find((f) => f.itens.some((i) => i.id === t)) ?? null;
