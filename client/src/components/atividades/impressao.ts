import { Atividade, cabecalhoPadrao, estiloPadrao, fmtNum, letra, Questao, svgParaSrc } from "../../api/atividades";
import { ANOS } from "../../lib/formatarRegistro";

const nomeSerie = (ano: string) => ANOS.find((x) => x.valor === ano)?.nome ?? ano;

// Impressao (ou "Salvar como PDF" na janela de impressao do navegador):
// atividade para os alunos (sem gabarito), gabarito do professor e lista de notas.

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const quebra = (s: string) => esc(s).replace(/\n/g, "<br>");
const pts = (v: number) => `${fmtNum(v)} ${v === 1 ? "ponto" : "pontos"}`;

const CSS = `
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12.5pt; line-height: 1.45; margin: 0; }
  .cab { border: 1.5px solid #222; border-radius: 6px; padding: 8px 10px; margin-bottom: 14px; font-size: 11pt; }
  .cab .linha { display: flex; gap: 14px; flex-wrap: wrap; margin: 3px 0; }
  .cab .campo { flex: 1; min-width: 150px; white-space: nowrap; }
  .cab .campo span { display: inline-block; border-bottom: 1px solid #555; min-width: 60%; }
  h1 { font-size: 15pt; text-align: center; margin: 4px 0 2px; }
  .instr { text-align: center; font-size: 11pt; color: #333; margin-bottom: 12px; }
  .q { margin: 0 0 14px; page-break-inside: avoid; }
  .q .enun { font-weight: bold; }
  .q .valor { font-weight: normal; color: #444; font-size: 10pt; }
  .alt, .vf { margin: 3px 0 3px 18px; }
  .linhas div { border-bottom: 1px solid #999; height: 26px; margin-left: 18px; }
  .gab { margin: 2px 0 2px 18px; color: #064e3b; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #999; padding: 5px 8px; text-align: left; }
  th { background: #f1f5f9; }
  td.num { text-align: right; width: 90px; }
  .rodape { margin-top: 10px; font-size: 9pt; color: #666; text-align: right; }
`;

// Letra grande / colorida (pedido do professor)
const CSS_ESTILO = {
  grande: `body{font-size:15pt} h1{font-size:19pt} .cab{font-size:13pt} .instr{font-size:13pt}`,
  extra: `body{font-size:19pt;line-height:1.55} h1{font-size:24pt} .cab{font-size:15pt} .instr{font-size:15pt} .linhas div{height:36px}`,
  caixaAlta: `body{text-transform:uppercase} .valor{text-transform:none}`,
  colorido: `h1{color:#4338ca} .texto{border-color:#a5b4fc;background:#f5f7ff} .cab{border-color:#6366f1;background:#eef2ff} .q{border-left:5px solid #a5b4fc;padding-left:10px} .q .enun{color:#1e1b4b}`,
};
const CSS_IMG = `.topo{display:flex;align-items:center;gap:12px;margin-bottom:6px} .topo img{max-height:70px;max-width:120px;object-fit:contain}
  .topo .esc{font-weight:bold;font-size:1.1em} .fig{margin:6px 0 4px 18px} .fig img{max-height:130px;max-width:60%;object-fit:contain}
  .fig .emoji{font-size:2.4em;line-height:1.2;letter-spacing:4px}
  .texto{border:1.5px solid #999;border-radius:8px;padding:10px 14px;margin:0 0 16px;page-break-inside:avoid}
  .texto h2{margin:0 0 6px;font-size:1.15em;text-align:center} .texto p{margin:0 0 6px;text-align:justify}
  .texto{display:flow-root} .texto img{display:block;margin:6px auto;max-height:200px;max-width:70%;object-fit:contain}
  .texto img.dir{float:right;width:38%;max-width:38%;max-height:none;margin:2px 0 8px 14px}
  .texto img.esq{float:left;width:38%;max-width:38%;max-height:none;margin:2px 14px 8px 0}`;

const montarHtml = (titulo: string, corpo: string, extraCss = "") =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}${CSS_IMG}${extraCss}</style></head><body>${corpo}</body></html>`;

function imprimirHtml(titulo: string, corpo: string, extraCss = "") {
  const html = montarHtml(titulo, corpo, extraCss);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  const imprimir = () => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => iframe.remove(), 60000);
  };
  // espera as fontes/layout
  setTimeout(imprimir, 600);
}

function cabecalho(a: Atividade, extra: { professor?: string; escola?: string }) {
  const cab = a.cabecalho ?? cabecalhoPadrao();
  const tem = (c: string) => cab.campos.includes(c);
  const logo = a.imagens?.find((i) => i.id === cab.logo);
  const escola = cab.escola || extra.escola || "";
  const linha = (rot: string, valor = "", largura = "") =>
    `<div class="campo"${largura ? ` style="${largura}"` : ""}>${rot}: <span>${esc(valor)}&nbsp;</span></div>`;
  const topo =
    logo || (escola && tem("escola"))
      ? `<div class="topo">${logo ? `<img src="${logo.dataUrl}" alt="">` : ""}${escola && tem("escola") ? `<div class="esc">${esc(escola)}</div>` : ""}</div>`
      : "";
  const l1 = [!escola && tem("escola") ? linha("Escola") : ""].join("");
  const l2 = [tem("professor") ? linha("Professor(a)", extra.professor || "") : "", tem("turma") ? linha("Turma", a.turma || "") : ""].join("");
  const l3 = [tem("aluno") ? `<div class="campo">Aluno(a): <span style="min-width:80%">&nbsp;</span></div>` : "", tem("data") ? `<div class="campo" style="flex:0 0 170px">Data: ___/___/______</div>` : ""].join("");
  const info = [esc(a.componente), tem("serie") ? esc(nomeSerie(a.ano)) : "", tem("periodo") ? `${a.periodo}º período` : ""].filter(Boolean).join(" · ");
  const l4 = `<div class="campo">${info}</div><div class="campo" style="text-align:right">Valor: ${pts(a.valorTotal)}${tem("nota") ? " &nbsp; Nota: ______" : ""}</div>`;
  return `${topo}<div class="cab">${[l1, l2, l3, l4].filter(Boolean).map((l) => `<div class="linha">${l}</div>`).join("")}</div>`;
}

function figuraHtml(q: Questao, a: Atividade) {
  const img = q.imagem ? a.imagens?.find((i) => i.id === q.imagem) : null;
  const partes: string[] = [];
  if (img) partes.push(`<img src="${img.dataUrl}" alt="">`);
  if (q.figura?.tipo === "emoji" && q.figura.conteudo) partes.push(`<span class="emoji">${esc(q.figura.conteudo)}</span>`);
  if (q.figura?.tipo === "svg" && q.figura.conteudo) partes.push(`<img src="${svgParaSrc(q.figura.conteudo)}" alt="">`);
  return partes.length ? `<div class="fig">${partes.join(" ")}</div>` : "";
}

function questaoAluno(q: Questao, n: number, a: Atividade) {
  const e = a.estilo ?? estiloPadrao();
  let corpo = "";
  if (q.tipo === "multipla") {
    const curtas = q.alternativas.every((x) => x.length <= 40);
    const alts = q.alternativas.map((alt, i) => `<div class="alt">( &nbsp; ) ${letra(i)}) ${esc(alt)}</div>`).join("");
    corpo = e.colunas && curtas ? `<div class="cols">${alts}</div>` : alts;
  } else if (q.tipo === "vf") corpo = q.itens.map((it) => `<div class="vf">( &nbsp; &nbsp; ) ${esc(it.texto)}</div>`).join("");
  else {
    const linhas = q.linhas && q.linhas > 0 ? q.linhas : q.tipo === "discursiva" ? (e.layout === "compacto" ? 3 : 4) : 2;
    corpo = `<div class="linhas">${"<div></div>".repeat(linhas)}</div>`;
  }
  return `<div class="q">${figuraHtml(q, a)}<div class="enun">${n}. ${quebra(q.enunciado)} <span class="valor">(${pts(q.valor)})</span></div>${corpo}<div style="clear:both"></div></div>`;
}

// Tamanho das imagens e aproveitamento da folha
const ALTURA_IMG = { pequena: 80, media: 130, grande: 220 };
const cssDoEstilo = (a: Atividade) => {
  const e = a.estilo ?? estiloPadrao();
  const h = ALTURA_IMG[e.imagem ?? "media"];
  const layout =
    e.layout === "compacto"
      ? `@page{margin:10mm 11mm 12mm} .q{margin:0 0 9px} .cab{margin-bottom:9px;padding:6px 9px} h1{margin:2px 0} .instr{margin-bottom:8px}
         .fig{float:right;margin:0 0 4px 12px;max-width:38%} .fig img{max-height:${h}px;max-width:100%} .linhas div{height:24px}`
      : e.layout === "amplo"
        ? `.q{margin:0 0 24px} .linhas div{height:32px} .fig img{max-height:${h}px}`
        : `.fig img{max-height:${h}px}`;
  return `.cols{display:grid;grid-template-columns:1fr 1fr;column-gap:16px}${layout}${e.fonte === "grande" ? CSS_ESTILO.grande : e.fonte === "extra" ? CSS_ESTILO.extra : ""}${e.colorido ? CSS_ESTILO.colorido : ""}${e.caixaAlta ? CSS_ESTILO.caixaAlta : ""}`;
};

// HTML completo da folha do aluno (para imprimir ou mostrar a previa na tela)
export function htmlDaAtividade(a: Atividade, extra: { professor?: string; escola?: string } = {}) {
  const { corpo, css } = corpoAtividade(a, extra);
  return montarHtml(a.titulo, corpo, css);
}

export function imprimirAtividade(a: Atividade, extra: { professor?: string; escola?: string } = {}) {
  const { corpo, css } = corpoAtividade(a, extra);
  imprimirHtml(a.titulo, corpo, css);
}

// Atividades antigas podem ter vindo com HTML da I.A: mostra so o texto (nunca as tags)
function textoPuro(s: string) {
  if (!/<\/?[a-z][\s\S]*?>|&[a-z#0-9]+;/i.test(s)) return s;
  const d = new DOMParser().parseFromString(
    s.replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|h[1-6]|li)\s*>/gi, "\n\n"),
    "text/html"
  );
  return (d.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function corpoAtividade(a: Atividade, extra: { professor?: string; escola?: string }) {
  const t = a.texto;
  const timg = t?.imagem ? a.imagens?.find((i) => i.id === t.imagem) : null;
  const classeImg = t?.posicao === "direita" ? ' class="dir"' : t?.posicao === "esquerda" ? ' class="esq"' : "";
  const textoHtml = t?.conteudo?.trim()
    ? `<div class="texto">${t.titulo ? `<h2>${esc(textoPuro(t.titulo))}</h2>` : ""}${timg ? `<img${classeImg} src="${timg.dataUrl}" alt="">` : ""}${textoPuro(t.conteudo)
        .trim()
        .split(/\n+/)
        .map((par) => `<p>${esc(par)}</p>`)
        .join("")}</div>`
    : "";
  const corpo = `${cabecalho(a, extra)}<h1>${esc(a.titulo)}</h1>${a.instrucoes ? `<div class="instr">${esc(a.instrucoes)}</div>` : ""}${textoHtml}${a.questoes
    .map((q, i) => questaoAluno(q, i + 1, a))
    .join("")}`;
  return { corpo, css: cssDoEstilo(a) };
}

export function imprimirGabarito(a: Atividade) {
  const linhas = a.questoes
    .map((q, i) => {
      let g = "";
      if (q.tipo === "multipla") g = `<div class="gab">Resposta: <b>${esc(q.resposta || "—")}</b>${q.resposta ? ` — ${esc(q.alternativas[q.resposta.charCodeAt(0) - 65] ?? "")}` : ""}</div>`;
      else if (q.tipo === "vf") g = q.itens.map((it) => `<div class="gab"><b>${it.resposta}</b> — ${esc(it.texto)}</div>`).join("");
      else g = `<div class="gab">Esperado: ${quebra(q.resposta || "—")}</div>${q.criterios ? `<div class="gab">Critérios: ${quebra(q.criterios)}</div>` : ""}`;
      return `<div class="q"><div class="enun">${i + 1}. ${quebra(q.enunciado)} <span class="valor">(${pts(q.valor)})</span></div>${g}</div>`;
    })
    .join("");
  imprimirHtml(`Gabarito — ${a.titulo}`, `<h1>Gabarito — ${esc(a.titulo)}</h1><div class="instr">${esc(a.componente)} · ${esc(a.turma || "")} · Valor: ${pts(a.valorTotal)}</div>${linhas}`);
}

export function imprimirNotas(a: Atividade, notas: Array<{ nome: string; nota: number | null; status: string }>) {
  const linhas = notas
    .map((n, i) => `<tr><td class="num" style="width:40px;text-align:center">${i + 1}</td><td>${esc(n.nome)}</td><td class="num">${n.nota == null ? "—" : fmtNum(n.nota)}</td><td>${esc(n.status)}</td></tr>`)
    .join("");
  imprimirHtml(
    `Notas — ${a.titulo}`,
    `<h1>Notas — ${esc(a.titulo)}</h1><div class="instr">${esc(a.componente)} · ${esc(a.turma || "")} · ${a.periodo}º período · Valor: ${pts(a.valorTotal)}</div>
     <table><thead><tr><th>Nº</th><th>Aluno(a)</th><th>Nota</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table>
     <div class="rodape">Gerado pelo I.A Prof em ${new Date().toLocaleDateString("pt-BR")}</div>`
  );
}
