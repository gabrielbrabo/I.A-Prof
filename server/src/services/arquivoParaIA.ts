import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
// Texto do PDF com pdfjs-dist 3 (build legacy, funciona no Node 18+), montando linha a linha
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsCache: any = null;
function carregarPdfjs() {
  if (pdfjsCache) return pdfjsCache;
  // Silencia avisos de "canvas" no carregamento (so afetam desenho de PDF, nao a leitura de texto)
  const log = console.log;
  console.log = () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pdfjsCache = require("pdfjs-dist/legacy/build/pdf.js");
  } finally {
    console.log = log;
  }
  return pdfjsCache;
}

export interface ItemPdf {
  x: number; // posicao horizontal (esquerda)
  y: number; // posicao vertical (maior = mais alto na pagina)
  w: number; // largura
  str: string;
}

// Le todas as paginas do PDF com a posicao de cada pedaco de texto (usado para ler tabelas por coluna)
export async function pdfParaItens(buffer: Buffer): Promise<ItemPdf[][]> {
  const pdfjs = carregarPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const paginas: ItemPdf[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const conteudo = await pagina.getTextContent();
      const itens: ItemPdf[] = [];
      for (const it of conteudo.items as Array<{ str?: string; transform?: number[]; width?: number }>) {
        if (!it.str || !it.str.trim() || !it.transform) continue;
        itens.push({ x: it.transform[4], y: it.transform[5], w: it.width ?? 0, str: it.str });
      }
      paginas.push(itens);
    }
  } finally {
    await doc.destroy();
  }
  return paginas;
}

// Junta pedacos de texto em linhas (de cima para baixo, da esquerda para a direita)
export function itensParaLinhas(itens: ItemPdf[]): string[] {
  const linhas: Array<{ y: number; partes: ItemPdf[] }> = [];
  for (const it of [...itens].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = linhas.find((x) => Math.abs(x.y - it.y) <= 2);
    if (l) l.partes.push(it);
    else linhas.push({ y: it.y, partes: [it] });
  }
  return linhas.map((l) => l.partes.sort((a, b) => a.x - b.x).map((p) => p.str).join(" "));
}

async function pdfParaTexto(buffer: Buffer): Promise<string> {
  const paginas = await pdfParaItens(buffer);
  return paginas.map((p) => itensParaLinhas(p).join("\n")).join("\n\n");
}

// Converte um arquivo enviado em blocos que o Claude entende.
// PDF e imagem vao direto (o Claude le PDF escaneado e foto); DOCX/XLSX/CSV/TXT viram texto.
export const EXTENSOES_ACEITAS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".jpg", ".jpeg", ".png", ".webp"];

const IMAGENS: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function planilhaParaTexto(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const partes: string[] = [];
  wb.eachSheet((sheet) => {
    partes.push(`### Planilha: ${sheet.name}`);
    sheet.eachRow((row) => {
      const valores = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return "";
        if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
        if (typeof v === "object" && v !== null && "result" in v) return String((v as { result: unknown }).result);
        return String(v);
      });
      if (valores.some((x) => x.trim())) partes.push(valores.join(" ; "));
    });
  });
  return partes.join("\n");
}

export async function arquivoParaBlocos(nome: string, buffer: Buffer): Promise<Anthropic.ContentBlockParam[]> {
  const ext = path.extname(nome).toLowerCase();

  if (ext === ".pdf") {
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
        title: nome,
      },
    ];
  }
  if (IMAGENS[ext]) {
    return [{ type: "image", source: { type: "base64", media_type: IMAGENS[ext], data: buffer.toString("base64") } }];
  }

  let texto: string;
  if (ext === ".docx") {
    texto = (await mammoth.extractRawText({ buffer })).value;
  } else if (ext === ".xlsx") {
    texto = await planilhaParaTexto(buffer);
  } else if (ext === ".csv" || ext === ".txt") {
    texto = buffer.toString("utf-8").replace(/^﻿/, "");
  } else {
    throw new Error(`Formato nao suportado (${ext}). Use: ${EXTENSOES_ACEITAS.join(", ")}`);
  }

  if (!texto.trim()) throw new Error(`Nao foi possivel ler texto do arquivo ${nome}`);
  return [{ type: "text", text: `Conteudo do arquivo "${nome}":\n\n${texto}` }];
}

// Extrai o texto do arquivo SEM IA. Retorna null quando nao ha texto legivel (foto, PDF escaneado).
export async function arquivoParaTexto(nome: string, buffer: Buffer): Promise<string | null> {
  const ext = path.extname(nome).toLowerCase();
  let texto = "";
  try {
    if (ext === ".pdf") texto = await pdfParaTexto(buffer);
    else if (ext === ".docx") texto = (await mammoth.extractRawText({ buffer })).value;
    else if (ext === ".xlsx") texto = await planilhaParaTexto(buffer);
    else if (ext === ".csv" || ext === ".txt") texto = buffer.toString("utf-8").replace(/^\uFEFF/, "");
    else return null; // imagens
  } catch (e) {
    console.warn(`[arquivoParaTexto] ${nome}:`, e instanceof Error ? e.message : e);
    return null;
  }
  // PDF escaneado costuma vir sem texto (ou quase)
  const util = texto.replace(/\s+/g, "");
  return util.length >= 20 || /E[FIM]\d{2}[A-Z]{2}/.test(util) ? texto : null;
}
