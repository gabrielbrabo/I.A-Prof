const NOME_ANO: Record<string, string> = {
  EI01: "Educação Infantil - Bebês (0 a 1a6m)",
  EI02: "Educação Infantil - Crianças bem pequenas (1a7m a 3a11m)",
  EI03: "Educação Infantil - Crianças pequenas (4a a 5a11m)",
  EM: "Ensino Médio",
};

// Nome legivel da serie para os prompts
export function nomeAno(ano: string): string {
  return NOME_ANO[ano] ?? `${ano}º ano do Ensino Fundamental`;
}
