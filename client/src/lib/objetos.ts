import { useEffect, useState } from "react";
import { api } from "../api/client";
import { gravarPref, lerPref } from "./prefs";

// Objeto de conhecimento das habilidades (BNCC/curriculo do estado ou o texto do plano do professor).
// Mostrar ou nao: preferencia "mostrarObjeto" (ligada por padrao), trocada em Configuracoes, Gerar aula ou Atividades.
const EVENTO = "iaprof:mostrarObjeto";
export const lerMostrarObjeto = () => lerPref("mostrarObjeto", "1") === "1";
export function gravarMostrarObjeto(v: boolean) {
  gravarPref("mostrarObjeto", v ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: v }));
}
export function useMostrarObjeto(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(lerMostrarObjeto);
  useEffect(() => {
    const ouvir = (e: Event) => setV(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENTO, ouvir);
    return () => window.removeEventListener(EVENTO, ouvir);
  }, []);
  return [v, gravarMostrarObjeto];
}

// cache dos objetos buscados no servidor (codigo -> objeto); "" = nao tem
const cache = new Map<string, string>();

// doPlano: codigo -> conteudo do plano (tem prioridade). Os que faltam sao buscados na base (BNCC/estado).
export function useObjetos(codigos: string[], uf: string | null | undefined, doPlano: Record<string, string | null | undefined>, ativo: boolean) {
  const [, setVersao] = useState(0);
  const chave = [...new Set(codigos.map((c) => c.toUpperCase()))].sort().join(",");
  useEffect(() => {
    if (!ativo || !chave) return;
    const faltam = chave.split(",").filter((c) => !doPlano[c] && !cache.has(c));
    if (!faltam.length) return;
    let vivo = true;
    api<Record<string, { objeto: string }>>(`/habilidades/objetos?codigos=${encodeURIComponent(faltam.join(","))}${uf ? `&uf=${uf}` : ""}`)
      .then((r) => {
        faltam.forEach((c) => cache.set(c, r[c]?.objeto ?? ""));
        if (vivo) setVersao((n) => n + 1);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, uf, ativo]);
  return (codigo: string): string | null => {
    const c = codigo.toUpperCase();
    return (doPlano[c] || cache.get(c) || "").trim() || null;
  };
}
