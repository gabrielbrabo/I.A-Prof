import type { Atividade, ImagemAtividade, TipoDev } from "../api/atividades";
import { chaveDoUsuario } from "./prefs";

// Rascunho da atividade nova (gerada e ainda nao salva): continua na tela ao recarregar a pagina,
// trocar de aba ou fechar o app — o professor nao precisa gerar de novo (e gastar I.A).
// Fica no IndexedDB do navegador (cabe as imagens; o localStorage e pequeno demais).
export interface RascunhoAtividade {
  ano: string;
  anoLetivo: number;
  periodo: number;
  turmaChave: string;
  turmaNome: string | null;
  componente: string;
  materiaDev: string;
  tipoDev: TipoDev;
  valorTotal: number;
  detalhes: string;
  habSel: string[];
  atividade: Atividade | null;
  imagensPedido: ImagemAtividade[];
  usouPlano: boolean | null;
  origem?: "ia" | "externa";
  em: number; // quando foi gravado
}

const BANCO = "iaprof";
const LOJA = "rascunhos";

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}

async function op<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | null> {
  const db = await abrir();
  try {
    return await new Promise<T | null>((ok, falha) => {
      const req = fn(db.transaction(LOJA, modo).objectStore(LOJA));
      req.onsuccess = () => ok((req.result as T) ?? null);
      req.onerror = () => falha(req.error);
    });
  } finally {
    db.close();
  }
}

const chave = () => chaveDoUsuario("rascunhoAtividade");
const VALIDADE = 30 * 86400000; // rascunho esquecido ha mais de 30 dias e descartado

export async function lerRascunhoAtividade(): Promise<RascunhoAtividade | null> {
  try {
    const r = await op<RascunhoAtividade>("readonly", (s) => s.get(chave()));
    if (!r || Date.now() - (r.em || 0) > VALIDADE) return null;
    return r;
  } catch {
    return null; // sem IndexedDB (aba anonima etc.): segue sem rascunho
  }
}

export async function gravarRascunhoAtividade(r: RascunhoAtividade | null) {
  try {
    if (r) await op("readwrite", (s) => s.put(r, chave()));
    else await op("readwrite", (s) => s.delete(chave()));
  } catch {
    /* sem storage: ignora */
  }
}
