import { lerToken } from "./sessao";

// Preferencias salvas no navegador (serie, UF, turma, limite...), SEPARADAS POR PROFESSOR:
// cada conta logada tem as suas (outro professor no mesmo computador comeca do zero).
function usuarioDoToken(): string | null {
  const t = lerToken();
  if (!t) return null;
  try {
    const corpo = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string };
    return corpo.sub ?? null;
  } catch {
    return null;
  }
}

export const chaveDoUsuario = (chave: string) => {
  const u = usuarioDoToken();
  return u ? `iaprof.u.${u}.${chave}` : `iaprof.${chave}`;
};

export function lerPref(chave: string, padrao: string): string {
  try {
    return localStorage.getItem(chaveDoUsuario(chave)) ?? padrao;
  } catch {
    return padrao;
  }
}

export function gravarPref(chave: string, valor: string) {
  try {
    localStorage.setItem(chaveDoUsuario(chave), valor);
  } catch {
    /* sem storage: ignora */
  }
}

// Preferencias do aparelho (iguais para qualquer conta), ex.: tema claro/escuro
export function lerPrefGlobal(chave: string, padrao: string): string {
  try {
    return localStorage.getItem(`iaprof.${chave}`) ?? padrao;
  } catch {
    return padrao;
  }
}
export function gravarPrefGlobal(chave: string, valor: string) {
  try {
    localStorage.setItem(`iaprof.${chave}`, valor);
  } catch {
    /* ignora */
  }
}

// UF: "" = ainda nao escolheu; "BNCC" = so a base nacional (sem curriculo estadual)
export const ufParaApi = (uf: string) => (uf && uf !== "BNCC" ? uf : null);
