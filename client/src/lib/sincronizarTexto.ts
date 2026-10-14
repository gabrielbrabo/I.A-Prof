import type { ItemFormatavel } from "./formatarRegistro";

// Texto final editado a mao (ou no formato do professor) + o professor mexeu nas habilidades dos cards:
// leva as mudancas de HABILIDADE para dentro do texto editado, sem refazer o texto todo.
//  - habilidade trocada  -> troca "(ANTIGO) descricao" por "(NOVO) descricao" no mesmo lugar
//  - habilidade removida -> apaga "-(CODIGO) descricao" do texto
//  - habilidade nova     -> acrescenta "-(CODIGO) descricao" no fim do trecho do componente
//  - card novo           -> acrescenta "/ -COMPONENTE: conteudo -(CODIGO) ..." no fim
//  - card removido       -> apaga o trecho "COMPONENTE: ..." do texto
// Se algo nao for encontrado no texto (o professor reescreveu demais), devolve ok=false e o texto como estava.

type Hab = { codigo: string; habilidade?: string | null };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hab = (h: Hab) => (h.habilidade?.trim() ? `-(${h.codigo}) ${h.habilidade.trim()}` : `-(${h.codigo})`);
const corpoHab = (h: Hab) => (h.habilidade?.trim() ? `(${h.codigo}) ${h.habilidade.trim()}` : `(${h.codigo})`);

// "(CODIGO)" + a descricao antiga, se ela estiver logo depois (inteira ou nao)
function reHab(h: Hab, comTraco: boolean) {
  const desc = h.habilidade?.trim();
  const d = desc ? `(?:\\s*${esc(desc)})?` : "";
  return new RegExp(`${comTraco ? "\\s*-?\\s*" : ""}\\(${esc(h.codigo)}\\)${d}`, "i");
}

// Trecho do componente no texto: de "COMPONENTE:" ate o proximo "/ -" (ou o fim)
function trechoDo(texto: string, componente: string): { ini: number; fim: number } | null {
  const m = new RegExp(`(^|/\\s*-\\s*)${esc(componente)}\\s*:`, "i").exec(texto);
  if (!m) return null;
  const ini = m.index + m[1].length;
  const prox = texto.slice(ini).search(/\/\s*-/);
  return { ini, fim: prox < 0 ? texto.length : ini + prox };
}

export function sincronizarTexto(texto: string, antigos: ItemFormatavel[], novos: ItemFormatavel[]): { texto: string; ok: boolean } {
  let t = texto;
  let ok = true;
  const porComp = (l: ItemFormatavel[]) => {
    const m = new Map<string, { conteudo: string; habs: Hab[] }>();
    for (const i of l) {
      const k = i.componente.toLocaleUpperCase("pt-BR");
      const atual = m.get(k) ?? { conteudo: i.conteudo, habs: [] };
      atual.habs.push(...(i.habilidades ?? []));
      m.set(k, atual);
    }
    return m;
  };
  const A = porComp(antigos);
  const N = porComp(novos);

  // Cards removidos: apaga o trecho do componente
  for (const [comp] of A) {
    if (N.has(comp)) continue;
    const tr = trechoDo(t, comp);
    if (!tr) {
      ok = false;
      continue;
    }
    // tira tambem o separador "/ -" que ligava ao trecho
    let ini = tr.ini;
    let fim = tr.fim;
    const antes = t.slice(0, ini).match(/\/\s*-\s*$/);
    if (antes) ini -= antes[0].length;
    else {
      const depois = t.slice(fim).match(/^\/\s*-\s*/);
      if (depois) fim += depois[0].length;
    }
    t = t.slice(0, ini) + t.slice(fim);
  }

  for (const [comp, novo] of N) {
    const velho = A.get(comp);
    if (!velho) {
      // Card novo: vai no fim do texto
      const habs = novo.habs.map(hab).join(" ");
      const trecho = `${comp}: ${novo.conteudo.trim()}${habs ? ` ${habs}` : ""}`;
      t = t.trim() ? `${t.trim()}/ -${trecho}` : trecho;
      continue;
    }
    const cod = (h: Hab) => h.codigo.toUpperCase();
    const removidas = velho.habs.filter((h) => !novo.habs.some((n) => cod(n) === cod(h)));
    const adicionadas = novo.habs.filter((h) => !velho.habs.some((v) => cod(v) === cod(h)));

    // Trocas: a 1a removida vira a 1a adicionada no mesmo lugar, e assim por diante
    const trocas = Math.min(removidas.length, adicionadas.length);
    for (let i = 0; i < trocas; i++) {
      const re = reHab(removidas[i], false);
      if (!re.test(t)) {
        ok = false;
        continue;
      }
      t = t.replace(re, corpoHab(adicionadas[i]));
    }
    // Sobrou removida: apaga
    for (const h of removidas.slice(trocas)) {
      const re = reHab(h, true);
      if (!re.test(t)) {
        ok = false;
        continue;
      }
      t = t.replace(re, "");
    }
    // Sobrou adicionada: acrescenta no fim do trecho do componente
    for (const h of adicionadas.slice(trocas)) {
      const tr = trechoDo(t, comp);
      if (!tr) {
        ok = false;
        continue;
      }
      const fimTrecho = t.slice(tr.ini, tr.fim).replace(/\s+$/, "");
      t = t.slice(0, tr.ini) + `${fimTrecho} ${hab(h)}` + t.slice(tr.fim);
    }
  }

  t = t.replace(/ {2,}/g, " ").trim();
  return ok ? { texto: t, ok } : { texto, ok };
}
