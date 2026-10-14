// Mesmo componente com nomes diferentes: "Ciências" = "CIÊNCIAS" = "Ciências da Natureza",
// "Português" = "Língua Portuguesa", "Ed. Física" = "Educação Física"...
// Sem isso, uma habilidade do plano pode nao aparecer no card (nome do componente diferente do plano).
export function chaveComponente(nome: string): string {
  const s = String(nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/cienc/.test(s)) return "ciencias";
  if (/portug|lingua materna/.test(s)) return "portugues";
  if (/ingl/.test(s)) return "ingles";
  if (/espanh/.test(s)) return "espanhol";
  if (/matem/.test(s)) return "matematica";
  if (/hist/.test(s)) return "historia";
  if (/geog/.test(s)) return "geografia";
  if (/fisic/.test(s) && /educ|ed /.test(`${s} `)) return "educacao fisica";
  if (/religi/.test(s)) return "ensino religioso";
  if (/^artes?\b|\barte\b|\bartes\b/.test(s)) return "arte";
  return s;
}

export const mesmoComponente = (a: string, b: string) => chaveComponente(a) === chaveComponente(b);
