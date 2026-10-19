import { Atividade, cabecalhoPadrao, estiloPadrao, fmtNum, letra, Questao, svgParaSrc } from "../../api/atividades";
import { ANOS } from "../../lib/formatarRegistro";
import { svgFiguraExata } from "../../lib/figurasExatas";

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
  .cab .campo { flex: 1; min-width: 150px; white-space: nowrap; display: flex; align-items: flex-end; gap: 4px; }
  .cab .campo span { flex: 1; display: block; border-bottom: 1px solid #555; min-width: 40px; line-height: 1.3; padding: 0 2px 1px; }
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
  .rodape-simples { margin-top: 14px; padding-top: 6px; border-top: 1px dashed #999; text-align: center; font-weight: bold; font-size: 11pt; page-break-inside: avoid; }
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
  .quadro{font-family:"Courier New",Courier,monospace;white-space:pre;font-size:0.95em;line-height:1.5;margin:6px 0 4px;padding:6px 10px;border:1px solid #bbb;border-radius:6px;display:inline-block;max-width:100%;overflow:hidden}
  .texto{display:flow-root} .texto img{display:block;margin:6px auto;max-height:200px;max-width:70%;object-fit:contain}
  .texto img.dir{float:right;width:38%;max-width:38%;max-height:none;margin:2px 0 8px 14px}
  .texto img.esq{float:left;width:38%;max-width:38%;max-height:none;margin:2px 14px 8px 0}`;

// "Caber em N folhas": encolhe a folha inteira (letra, imagens, espacos) ate caber no A4 (area util ~182 x 267 mm)
const scriptCaber = (paginas: number) =>
  `<script>(function(){var alvo=${paginas}*267*96/25.4,b=document.body;function caber(){var z=1;b.style.zoom=1;b.style.width="182mm";` +
  `for(var i=0;i<30&&b.getBoundingClientRect().height>alvo&&z>0.5;i++){z=Math.round((z-0.03)*100)/100;b.style.zoom=z;b.style.width=(182/z)+"mm";}}` +
  `caber();window.addEventListener("load",caber);})();<\/script>`;

// Fontes da folha caprichada: Fredoka (titulos) e Andika (texto, feita para quem esta aprendendo a ler)
const FONTES = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Andika:wght@400;700&family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet">`;
const montarHtml = (titulo: string, corpo: string, extraCss = "", paginas = 0) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title>${corpo.includes('class="folha-cards') ? FONTES : ""}<style>${CSS}${CSS_IMG}${extraCss}</style></head><body>${corpo}${paginas > 0 ? scriptCaber(paginas) : ""}</body></html>`;

// espera as fontes da folha (sem travar se a internet falhar)
const fontesProntas = (doc: Document) => Promise.race([doc.fonts?.ready ?? Promise.resolve(), new Promise((ok) => setTimeout(ok, 2500))]);

function imprimirHtml(titulo: string, corpo: string, extraCss = "", paginas = 0) {
  const html = montarHtml(titulo, corpo, extraCss, paginas);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  const imprimir = () => {
    if (!iframe.contentWindow) return; // quadro ja removido
    iframe.contentWindow.focus();
    iframe.contentWindow!.print();
    setTimeout(() => iframe.remove(), 60000);
  };
  // espera as fontes/layout
  setTimeout(() => void fontesProntas(doc).then(() => setTimeout(imprimir, 150)), 400);
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
  const l3 = [tem("aluno") ? `<div class="campo">Aluno(a): <span>&nbsp;</span></div>` : "", tem("data") ? `<div class="campo" style="flex:0 0 170px">Data: ___/___/______</div>` : ""].join("");
  const info = [esc(a.componente), tem("serie") ? esc(nomeSerie(a.ano)) : "", tem("periodo") ? `${a.periodo}º período` : ""].filter(Boolean).join(" · ");
  const l4 = a.semNota
    ? info
      ? `<div class="campo">${info}</div>`
      : ""
    : `<div class="campo">${info}</div><div class="campo" style="justify-content:flex-end">Valor: ${pts(a.valorTotal)}${tem("nota") ? " &nbsp; Nota: ______" : ""}</div>`;
  return `${topo}<div class="cab">${[l1, l2, l3, l4].filter(Boolean).map((l) => `<div class="linha">${l}</div>`).join("")}</div>`;
}

function figuraHtml(q: Questao, a: Atividade) {
  const img = q.imagem ? a.imagens?.find((i) => i.id === q.imagem) : null;
  const partes: string[] = [];
  if (img) partes.push(`<img src="${img.dataUrl}" alt="">`);
  if (q.figura?.tipo === "emoji" && q.figura.conteudo) partes.push(`<span class="emoji">${esc(q.figura.conteudo)}</span>`);
  if (q.figura?.tipo === "svg" && q.figura.conteudo) partes.push(`<img src="${svgParaSrc(q.figura.conteudo)}" alt="">`);
  const exata = q.figura ? svgFiguraExata(q.figura.tipo, q.figura.conteudo) : "";
  if (exata) partes.push(`<img src="${svgParaSrc(exata)}" alt="">`);
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
    // com quadro (caca-palavras, ligar colunas) e linhas automaticas: o aluno responde no proprio quadro
    const linhas = q.linhas && q.linhas > 0 ? q.linhas : q.quadro?.trim() && q.tipo === "completar" ? 0 : q.tipo === "discursiva" ? (e.layout === "compacto" ? 3 : 4) : 2;
    corpo = linhas ? `<div class="linhas">${"<div></div>".repeat(linhas)}</div>` : "";
  }
  const quadro = q.quadro?.trim() ? `<div class="quadro">${esc(q.quadro)}</div>` : "";
  return `<div class="q">${figuraHtml(q, a)}<div class="enun">${n}. ${quebra(q.enunciado)}${a.semNota ? "" : ` <span class="valor">(${pts(q.valor)})</span>`}</div>${quadro}${corpo}<div style="clear:both"></div></div>`;
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
  return montarHtml(a.titulo, corpo, css, a.estilo?.paginas ?? 0);
}

export function imprimirAtividade(a: Atividade, extra: { professor?: string; escola?: string } = {}) {
  const { corpo, css } = corpoAtividade(a, extra);
  imprimirHtml(a.titulo, corpo, css, a.estilo?.paginas ?? 0);
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
  if (a.estilo?.visual === "cards") return corpoCards(a, extra);
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
  const rodape = a.estilo?.rodape?.trim() ? `<div class="rodape-simples">${esc(a.estilo.rodape)}</div>` : "";
  const corpo = `${cabecalho(a, extra)}<h1>${esc(a.titulo)}</h1>${a.instrucoes ? `<div class="instr">${esc(a.instrucoes)}</div>` : ""}${textoHtml}${a.questoes
    .map((q, i) => questaoAluno(q, i + 1, a))
    .join("")}${rodape}`;
  return { corpo, css: cssDoEstilo(a) };
}

export function imprimirGabarito(a: Atividade) {
  const linhas = a.questoes
    .map((q, i) => {
      let g = "";
      if (q.tipo === "multipla") g = `<div class="gab">Resposta: <b>${esc(q.resposta || "—")}</b>${q.resposta ? ` — ${esc(q.alternativas[q.resposta.charCodeAt(0) - 65] ?? "")}` : ""}</div>`;
      else if (q.tipo === "vf") g = q.itens.map((it) => `<div class="gab"><b>${it.resposta}</b> — ${esc(it.texto)}</div>`).join("");
      else g = `<div class="gab">Esperado: ${quebra(q.resposta || "—")}</div>${q.criterios ? `<div class="gab">Critérios: ${quebra(q.criterios)}</div>` : ""}`;
      return `<div class="q"><div class="enun">${i + 1}. ${quebra(q.enunciado)}${a.semNota ? "" : ` <span class="valor">(${pts(q.valor)})</span>`}</div>${g}</div>`;
    })
    .join("");
  imprimirHtml(`Gabarito — ${a.titulo}`, `<h1>Gabarito — ${esc(a.titulo)}</h1><div class="instr">${[esc(a.componente), esc(a.turma || ""), a.semNota ? "sem nota" : `Valor: ${pts(a.valorTotal)}`].filter(Boolean).join(" · ")}</div>${linhas}`);
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

// ---------- Baixar em PDF (sem abrir a janela de impressao) ----------
// Monta a folha num quadro invisivel com a largura util do A4, fotografa e divide em paginas
// sem cortar questoes no meio. "Tudo em 1 folha": a folha inteira e reduzida para caber numa pagina.
export async function baixarPdf(a: Atividade, extra: { professor?: string; escola?: string } = {}) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const { corpo, css } = corpoAtividade(a, extra);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", left: "-10000px", top: "0", width: "720px", height: "1200px", border: "0" });
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentWindow!.document;
    doc.open();
    doc.write(montarHtml(a.titulo, corpo, `${css} body{width:182mm;background:#fff;padding:0}`));
    doc.close();
    await new Promise<void>((ok) => (doc.readyState === "complete" ? ok() : iframe.contentWindow!.addEventListener("load", () => ok(), { once: true })));
    await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((ok) => ((img.onload = ok), (img.onerror = ok))))));
    await fontesProntas(doc);
    const body = doc.body;
    // O Tailwind do app deixa <img> como "block"; o html2canvas mede a linha de base do texto com um <img> na pagina do app
    // e o texto saia mais baixo (o risco do nome do professor cortava o nome). Durante a captura o <img> de medida volta ao normal.
    const ajusteMedida = document.createElement("style");
    ajusteMedida.textContent = 'body > div[style*="visibility: hidden"] img{display:inline !important;vertical-align:baseline !important}';
    document.head.appendChild(ajusteMedida);
    let canvas: HTMLCanvasElement;
    try {
      canvas = await html2canvas(body, { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: body.scrollWidth });
    } finally {
      ajusteMedida.remove();
    }
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const margemX = 14;
    const margemY = 14;
    const largura = 182;
    const altura = 267;
    const pxPorMm = canvas.width / largura;
    const alturaPagina = altura * pxPorMm;
    if ((a.estilo?.paginas ?? 0) === 1 || canvas.height <= alturaPagina) {
      // cabe numa pagina (ou o professor pediu 1 folha): reduz se precisar
      const escala = Math.min(1, alturaPagina / canvas.height);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", margemX + (largura * (1 - escala)) / 2, margemY, largura * escala, (canvas.height / pxPorMm) * escala);
    } else {
      // pontos de corte permitidos: inicio de cada questao (nao corta questao no meio)
      const topoBody = body.getBoundingClientRect().top;
      const cortes = Array.from(body.querySelectorAll<HTMLElement>(".q, .texto, h1, .rodape-cards"))
        .map((el) => (el.getBoundingClientRect().top - topoBody) * (canvas.width / body.getBoundingClientRect().width))
        .filter((y) => y > 0)
        .sort((x, y) => x - y);
      let inicio = 0;
      let primeira = true;
      while (inicio < canvas.height - 2) {
        let fim = Math.min(canvas.height, inicio + alturaPagina);
        if (fim < canvas.height) {
          const corte = [...cortes].reverse().find((y) => y <= fim && y > inicio + alturaPagina * 0.3);
          if (corte) fim = corte;
        }
        const pedaco = document.createElement("canvas");
        pedaco.width = canvas.width;
        pedaco.height = Math.ceil(fim - inicio);
        pedaco.getContext("2d")!.drawImage(canvas, 0, inicio, canvas.width, fim - inicio, 0, 0, canvas.width, fim - inicio);
        if (!primeira) pdf.addPage();
        pdf.addImage(pedaco.toDataURL("image/jpeg", 0.92), "JPEG", margemX, margemY, largura, (fim - inicio) / pxPorMm);
        primeira = false;
        inicio = fim;
      }
    }
    const nome = (a.titulo || "atividade").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "atividade";
    pdf.save(`${nome}.pdf`);
  } finally {
    iframe.remove();
  }
}

// ---------- Folha caprichada ("cards"): cada questao num quadro colorido com numero em destaque ----------
const CORES = ["#1e66d0", "#2e9e4f", "#7b3fbf", "#f07a1a", "#0e9aa7", "#d63a7a"];
const estrela = (cor: string, tam = 30) =>
  `<svg class="estrela" width="${tam}" height="${tam}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.4 7 1-5.1 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7L1.9 9.2l7-1z" fill="${cor}" stroke="#7a5a00" stroke-width="1" stroke-linejoin="round"/></svg>`;

const CSS_CARDS = `
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .folha-cards{font-family:Andika,"Comic Sans MS",Arial,sans-serif;font-size:12pt;line-height:1.4;color:#1f2937}
  .folha-cards .t{font-family:Fredoka,"Arial Rounded MT Bold",Arial,sans-serif}
  .topo-cards{display:flex;align-items:stretch;gap:10px;margin-bottom:8px}
  .topo-cards .caixa{flex:1;display:flex;align-items:center;gap:12px;border:2px solid #334155;border-radius:14px;padding:8px 12px;min-height:84px}
  .topo-cards .escola{display:flex;flex-direction:column;align-items:center;justify-content:center;max-width:32%;text-align:center;font-size:10.5pt;font-weight:700;line-height:1.2}
  .topo-cards .escola img{max-height:62px;max-width:130px;object-fit:contain;margin-bottom:2px}
  .topo-cards .meio{flex:1;text-align:center}
  .topo-cards h1{font-family:Fredoka,"Arial Rounded MT Bold",Arial,sans-serif;font-weight:700;font-size:21pt;line-height:1.1;margin:0;color:#1e40af;text-transform:uppercase;letter-spacing:.5px}
  .topo-cards .faixa{display:inline-flex;align-items:center;gap:10px;margin-top:6px}
  .topo-cards .selo{font-family:Fredoka,Arial,sans-serif;font-weight:700;font-size:14pt;background:#fde047;border:2px solid #1f2937;padding:2px 18px;clip-path:polygon(6% 0,94% 0,100% 50%,94% 100%,6% 100%,0 50%)}
  .topo-cards .mascote{width:118px;display:flex;align-items:flex-end;justify-content:center}
  .topo-cards .mascote img{max-width:118px;max-height:120px;object-fit:contain}
  .campos-cards{display:flex;flex-wrap:wrap;column-gap:18px;row-gap:4px;font-size:11pt;margin:2px 2px 10px}
  .campos-cards .c{display:flex;gap:6px;align-items:flex-end;flex:1 1 160px;white-space:nowrap;font-weight:700}
  .campos-cards .c span{flex:1;display:block;border-bottom:1.5px solid #374151;min-width:50px;font-weight:400;padding:0 4px 1px;line-height:1.3}
  .campos-cards .c.l{flex-basis:100%}
  .instr-cards{text-align:center;margin:0 auto 10px;display:table;padding:4px 18px;border:2px dashed #f59e0b;background:#fffbeb;border-radius:999px;font-weight:700;font-size:11pt}
  .grade{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .card{border:2.2px solid var(--cor);border-radius:14px;padding:10px 12px;page-break-inside:avoid;break-inside:avoid;position:relative;background:#fff}
  .card.larga{grid-column:1 / -1}
  .card .cab-q{display:flex;gap:8px;align-items:flex-start}
  .card .num{flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:var(--cor);color:#fff;font-family:Fredoka,Arial,sans-serif;font-weight:700;font-size:14pt;display:flex;align-items:center;justify-content:center;margin-top:-1px}
  .card .enun{flex:1;font-weight:700}
  .card .pts{font-weight:400;font-size:9pt;color:#475569;white-space:nowrap}
  .card .corpo{display:flex;gap:10px;align-items:center;margin-top:6px}
  .card .corpo .resp{flex:1;min-width:0}
  .card .corpo .ilus{flex:0 0 auto;max-width:46%;display:flex;gap:6px;align-items:center;justify-content:center}
  .card .ilus img{max-height:var(--himg);max-width:100%;object-fit:contain}
  .card .faixa-ilus{display:flex;justify-content:center;gap:8px;margin:6px 0 2px}
  .card .faixa-ilus img{max-height:var(--hfaixa);max-width:100%;object-fit:contain}
  .card img.fx-sq{max-height:150px;width:150px} .card img.fx-termo{max-height:190px;height:190px;width:auto} .card img.fx-graf{max-height:170px;width:100%}
  .card .alt{display:flex;gap:8px;align-items:flex-start;margin:5px 0}
  .card .let{flex:0 0 auto;width:22px;height:22px;border-radius:50%;border:2px solid var(--cor);color:#111;font-family:Fredoka,Arial,sans-serif;font-weight:700;font-size:10.5pt;display:flex;align-items:center;justify-content:center;background:#fff}
  .card .alts2{display:grid;grid-template-columns:1fr 1fr;column-gap:12px}
  .card .vf{display:flex;gap:8px;margin:5px 0}
  .card .vf b{flex:0 0 auto;font-weight:400;white-space:nowrap}
  .card .linhas div{border-bottom:1.5px solid #9ca3af;height:26px;margin-left:0}
  .card .quadro{font-family:"Courier New",Courier,monospace;white-space:pre;font-size:.95em;line-height:1.5;margin:6px 0 2px;padding:6px 10px;border:1.5px solid var(--cor);border-radius:10px;display:inline-block;max-width:100%;overflow:hidden;background:#fafafa}
  .card .seq{position:relative;margin-top:8px}
  .card .seq img{width:100%;display:block;border-radius:10px}
  .card .seq .n{position:absolute;top:6px;width:26px;height:26px;border-radius:50%;color:#fff;font-family:Fredoka,Arial,sans-serif;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3)}
  .texto-cards{border:2.2px solid #0e9aa7;border-radius:14px;padding:10px 14px;margin:0 0 10px;page-break-inside:avoid;display:flow-root;background:#f0fdfa}
  .texto-cards h2{font-family:Fredoka,Arial,sans-serif;margin:0 0 6px;text-align:center;font-size:14pt;color:#0f766e}
  .texto-cards p{margin:0 0 6px;text-align:justify}
  .texto-cards img{display:block;margin:6px auto;max-height:200px;max-width:70%;object-fit:contain}
  .texto-cards img.dir{float:right;width:38%;max-width:38%;max-height:none;margin:2px 0 8px 14px}
  .texto-cards img.esq{float:left;width:38%;max-width:38%;max-height:none;margin:2px 14px 8px 0}
  .rodape-cards{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:12px;padding-top:8px;border-top:2px dashed #93c5fd;font-weight:700;font-size:11.5pt;page-break-inside:avoid}
  .rodape-cards span{background:#fef9c3;padding:3px 14px;border-radius:8px}
`;

// Questao precisa da largura toda? (texto longo, quadro, muitas linhas, sequencia de cenas)
function questaoLarga(q: Questao, a: Atividade) {
  const e = a.estilo ?? estiloPadrao();
  if (e.fonte === "extra" || e.layout === "amplo") return true;
  if ((q.sequencia ?? 0) > 0 || q.quadro?.trim()) return true;
  if (q.enunciado.length > 230) return true;
  if (q.tipo === "discursiva" && ((q.linhas ?? 0) > 4 || (!q.linhas && q.enunciado.length > 120))) return true;
  if (q.tipo === "vf" && q.itens.some((it) => it.texto.length > 55)) return true;
  const temIlus = !!q.imagem || !!q.figura?.tipo;
  if (q.tipo === "multipla" && q.alternativas.some((x) => x.length > (temIlus ? 30 : 48))) return true;
  return false;
}

function questaoCard(q: Questao, n: number, a: Atividade, larga: boolean) {
  const e = a.estilo ?? estiloPadrao();
  const cor = CORES[(n - 1) % CORES.length];
  const img = q.imagem ? a.imagens?.find((i) => i.id === q.imagem) : null;
  const seq = img && (q.sequencia ?? 0) > 0 ? q.sequencia! : 0;
  // figuras "em pe" (relogio, termometro, fracao) ficam ao lado das respostas;
  // ilustracoes e graficos (mais largos) ficam numa faixa acima das respostas no quadro estreito
  const lado: string[] = [];
  const faixa: string[] = [];
  const exata = q.figura ? svgFiguraExata(q.figura.tipo, q.figura.conteudo, cor) : "";
  const classeExata = q.figura?.tipo === "termometro" ? "fx-termo" : q.figura?.tipo === "grafico" ? "fx-graf" : "fx-sq";
  if (exata) (q.figura!.tipo === "grafico" && !larga ? faixa : lado).push(`<img class="${classeExata}" src="${svgParaSrc(exata)}" alt="">`);
  if (img && !seq) (larga ? lado : faixa).push(`<img src="${img.dataUrl}" alt="">`);
  if (q.figura?.tipo === "svg" && q.figura.conteudo) lado.push(`<img src="${svgParaSrc(q.figura.conteudo)}" alt="">`);
  if (q.figura?.tipo === "emoji" && q.figura.conteudo) lado.push(`<span style="font-size:2.2em">${esc(q.figura.conteudo)}</span>`);

  let resp = "";
  if (q.tipo === "multipla") {
    const limite = larga ? (lado.length ? 22 : 34) : lado.length ? 8 : 18;
    const curtas = q.alternativas.every((x) => x.length <= limite);
    const alts = q.alternativas.map((alt, i) => `<div class="alt"><span class="let">${letra(i)}</span><span>${esc(alt)}</span></div>`).join("");
    resp = (curtas || (e.colunas && q.alternativas.every((x) => x.length <= limite * 1.6))) && q.alternativas.length >= 4 ? `<div class="alts2">${alts}</div>` : alts;
  } else if (q.tipo === "vf") resp = q.itens.map((it) => `<div class="vf"><b>( &nbsp; &nbsp; )</b><span>${esc(it.texto)}</span></div>`).join("");
  else {
    const linhas = q.linhas && q.linhas > 0 ? q.linhas : q.quadro?.trim() && q.tipo === "completar" ? 0 : q.tipo === "discursiva" ? (e.layout === "compacto" ? 3 : 4) : 2;
    resp = linhas ? `<div class="linhas">${"<div></div>".repeat(linhas)}</div>` : "";
  }
  const quadro = q.quadro?.trim() ? `<div class="quadro">${esc(q.quadro)}</div>` : "";
  const sequencia = seq
    ? `<div class="seq"><img src="${img!.dataUrl}" alt="">${Array.from({ length: seq }, (_, k) => `<span class="n" style="left:calc(${(k * 100) / seq}% + 6px);background:${CORES[k % CORES.length]}">${k + 1}</span>`).join("")}</div>`
    : "";
  const faixaHtml = faixa.length ? `<div class="faixa-ilus">${faixa.join("")}</div>` : "";
  const corpo = lado.length ? `<div class="corpo"><div class="resp">${quadro}${resp}</div><div class="ilus">${lado.join("")}</div></div>` : `<div class="corpo" style="display:block">${quadro}${resp}</div>`;
  const pts = a.semNota ? "" : ` <span class="pts">(${fmtNum(q.valor)} ${q.valor === 1 ? "ponto" : "pontos"})</span>`;
  return `<div class="q card${larga ? " larga" : ""}" style="--cor:${cor}"><div class="cab-q"><span class="num">${n}</span><div class="enun">${quebra(q.enunciado)}${pts}</div></div>${sequencia}${faixaHtml}${corpo}</div>`;
}

function corpoCards(a: Atividade, extra: { professor?: string; escola?: string }) {
  const e = a.estilo ?? estiloPadrao();
  const cab = a.cabecalho ?? cabecalhoPadrao();
  const tem = (c: string) => cab.campos.includes(c);
  const logo = a.imagens?.find((i) => i.id === cab.logo);
  const mascote = cab.mascote ? a.imagens?.find((i) => i.id === cab.mascote) : null;
  const escola = (cab.escola || extra.escola || "").trim();
  const serie = tem("serie") ? nomeSerie(a.ano) : "";
  const selo = [serie, tem("periodo") && a.periodo ? `${a.periodo}º período` : ""].filter(Boolean).join(" · ");
  const ladoEscola =
    logo || (escola && tem("escola")) ? `<div class="escola">${logo ? `<img src="${logo.dataUrl}" alt="">` : ""}${escola && tem("escola") ? `<span>${esc(escola)}</span>` : ""}</div>` : "";
  // estrelas e selo da materia so com enfeites; serie/periodo so se o professor marcou no cabecalho
  const textoSelo = selo || (e.enfeites ? a.componente : "");
  const faixa = e.enfeites || textoSelo ? `<div class="faixa">${e.enfeites ? estrela("#facc15") : ""}${textoSelo ? `<span class="selo">${esc(textoSelo)}</span>` : ""}${e.enfeites ? estrela("#38bdf8") : ""}</div>` : "";
  const topo = `<div class="topo-cards"><div class="caixa">${ladoEscola}<div class="meio"><h1>${esc(a.titulo)}</h1>${faixa}</div></div>${mascote ? `<div class="mascote"><img src="${mascote.dataUrl}" alt=""></div>` : ""}</div>`;
  const campo = (rot: string, valor = "", cls = "") => `<div class="c${cls}">${rot}: <span>${esc(valor)}&nbsp;</span></div>`;
  const campos = [
    !(escola && (logo || tem("escola"))) && tem("escola") ? campo("Escola", escola, " l") : "",
    tem("aluno") ? campo("Nome", "", " l") : "",
    tem("professor") ? campo("Professor(a)", extra.professor || "") : "",
    tem("turma") ? campo("Turma", a.turma || "") : "",
    tem("data") ? `<div class="c" style="flex:0 0 180px">Data: <span>&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/</span></div>` : "",
    !a.semNota ? `<div class="c" style="flex:0 0 200px">Valor: ${fmtNum(a.valorTotal)}${tem("nota") ? ` &nbsp;Nota: <span></span>` : ""}</div>` : "",
  ].join("");
  const t = a.texto;
  const timg = t?.imagem ? a.imagens?.find((i) => i.id === t.imagem) : null;
  const classeImg = t?.posicao === "direita" ? ' class="dir"' : t?.posicao === "esquerda" ? ' class="esq"' : "";
  const textoHtml = t?.conteudo?.trim()
    ? `<div class="texto texto-cards">${t.titulo ? `<h2>${esc(textoPuro(t.titulo))}</h2>` : ""}${timg ? `<img${classeImg} src="${timg.dataUrl}" alt="">` : ""}${textoPuro(t.conteudo)
        .trim()
        .split(/\n+/)
        .map((par) => `<p>${esc(par)}</p>`)
        .join("")}</div>`
    : "";
  // 2 colunas: questoes curtas lado a lado; questao sozinha na linha ocupa a largura toda
  const largas = a.questoes.map((q) => questaoLarga(q, a));
  const cards: string[] = [];
  let i = 0;
  while (i < a.questoes.length) {
    if (largas[i] || i + 1 >= a.questoes.length || largas[i + 1]) {
      cards.push(questaoCard(a.questoes[i], i + 1, a, true));
      i++;
    } else {
      cards.push(questaoCard(a.questoes[i], i + 1, a, false), questaoCard(a.questoes[i + 1], i + 2, a, false));
      i += 2;
    }
  }
  // frase no rodape so se o professor pediu (a I.A escreve em estilo.rodape)
  const frase = e.rodape?.trim() ?? "";
  const rodape = frase ? `<div class="rodape-cards">${e.enfeites ? estrela("#facc15", 26) : ""}<span>${esc(frase)}</span>${e.enfeites ? estrela("#f472b6", 26) : ""}</div>` : "";
  const corpo = `<div class="folha-cards">${topo}<div class="campos-cards">${campos}</div>${a.instrucoes ? `<div class="instr-cards">${esc(a.instrucoes)}</div>` : ""}${textoHtml}<div class="grade">${cards.join("")}</div>${rodape}</div>`;
  return { corpo, css: CSS_CARDS + cssCards(a) };
}

// Opcoes do professor na folha caprichada (letra, espaco, imagens, letra bastao)
function cssCards(a: Atividade) {
  const e = a.estilo ?? estiloPadrao();
  const h = { pequena: 90, media: 140, grande: 210 }[e.imagem ?? "media"];
  const hf = { pequena: 70, media: 105, grande: 165 }[e.imagem ?? "media"]; // ilustracao em faixa (quadro estreito)
  const fonte =
    e.fonte === "grande"
      ? `.folha-cards{font-size:14.5pt} .topo-cards h1{font-size:24pt} .card .num{width:32px;height:32px} .card .let{width:26px;height:26px}`
      : e.fonte === "extra"
        ? `.folha-cards{font-size:18pt;line-height:1.5} .topo-cards h1{font-size:28pt} .card .num{width:38px;height:38px;font-size:18pt} .card .let{width:30px;height:30px;font-size:14pt} .card .linhas div{height:36px}`
        : "";
  const layout =
    e.layout === "compacto"
      ? `@page{margin:9mm 10mm 10mm} .grade{gap:7px} .card{padding:7px 10px} .card .alt{margin:3px 0} .card .linhas div{height:23px} .topo-cards .caixa{min-height:70px}`
      : e.layout === "amplo"
        ? `.grade{gap:14px} .card{padding:12px 14px} .card .linhas div{height:32px}`
        : "";
  return `.folha-cards{--himg:${h}px;--hfaixa:${hf}px}${fonte}${layout}${e.caixaAlta ? ` .folha-cards{text-transform:uppercase} .pts{text-transform:none}` : ""}`;
}
