export interface HabilidadeFormatavel {
  codigo: string;
  habilidade?: string | null;
}

export interface ItemFormatavel {
  componente: string;
  conteudo: string;
  habilidades?: HabilidadeFormatavel[]; // uma ou mais habilidades do item
}

export interface TextoFormatado {
  texto: string;
  compactado: boolean; // true = alguma descricao foi removida (ficou so o codigo) para caber no limite
  excede: boolean; // true = mesmo compactado passou do limite
}

// Monta o texto no padrao do diario:
// "Lingua Portuguesa: Conteudo -(EF35LP03) Descricao. -(EF15LP03) Descricao./ -Matematica: Conteudo -(CODIGO) Descricao"
// (mesma regra do backend em server/src/utils/formatarRegistro.ts)
// Momentos da aula sem componente (ex.: "Acolhida.", "Rotina diária.") vao no inicio, na ordem do professor.
function textoAbertura(abertura?: string[] | null): string {
  return (abertura ?? [])
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => (/[.!?:;]$/.test(a) ? a : `${a}.`))
    .join(" ");
}

function montar(itens: ItemFormatavel[], semDescricao: Set<string>, abertura?: string[] | null): string {
  const corpo = itens
    .map((i, idx) => {
      const habs = (i.habilidades ?? [])
        .map((h, j) => (semDescricao.has(`${idx}:${j}`) || !h.habilidade ? `-(${h.codigo})` : `-(${h.codigo}) ${h.habilidade.trim()}`))
        .join(" ");
      const materia = i.componente.toLocaleUpperCase("pt-BR"); // nome da materia sempre em MAIUSCULAS
      return habs ? `${materia}: ${i.conteudo.trim()} ${habs}` : `${materia}: ${i.conteudo.trim()}`;
    })
    .join("/ -");
  const inicio = textoAbertura(abertura);
  return inicio && corpo ? `${inicio}/ -${corpo}` : inicio || corpo;
}

// Se houver limite e o texto passar, remove as descricoes (da mais longa para a mais curta)
// mantendo os codigos, ate caber.
export function formatarComLimite(itens: ItemFormatavel[], limite?: number | null, abertura?: string[] | null): TextoFormatado {
  const semDescricao = new Set<string>();
  let texto = montar(itens, semDescricao, abertura);
  if (!limite || limite <= 0 || texto.length <= limite) return { texto, compactado: false, excede: false };

  const ordem = itens
    .flatMap((i, idx) => (i.habilidades ?? []).map((h, j) => ({ chave: `${idx}:${j}`, tam: h.habilidade?.length ?? 0 })))
    .filter((x) => x.tam > 0)
    .sort((a, b) => b.tam - a.tam);

  for (const { chave } of ordem) {
    semDescricao.add(chave);
    texto = montar(itens, semDescricao, abertura);
    if (texto.length <= limite) break;
  }
  return { texto, compactado: semDescricao.size > 0, excede: texto.length > limite };
}

export function formatarRegistro(itens: ItemFormatavel[], limite?: number | null, abertura?: string[] | null): string {
  return formatarComLimite(itens, limite, abertura).texto;
}

export const ANOS: Array<{ valor: string; nome: string }> = [
  { valor: "EI01", nome: "Infantil - Bebês" },
  { valor: "EI02", nome: "Infantil - Crianças bem pequenas" },
  { valor: "EI03", nome: "Infantil - Crianças pequenas" },
  ...Array.from({ length: 9 }, (_, i) => ({ valor: String(i + 1), nome: `${i + 1}º ano` })),
  { valor: "EM", nome: "Ensino Médio" },
];

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
