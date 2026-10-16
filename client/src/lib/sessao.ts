// Sessao do professor (token JWT salvo no navegador)
const CHAVE = "iaprof.token";

export function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function salvarToken(token: string) {
  try {
    localStorage.setItem(CHAVE, token);
  } catch {
    /* ignora */
  }
}

// Sai da conta: apaga o token (rascunho e preferencias ficam guardados por professor)
export function sair() {
  try {
    localStorage.removeItem(CHAVE);
    localStorage.removeItem("iaprof.rascunhoRegistro"); // chave antiga (antes do login)
  } catch {
    /* ignora */
  }
  window.dispatchEvent(new Event("iaprof:sair"));
}

export const cabecalhoAuth = (): Record<string, string> => {
  const t = lerToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

// Erro da API com o status (401 = sessao, 402 = sem acesso/limite)
export class ErroApi extends Error {
  constructor(message: string, public status: number, public semAcesso = false) {
    super(message);
  }
}

// Le a resposta: 401 derruba a sessao; erros viram ErroApi
export async function lerResposta<T>(resp: Response): Promise<T> {
  if (resp.status === 204) return undefined as T;
  const dados = (await resp.json().catch(() => ({}))) as { message?: string; semAcesso?: boolean };
  if (resp.status === 401 && lerToken()) sair();
  // Sem limite de I.A / sem plano: o App mostra o aviso (com comprar creditos / mudar de plano)
  if (resp.status === 402) window.dispatchEvent(new CustomEvent("iaprof:semAcesso", { detail: dados.message || "" }));
  if (!resp.ok) throw new ErroApi(dados.message || `Erro ${resp.status}`, resp.status, !!dados.semAcesso);
  return dados as T;
}
