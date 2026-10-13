import { cabecalhoAuth, lerResposta } from "../lib/sessao";

export const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// Wrapper de fetch com JSON, token do professor e mensagem de erro do backend
export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: { "Content-Type": "application/json", ...cabecalhoAuth(), ...(opcoes.headers || {}) },
  });
  return lerResposta<T>(resp);
}
