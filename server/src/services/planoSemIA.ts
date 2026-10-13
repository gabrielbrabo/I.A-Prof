import { Habilidade } from "../models/Habilidade";
import path from "path";
import { arquivoParaTexto, ItemPdf, pdfParaItens } from "./arquivoParaIA";
import { ItemPlano } from "./planoCurso";

// Leitura do plano SEM IA: acha os codigos de habilidade (EF04MA30MG, EF15LP03, EI03EF01, EM13LGG101...),
// busca a descricao oficial na base e, se o codigo nao estiver la, usa o texto do proprio documento.
// Em PDF com tabela, le POR COLUNA (coluna "Habilidade" e coluna "Habilidades de recomposicao"),
// para a descricao nao misturar com as outras colunas.

const REGEX_CODIGO = /\(?\b((?:EI|EF|EM)\s?\d{2}\s?[A-Z]{2,3}\s?\d{2,3}[A-Z0-9]{0,4})\b\)?/g;

// Componente pelo proprio codigo
const COMP_EF: Record<string, string> = {
  LP: "Língua Portuguesa",
  MA: "Matemática",
  CI: "Ciências",
  GE: "Geografia",
  HI: "História",
  AR: "Arte",
  EF: "Educação Física",
  ER: "Ensino Religioso",
  LI: "Língua Inglesa",
};
const COMP_EI: Record<string, string> = {
  EO: "O eu, o outro e o nós",
  CG: "Corpo, gestos e movimentos",
  TS: "Traços, sons, cores e formas",
  EF: "Escuta, fala, pensamento e imaginação",
  ET: "Espaços, tempos, quantidades, relações e transformações",
};
const COMP_EM: Record<string, string> = {
  LGG: "Linguagens e suas Tecnologias",
  LP: "Linguagens e suas Tecnologias",
  MAT: "Matemática e suas Tecnologias",
  CNT: "Ciências da Natureza e suas Tecnologias",
  CHS: "Ciências Humanas e Sociais Aplicadas",
};

export function componentePorCodigo(codigo: string): string | null {
  const m = codigo.match(/^(EI|EF|EM)\d{2}([A-Z]{2,3})/);
  if (!m) return null;
  const [, etapa, sigla] = m;
  if (etapa === "EF") return COMP_EF[sigla.slice(0, 2)] ?? null;
  if (etapa === "EI") return COMP_EI[sigla.slice(0, 2)] ?? null;
  return COMP_EM[sigla] ?? COMP_EM[sigla.slice(0, 2)] ?? null;
}

// Anos de um codigo: EF04 -> ["4"], EF15 -> 1..5, EF35 -> 3..5, EI03 -> ["EI03"], EM13 -> ["EM"]
export function anosPorCodigo(codigo: string): string[] {
  const m = codigo.match(/^(EI|EF|EM)(\d)(\d)/);
  if (!m) return [];
  const [, etapa, a, b] = m;
  if (etapa === "EI") return [`EI${a}${b}`];
  if (etapa === "EM") return ["EM"];
  const ini = Number(a);
  const fim = Number(b);
  if (ini === 0) return [String(fim)];
  const out: string[] = [];
  for (let n = ini; n <= fim; n++) out.push(String(n));
  return out;
}

export interface Achado {
  codigo: string;
  descricaoDoc: string | null;
  recomposicao: boolean;
  recuperado?: boolean; // nao estava na coluna esperada: entrou pela rede de seguranca (conferir)
  periodo: number | null; // periodo indicado no documento (null = nao indicado)
}

// Trecho de texto com o periodo em que ele esta no documento
interface Linha {
  texto: string;
  periodo: number | null;
}

// Percorre linhas e devolve cada codigo com o texto que vem depois dele (ate o proximo codigo)
function achadosNasLinhas(linhas: Linha[], recomposicao: boolean): Achado[] {
  let texto = "";
  const marcasPeriodo: Array<{ ini: number; periodo: number | null }> = [];
  for (const l of linhas) {
    marcasPeriodo.push({ ini: texto.length, periodo: l.periodo });
    texto += l.texto + "\n";
  }
  const periodoEm = (pos: number) => {
    let p: number | null = null;
    for (const m of marcasPeriodo) if (m.ini <= pos) p = m.periodo;
    return p;
  };
  const marcas = [...texto.matchAll(REGEX_CODIGO)].map((m) => ({
    codigo: m[1].replace(/\s/g, "").toUpperCase(),
    inicio: m.index ?? 0,
    fim: (m.index ?? 0) + m[0].length,
  }));
  return marcas.map((m, i) => {
    const trecho = texto
      .slice(m.fim, Math.min(marcas[i + 1]?.inicio ?? texto.length, m.fim + 900))
      .replace(/^[\s)\-–:.]+/, "")
      .replace(/\s+/g, " ")
      .replace(/[\s(\[–-]+$/, "")
      .trim();
    return { codigo: m.codigo, descricaoDoc: trecho.length >= 15 ? trecho : null, recomposicao, periodo: periodoEm(m.inicio) };
  });
}

// "2º TRIMESTRE", "2 BIMESTRE", "SEGUNDO SEMESTRE", "II TRIMESTRE" -> { numero: 2, unidade: "trimestre" }
const ORDINAIS: Record<string, number> = { PRIMEIRO: 1, SEGUNDO: 2, TERCEIRO: 3, QUARTO: 4, I: 1, II: 2, III: 3, IV: 4 };
const REGEX_PERIODO = /\b([1-4]|PRIMEIRO|SEGUNDO|TERCEIRO|QUARTO|IV|III|II|I)\s*[ºO°ª.]?\s*(BIMESTRE|TRIMESTRE|SEMESTRE)\b/;

export function periodoNoTexto(s: string): { numero: number; unidade: string } | null {
  const m = normal(s).match(REGEX_PERIODO);
  if (!m) return null;
  const numero = /^\d$/.test(m[1]) ? Number(m[1]) : ORDINAIS[m[1]];
  return numero ? { numero, unidade: m[2].toLowerCase() } : null;
}

const normal = (s: string) =>
  s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

interface Faixa {
  esq: number;
  dir: number;
}

interface Colunas {
  hab: Faixa; // coluna "Habilidade"
  rec: Faixa | null; // coluna "Habilidades de recomposicao"
  topo: number; // y do cabecalho (conteudo fica abaixo)
}

// Descobre as colunas da tabela na pagina pelo cabecalho "HABILIDADE" e pelo alinhamento do texto
interface RefColunas {
  cxHab: number; // centro horizontal do cabecalho "Habilidade"
  cxRec: number | null; // centro do cabecalho "Recomposicao"
}

// ref: posicao dos cabecalhos da pagina anterior — usada quando a tabela continua sem repetir o cabecalho
export function colunasDaPagina(itens: ItemPdf[], ref?: RefColunas | null): (Colunas & { ref: RefColunas }) | null {
  // Cabecalho = texto em MAIUSCULAS (uma palavra "habilidade" no meio das orientacoes nao conta); pega o mais alto da pagina
  const emCaixaAlta = (i: ItemPdf) => i.str.trim() === i.str.trim().toUpperCase();
  const maisAlto = (l: ItemPdf[]) => (l.length ? l.reduce((a, b) => (b.y > a.y ? b : a)) : undefined);
  const cabHab = maisAlto(
    itens.filter((i) => emCaixaAlta(i) && ["HABILIDADE", "HABILIDADES", "HABILIDADES DO CRMG", "HABILIDADES DA BNCC"].includes(normal(i.str)))
  );
  const cabRec = maisAlto(itens.filter((i) => emCaixaAlta(i) && normal(i.str).includes("RECOMPOS")));
  const temCodigo = itens.some((i) => /^\(?\s*E[FIM]\s?\d{2}/.test(i.str.trim()));
  if (!cabHab && !temCodigo) return null;
  // Sem cabecalho e sem pagina anterior: referencia neutra (1 grupo de codigos = coluna Habilidade)
  const refAtual: RefColunas = cabHab
    ? { cxHab: cabHab.x + cabHab.w / 2, cxRec: cabRec ? cabRec.x + cabRec.w / 2 : null }
    : ref ?? { cxHab: 0, cxRec: null };
  const topo = cabHab ? Math.min(cabHab.y, cabRec?.y ?? cabHab.y) - 3 : Infinity;
  const corpo = itens.filter((i) => i.y < topo);

  // Inicio de "trecho": pedaco de texto que nao continua outro pedaco na mesma linha.
  // Toda celula comeca num trecho; texto de outra coluna tambem.
  const inicios = corpo
    .filter((it) => !corpo.some((o) => o !== it && Math.abs(o.y - it.y) <= 2 && o.x < it.x && it.x - (o.x + o.w) <= 6))
    .map((it) => Math.round(it.x));

  // Bordas esquerdas das colunas = posicoes onde muitas linhas comecam (texto alinhado a esquerda)
  const freq = new Map<number, number>();
  for (const x of inicios) freq.set(x, (freq.get(x) ?? 0) + 1);
  const candidatas = [...freq.entries()].filter(([, n]) => n >= 3).map(([x]) => x).sort((a, b) => a - b);
  const bordas: number[] = [];
  for (const x of candidatas) if (!bordas.length || x - bordas[bordas.length - 1] > 6) bordas.push(x);
  if (!bordas.length && cabHab) return null;

  // Borda direita da coluna que comeca em esq: o primeiro inicio de trecho a direita que NENHUM texto da
  // coluna atravessa. (Texto justificado tem espacos grandes entre as palavras: uma palavra solta no meio
  // da linha nao e outra coluna, porque as linhas mais longas da propria coluna passam por cima dela.)
  // Candidatas: onde algum trecho comeca, ou onde 2+ pedacos de texto comecam alinhados (colunas muito juntas,
  // com espaco menor que o entre palavras, nao geram "inicio de trecho").
  const xsTodos = corpo.map((it) => Math.round(it.x));
  const freqX = new Map<number, number>();
  for (const x of xsTodos) freqX.set(x, (freqX.get(x) ?? 0) + 1);
  const alinhados = [...freqX.entries()].filter(([, n]) => n >= 2).map(([x]) => x);
  const direita = (esq: number): number => {
    const cand = [...new Set([...inicios, ...alinhados].filter((x) => x > esq + 10))].sort((a, b) => a - b);
    for (const x of cand) {
      const comecam = xsTodos.filter((i) => Math.abs(i - x) <= 2).length;
      const atravessam = corpo.filter((it) => it.x >= esq - 2 && it.x < x - 2 && it.x + it.w > x + 2).length;
      // borda de verdade: varias linhas comecam ali e quase nada da coluna passa por cima
      if (atravessam === 0 || (comecam >= 3 && atravessam <= comecam * 0.25)) return x;
    }
    return Infinity;
  };

  // Faixa da coluna cujo cabecalho esta centralizado em cx:
  // comeca na ultima borda antes de cx e termina na borda da proxima coluna
  const faixa = (cx: number): Faixa | null => {
    const esq = [...bordas].reverse().find((b) => b <= cx + 2);
    if (esq == null) return null;
    return { esq, dir: direita(esq) };
  };
  if (cabHab) {
    const hab = faixa(refAtual.cxHab);
    if (!hab) return null;
    const rec = refAtual.cxRec != null ? faixa(refAtual.cxRec) : null;
    return { hab, rec: rec && rec.esq !== hab.esq ? rec : null, topo, ref: refAtual };
  }

  // Sem cabecalho (tabela continuando): as colunas sao achadas pelos codigos "(EF..." que abrem as celulas.
  // Cada grupo de codigos alinhados vira uma coluna; o mais perto do cabecalho anterior decide se e Habilidade ou Recomposicao.
  const xsCodigo = corpo.filter((i) => /^\(?\s*E[FIM]\s?\d{2}/.test(i.str.trim())).map((i) => Math.round(i.x)).sort((a, b) => a - b);
  const grupos: number[] = [];
  for (const x of xsCodigo) if (!grupos.length || x - grupos[grupos.length - 1] > 15) grupos.push(x);
  // A coluna Habilidade vem antes da de Recomposicao: com 2 grupos, o 1º e habilidade e o 2º recomposicao.
  // Com 1 grupo so, decide pela posicao do cabecalho anterior.
  let habG: number | null = null;
  let recG: number | null = null;
  if (grupos.length >= 2) {
    habG = grupos[0];
    recG = grupos[1];
  } else if (grupos.length === 1) {
    const g = grupos[0];
    const pertoRec = refAtual.cxRec != null && Math.abs(g - refAtual.cxRec) < Math.abs(g - refAtual.cxHab);
    if (pertoRec) recG = g;
    else habG = g;
  }
  const faixaDe = (g: number | null): Faixa | null => (g == null ? null : { esq: g, dir: direita(g) });
  const hab = faixaDe(habG);
  const rec = faixaDe(recG);
  if (!hab && !rec) return null;
  // Se so ha codigos de recomposicao na pagina, a coluna de habilidade fica vazia (faixa impossivel)
  return { hab: hab ?? { esq: Infinity, dir: Infinity }, rec, topo, ref: refAtual };
}

const naFaixa = (it: ItemPdf, f: Faixa) => it.x >= f.esq - 2 && it.x < f.dir - 1;

// Agrupa pedacos em linhas com a altura (y), de cima para baixo
function linhasComY(itens: ItemPdf[]): Array<{ y: number; texto: string }> {
  const linhas: Array<{ y: number; partes: ItemPdf[] }> = [];
  for (const it of [...itens].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = linhas.find((x) => Math.abs(x.y - it.y) <= 2);
    if (l) l.partes.push(it);
    else linhas.push({ y: it.y, partes: [it] });
  }
  return linhas.map((l) => ({ y: l.y, texto: l.partes.sort((a, b) => a.x - b.x).map((p) => p.str).join(" ") }));
}

export interface LeituraSemIA {
  achados: Achado[];
  unidades: Set<string>; // divisoes citadas no documento (bimestre/trimestre/semestre)
  codigosNoTexto: Set<string>; // conferencia: todos os codigos que aparecem no arquivo
  semTexto: boolean; // foto ou PDF escaneado
  porColuna: boolean; // PDF com tabela lido pelas colunas "Habilidade"/"Recomposicao"
}

// Le um PDF com tabela, coluna por coluna, guardando o periodo ("2º TRIMESTRE") de cada linha.
// Retorna null se nao achar a tabela de habilidades.
export function lerPdfPorColuna(paginas: ItemPdf[][], unidades: Set<string>): Achado[] | null {
  const hab: Linha[] = [];
  const rec: Linha[] = [];
  let achouTabela = false;
  let periodoAtual: number | null = null;
  let ultimaRef: RefColunas | null = null;

  for (const itens of paginas) {
    // Marcas de periodo na pagina (titulo/cabecalho), com a altura
    const marcas = linhasComY(itens)
      .map((l) => ({ y: l.y, p: periodoNoTexto(l.texto) }))
      .filter((m): m is { y: number; p: { numero: number; unidade: string } } => !!m.p)
      .sort((a, b) => b.y - a.y);
    marcas.forEach((m) => unidades.add(m.p.unidade));
    const periodoDaLinha = (y: number) => {
      const acima = marcas.filter((m) => m.y > y);
      return acima.length ? acima[acima.length - 1].p.numero : periodoAtual;
    };

    // Pagina sem cabecalho mas com codigos: continuacao da tabela anterior (usa as mesmas colunas)
    const cols = colunasDaPagina(itens, ultimaRef);
    if (cols) {
      ultimaRef = cols.ref;
      achouTabela = true;
      const corpo = itens.filter((i) => i.y < cols.topo);
      for (const l of linhasComY(corpo.filter((i) => naFaixa(i, cols.hab)))) hab.push({ texto: l.texto, periodo: periodoDaLinha(l.y) });
      if (cols.rec) for (const l of linhasComY(corpo.filter((i) => naFaixa(i, cols.rec!)))) rec.push({ texto: l.texto, periodo: periodoDaLinha(l.y) });
    }
    if (marcas.length) periodoAtual = marcas[marcas.length - 1].p.numero; // vale para as proximas paginas
  }

  if (!achouTabela) return null;
  const achados = [...achadosNasLinhas(hab, false), ...achadosNasLinhas(rec, true)];
  return achados.length ? achados : null;
}

// Texto corrido (Word, Excel, CSV, TXT ou PDF sem tabela): uma linha com "2º TRIMESTRE" muda o periodo
function lerTextoCorrido(texto: string, unidades: Set<string>): Achado[] {
  let periodo: number | null = null;
  const linhas: Linha[] = texto.split(/\r?\n/).map((t) => {
    const p = periodoNoTexto(t);
    if (p) {
      periodo = p.numero;
      unidades.add(p.unidade);
    }
    return { texto: t, periodo };
  });
  return achadosNasLinhas(linhas, false);
}

// Le um arquivo SEM IA: codigos, descricoes e o periodo de cada um (quando o documento indica)
export async function lerArquivoSemIA(nome: string, buffer: Buffer): Promise<LeituraSemIA> {
  const unidades = new Set<string>();
  const texto = await arquivoParaTexto(nome, buffer);
  if (texto === null) return { achados: [], unidades, codigosNoTexto: new Set(), semTexto: true, porColuna: false };

  const codigosNoTexto = new Set(achadosNasLinhas([{ texto, periodo: null }], false).map((a) => a.codigo));
  const porColuna = path.extname(nome).toLowerCase() === ".pdf" ? lerPdfPorColuna(await pdfParaItens(buffer), unidades) : null;
  const achados = porColuna ?? lerTextoCorrido(texto, unidades);

  // Rede de seguranca: todo codigo escrito entre parenteses "(EF35LP03)" e formato de habilidade em tabela.
  // Se a leitura por coluna nao pegou, entra mesmo assim (marcado para conferir) — nenhuma habilidade fica de fora.
  if (porColuna) {
    const capturados = new Set(achados.map((a) => a.codigo));
    const doTexto = lerTextoCorrido(texto, new Set());
    const entreParenteses = new Set(
      [...texto.matchAll(/\(\s*((?:EI|EF|EM)\s?\d{2}\s?[A-Z]{2,3}\s?\d{2,3}[A-Z0-9]{0,4})\s*\)/g)].map((m) => m[1].replace(/\s/g, "").toUpperCase())
    );
    for (const cod of entreParenteses) {
      if (capturados.has(cod)) continue;
      const a = doTexto.find((x) => x.codigo === cod);
      achados.push({ codigo: cod, descricaoDoc: a?.descricaoDoc ?? null, recomposicao: false, periodo: a?.periodo ?? null, recuperado: true });
    }
  }
  return { achados, unidades, codigosNoTexto, semTexto: false, porColuna: !!porColuna };
}

// Texto que parece misturado com outra coluna (ex.: "Verificar - Microrganismos a participação de - Microrganismos")
export function textoSuspeito(t: string | null | undefined): boolean {
  if (!t) return false;
  const marcas = t.match(/\s[-–•]\s+[A-Za-zÀ-ÿ][\wÀ-ÿ]*/g) ?? [];
  const cont = new Map<string, number>();
  for (const m of marcas) {
    const k = m.replace(/[\s\-–•]+/g, " ").trim().toLowerCase();
    cont.set(k, (cont.get(k) ?? 0) + 1);
  }
  return [...cont.values()].some((n) => n >= 2);
}

// Semelhanca entre dois textos (palavras de 4+ letras em comum): 0 a 1
function semelhanca(a: string, b: string): number {
  const pal = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4)
    );
  const A = pal(a);
  const B = pal(b);
  if (!A.size || !B.size) return 0;
  let comum = 0;
  A.forEach((w) => B.has(w) && comum++);
  return comum / Math.min(A.size, B.size);
}

// Diferenca de palavras entre o texto do documento e o oficial (palavras de 3+ letras, sem acento)
export function diferencaPalavras(doc: string, oficial: string): { soNoDoc: string[]; soNoOficial: string[] } {
  const pal = (t: string) =>
    t
      .split(/\s+/)
      .map((w) => w.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, ""))
      .filter((w) => w.length >= 3);
  const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const A = pal(doc);
  const B = pal(oficial);
  const nA = new Set(A.map(norm));
  const nB = new Set(B.map(norm));
  return {
    soNoDoc: [...new Set(A.filter((w) => !nB.has(norm(w))))],
    soNoOficial: [...new Set(B.filter((w) => !nA.has(norm(w))))],
  };
}

// Texto do documento QUASE igual ao oficial (1 a 3 palavras trocadas/faltando): provavel erro de digitacao no PDF.
// Acrescimos maiores (ex.: curriculo do estado amplia a habilidade) nao contam: o plano do professor manda.
function sugerirOficial(doc: string, oficial: string): boolean {
  if (!/[.;!?)]\s*$/.test(oficial.trim())) return false; // texto oficial da base parece cortado: nao sugere
  // So pontuacao/espacos diferentes (ex.: "gráfico-visuais" x "gráfico- visuais"): nao e erro
  const so = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  if (so(doc) === so(oficial)) return false;
  const { soNoDoc, soNoOficial } = diferencaPalavras(doc, oficial);
  const total = soNoDoc.length + soNoOficial.length;
  return total > 0 && soNoDoc.length <= 3 && soNoOficial.length <= 3 && semelhanca(doc, oficial) >= 0.75;
}

// Junta palavras partidas no documento ("comu nicativa" -> "comunicativa") quando o texto oficial confirma a palavra
function juntarPartidas(doc: string, oficial: string | null | undefined): string {
  if (!oficial) return doc;
  const norm = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const palavras = new Set(oficial.split(/\s+/).map(norm).filter(Boolean));
  const t = doc.split(" ");
  const saida: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const a = t[i];
    const b = t[i + 1];
    if (b && palavras.has(norm(a + b)) && (!palavras.has(norm(a)) || !palavras.has(norm(b)))) {
      saida.push(a + b);
      i++;
    } else saida.push(a);
  }
  return saida.join(" ");
}

// Monta os itens do plano. Texto da habilidade:
// 1) o texto EXATO do documento (o plano do professor manda — inclui as variacoes do curriculo do estado);
// 2) se o documento nao trouxe texto, ou o texto parece misturado com outra coluna: o texto oficial (BNCC/curriculo do
//    estado importado), marcado como "texto oficial";
// 3) texto de planos anteriores (fonte PLANO-CURSO) so como ultimo recurso.
// O oficial tambem serve de conferencia: texto do documento muito diferente do oficial fica marcado "conferir".
export async function montarItens(achados: Achado[], uf?: string | null): Promise<ItemPlano[]> {
  const unicos = [...new Set(achados.map((a) => a.codigo))];
  const docs = await Habilidade.find({ codigo: { $in: unicos } }).lean();
  const ufPlano = uf ? uf.toUpperCase() : null;
  const oficial = new Map<string, (typeof docs)[number]>();
  const daBase = new Map<string, (typeof docs)[number]>();
  for (const d of docs) {
    daBase.set(d.codigo, d);
    const ehOficial = d.fonte !== "PLANO-CURSO" && (!d.uf || !ufPlano || d.uf === ufPlano);
    if (ehOficial) oficial.set(d.codigo, d);
  }

  // Habilidade principal tem prioridade sobre recomposicao quando o mesmo codigo aparece nos dois
  const porCodigo = new Map<string, Achado>();
  for (const a of achados) {
    const atual = porCodigo.get(a.codigo);
    if (!atual) porCodigo.set(a.codigo, a);
    else if (atual.recomposicao && !a.recomposicao) porCodigo.set(a.codigo, a);
    else if (!atual.descricaoDoc && a.descricaoDoc && atual.recomposicao === a.recomposicao) porCodigo.set(a.codigo, a);
  }

  const itens: ItemPlano[] = [];
  for (const a of porCodigo.values()) {
    const of = oficial.get(a.codigo);
    const base = daBase.get(a.codigo);
    const componente = of?.componente ?? base?.componente ?? componentePorCodigo(a.codigo);
    if (!componente) continue;
    const suspeito = textoSuspeito(a.descricaoDoc);
    const doc = a.descricaoDoc ? juntarPartidas(a.descricaoDoc, of?.habilidade) : null;
    let habilidade: string | null;
    let conferir = !!a.recuperado;
    let origemTexto: "oficial" | "documento";
    let textoOficial: string | null = null;
    if (doc && !suspeito) {
      habilidade = doc;
      origemTexto = "documento";
      // Mesmo codigo, texto muito diferente do oficial: pode ser leitura errada ou codigo trocado no documento
      if (of && semelhanca(doc, of.habilidade) < 0.5) conferir = true;
      // Quase igual ao oficial: provavel erro de digitacao no PDF -> sugere o texto oficial (o professor decide)
      if (of && sugerirOficial(doc, of.habilidade)) {
        textoOficial = of.habilidade;
        conferir = true;
      }
    } else if (of) {
      habilidade = of.habilidade;
      origemTexto = "oficial";
    } else {
      habilidade = doc ?? base?.habilidade ?? null;
      origemTexto = "documento";
      conferir = true;
    }
    itens.push({
      componente,
      codigo: a.codigo,
      habilidade,
      conteudo: of?.objetoConhecimento ?? null,
      noBanco: !!base,
      recomposicao: a.recomposicao,
      conferir,
      origemTexto,
      textoOficial,
    });
  }
  return itens;
}

