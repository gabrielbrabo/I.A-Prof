// Parser de CSV simples com suporte a aspas. Detecta ; ou , pelo cabecalho.
export function parseCsv(texto: string): Record<string, string>[] {
  const limpo = texto.replace(/^﻿/, "");
  const primeiraLinha = limpo.split(/\r?\n/, 1)[0] || "";
  const sep = (primeiraLinha.match(/;/g) || []).length >= (primeiraLinha.match(/,/g) || []).length ? ";" : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }

  const [cab, ...resto] = linhas.filter((l) => l.some((v) => v.trim() !== ""));
  if (!cab) return [];
  const chaves = cab.map((h) => h.trim().toLowerCase());
  return resto.map((l) => Object.fromEntries(chaves.map((k, idx) => [k, (l[idx] ?? "").trim()])));
}

// "4" -> ["4"]; "1-5" -> ["1".."5"]; "1,2,3" -> ["1","2","3"]; "EI03" -> ["EI03"]
export function expandirAnos(valor: string): string[] {
  const out = new Set<string>();
  for (const parte of valor.split(/[,|/ ]+/).filter(Boolean)) {
    const faixa = parte.match(/^(\d)\s*-\s*(\d)$/);
    if (faixa) {
      for (let a = Number(faixa[1]); a <= Number(faixa[2]); a++) out.add(String(a));
    } else {
      out.add(parte.toUpperCase().replace(/[ºª°]/g, "").replace(/^0+(\d)$/, "$1"));
    }
  }
  return [...out];
}
