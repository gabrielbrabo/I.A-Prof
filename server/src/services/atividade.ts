import Anthropic from "@anthropic-ai/sdk";
import { chamarJson } from "./ai/claude";
import { chamarJsonOpenAI, ParteOpenAI } from "./ai/openai";
import { periodoDoPlano } from "./registroAula";
import { nomeAno } from "../utils/anos";
import { mesmoComponente } from "../utils/componente";
import { env } from "../config/env";
import { gerarImagens, imagensLigadas } from "./imagens";

// ---------- Tipos ----------
export type TipoQuestao = "multipla" | "vf" | "discursiva" | "completar";
export interface Figura {
  tipo: "" | "emoji" | "svg";
  conteudo: string;
}
export interface Questao {
  _id?: unknown;
  tipo: TipoQuestao;
  enunciado: string;
  alternativas: string[];
  itens: Array<{ texto: string; resposta: "V" | "F" }>;
  resposta: string;
  criterios: string;
  valor: number;
  linhas?: number; // linhas para resposta (discursiva/completar); 0 = automatico
  imagem?: string; // id de uma imagem (enviada pelo professor ou gerada pela I.A de imagem)
  figura?: Figura; // ilustracao simples feita pela I.A (emoji ou desenho SVG)
}
// Texto de apoio (leitura e interpretacao)
export interface TextoBase {
  titulo: string;
  conteudo: string;
  imagem: string; // id da ilustracao do texto
}
export interface Cabecalho {
  escola: string;
  logo: string; // id da imagem do professor usada como logo ("" = sem logo)
  campos: string[]; // aluno, data, turma, professor, nota, escola
}
export interface Estilo {
  fonte: "normal" | "grande" | "extra";
  colorido: boolean;
  caixaAlta: boolean; // letra bastao (tudo maiusculo), para quem esta aprendendo a ler
  layout: "compacto" | "normal" | "amplo"; // aproveitamento da folha
  imagem: "pequena" | "media" | "grande"; // tamanho das imagens
  colunas: boolean; // alternativas curtas em 2 colunas (economiza espaco)
}
export const CAMPOS_CABECALHO = ["escola", "professor", "turma", "aluno", "data", "nota", "serie", "periodo"];
// serie e periodo so aparecem se o professor pedir/marcar
export const CAMPOS_PADRAO = ["escola", "professor", "turma", "aluno", "data", "nota"];

// Desenho SVG da I.A: so formas basicas, sem script/eventos/links. (No app ele e mostrado como <img>, que ja nao roda script.)
export function limparSvg(svg: string): string {
  let s = String(svg || "").trim();
  if (!/^<svg[\s>]/i.test(s) || s.length > 8000) return "";
  s = s
    .replace(/<\s*(script|foreignObject|iframe|object|embed|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|foreignObject|iframe|object|embed|image|use)\b[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  if (!/xmlns=/.test(s)) s = s.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return s;
}
export function limparFigura(f?: Partial<Figura> | null): Figura {
  const tipo = f?.tipo === "emoji" || f?.tipo === "svg" ? f.tipo : "";
  if (tipo === "emoji") return { tipo, conteudo: String(f?.conteudo ?? "").slice(0, 60) };
  if (tipo === "svg") {
    const c = limparSvg(String(f?.conteudo ?? ""));
    return c ? { tipo, conteudo: c } : { tipo: "", conteudo: "" };
  }
  return { tipo: "", conteudo: "" };
}
export interface RespostaAluno {
  questao: string;
  resposta: string;
  itens: string[];
  pontos: number;
  comentario: string;
  duvida: boolean;
}

export class ErroAtividade extends Error {}

const arred = (n: number) => Math.round(n * 100) / 100;
export const letra = (i: number) => String.fromCharCode(65 + i);

// ---------- Pontuacao (mesma regra na correcao manual e na da I.A) ----------
// Objetivas sao calculadas pelo gabarito (nunca pela I.A): multipla = acertou a letra; V/F = valor dividido pelos itens.
// Discursiva/completar: pontos dados pelo professor (ou sugeridos pela I.A), limitados ao valor da questao.
export function pontuar(q: Questao, r: Pick<RespostaAluno, "resposta" | "itens" | "pontos">): number {
  if (q.tipo === "multipla") {
    return r.resposta.trim().toUpperCase() === q.resposta.trim().toUpperCase() && q.resposta.trim() ? q.valor : 0;
  }
  if (q.tipo === "vf") {
    if (!q.itens.length) return 0;
    const certos = q.itens.filter((it, i) => (r.itens[i] || "").toUpperCase() === it.resposta).length;
    return arred((q.valor * certos) / q.itens.length);
  }
  return arred(Math.min(q.valor, Math.max(0, Number(r.pontos) || 0)));
}

export function calcularNota(questoes: Questao[], respostas: RespostaAluno[]) {
  const porId = new Map(respostas.map((r) => [r.questao, r]));
  let nota = 0;
  const lista = questoes.map((q) => {
    const id = String(q._id);
    const r = porId.get(id) ?? { questao: id, resposta: "", itens: [], pontos: 0, comentario: "", duvida: false };
    const pontos = pontuar(q, r);
    nota += pontos;
    return { ...r, questao: id, pontos };
  });
  return { respostas: lista, nota: arred(nota) };
}

// ---------- Gerar a atividade ----------
const SYSTEM_GERAR = `Você é um professor experiente da educação básica brasileira e cria atividades para os alunos.
Crie a atividade pedida pelo professor, adequada à série, com linguagem clara para os alunos e o gabarito para o professor.

Tipos de questão:
- "multipla": enunciado + 3 a 5 alternativas (sem letras no texto da alternativa) + "resposta" = letra correta ("A", "B"...).
- "vf": enunciado (ex.: "Marque V para verdadeiro e F para falso") + "itens" com 3 a 6 afirmações, cada uma com "resposta" "V" ou "F".
- "discursiva": pergunta aberta + "resposta" = resposta esperada + "criterios" = como dar nota (o que vale total, o que vale metade).
- "completar": frase(s) com lacunas "____" ou perguntas de resposta curta + "resposta" = respostas esperadas na ordem.

Regras:
- Siga o que o professor pediu (tipos, quantidade, tema). Se não disser a quantidade, faça de 5 a 8 questões.
- Quando o professor escolher habilidades, TODAS as questões devem trabalhar essas habilidades (distribua as questões entre elas). Em "habilidades" devolva os códigos usados.
- Distribua o "valor" das questões para somar exatamente o valor total informado (use no máximo 1 casa decimal; discursivas costumam valer mais).
- Campos que não se aplicam ao tipo ficam vazios ("" ou []).
- Não coloque a resposta no enunciado.
- "instrucoes": uma linha para o aluno (ex.: "Leia com atenção e responda.").

Leitura e interpretação: se o professor pedir leitura/interpretação de texto (ou "texto"), escreva em "texto" um texto ORIGINAL adequado à série (título + conteúdo: fábula, conto, notícia, poema, bilhete, receita… conforme o pedido; 1º/2º ano: curto, frases simples; 3º–5º: 1 a 3 parágrafos) e faça as questões sobre ESSE texto (localizar informação, inferir, sentido de palavra, ideia principal, opinião…). Sem texto de apoio: "texto" com campos vazios.

Quantidade: faça EXATAMENTE o número de questões pedido. "Variadas/abertas e fechadas": misture tipos (fechadas = multipla e vf; abertas = discursiva e completar), metade de cada se não disser.

Cabeçalho: use os dados informados (escola, professor, turma, série) e deixe linhas para aluno e data. "Faça o cabeçalho" = cabeçalho completo e caprichado.

Fonte/legibilidade: "fonte nítida/adequada à idade" ou alunos pequenos → "estilo.fonte" "grande" (2º–3º ano) ou "extra" (educação infantil e 1º ano) e frases curtas. "estilo.caixaAlta": true para educação infantil e 1º ano (letra bastão) ou se o professor pedir letra de forma maiúscula.

Qualidade (como uma professora experiente faria): questões bem escritas, criativas e contextualizadas no mundo da criança, enunciados curtos e claros, comandos variados (marque, circule, complete, ligue com palavras, escreva, desenhe), distratores plausíveis nas alternativas, progressão do mais fácil ao mais difícil, nada repetitivo, português correto. Revise antes de devolver.

Aproveitamento da folha: "estilo.layout" = "compacto" (menos espaço em branco, imagem ao lado da questão — use quando pedirem para economizar papel/usar melhor o espaço), "normal" ou "amplo" (mais espaço, bom para os pequenos). "estilo.imagem" = "pequena" | "media" | "grande". "estilo.colunas": true para colocar alternativas curtas em 2 colunas. "linhas" de cada questão = quantas linhas para a resposta (discursiva 3–6, completar 1–2; 0 = automático).

SEJA FIEL AO PROFESSOR — a atividade deve ficar exatamente do jeito que ele pediu (tema, quantidade, tipos, nível, linguagem, visual, cabeçalho, imagens, fonte grande, colorida…). Nunca ignore um pedido.

Imagens e figuras:
- "figura" de cada questão é uma ilustração feita por você: {"tipo":"emoji","conteudo":"🍎🍎🍎"} (emojis grandes — preferido: barato e bonito) ou {"tipo":"svg","conteudo":"<svg ...>…</svg>"} (desenho simples e colorido, viewBox pequeno, só formas básicas, no máximo 1500 caracteres, no máximo 4 desenhos SVG por atividade). Sem figura: {"tipo":"","conteudo":""}.
- Se o professor pedir imagens/figuras/desenhos/ilustrações (ou a atividade for para crianças pequenas e ele pedir algo atrativo), coloque figura em TODAS ou quase todas as questões. Figuras de contagem devem ter a quantidade certa.
- "ilustracao" de cada questão (e do texto): quando o professor pedir IMAGENS, descreva em português, em uma frase concreta, a ilustração que deve ser desenhada para aquela questão (ex.: "três maçãs vermelhas em cima de uma mesa", "um menino lendo um livro embaixo de uma árvore"). Ela vira uma imagem de verdade. Nunca peça texto escrito dentro da imagem. Para questões de contagem, diga a quantidade exata. Sem imagem: "". Mesmo com "ilustracao", preencha "figura" com um emoji parecido (fica de reserva).
- "imagem" de cada questão: o id de uma imagem ENVIADA pelo professor (lista "Imagens do professor") quando ele pedir para usá-la na questão; senão "".
- "cabecalho.logo": id da imagem enviada que é a logo/brasão da escola, se o professor pedir para colocar no cabeçalho; senão "".
- "cabecalho.escola": nome da escola, se o professor informar; senão "".
- "cabecalho.campos": quais linhas o cabeçalho mostra, entre: escola, professor, turma, aluno, data, nota, serie, periodo. Padrão: escola, professor, turma, aluno, data, nota. "serie" (ano escolar) e "periodo" (bimestre/trimestre) SÓ se o professor pedir. Siga o pedido (ex.: "sem nota" → tire "nota").
- "estilo.fonte": "normal", "grande" ou "extra" (letra grande para educação infantil / 1º ano ou se o professor pedir). "estilo.colorido": true se pedir colorida/chamativa.

Quando FALTAR algo que o professor pediu e só ele pode dar (ex.: pediu a logo da escola no cabeçalho mas não enviou nenhuma imagem; pediu "o texto que trabalhamos" sem mandar o texto; pediu o nome da escola sem dizer qual), devolva "status":"perguntas" com as perguntas curtas e diretas em "perguntas" (e o resto pode vir vazio). Se der para fazer tudo, devolva "status":"pronta" e "perguntas": [].
Se houver "Respostas do professor", use-as.

AJUSTE: se houver "Atividade atual" + "Pedido de ajuste", aplique TODAS as mudanças pedidas, de forma visível e caprichada, e mantenha o resto (mesmas questões, gabarito e valores, a menos que o ajuste peça mudança). Devolva a atividade inteira.
- "Melhorar/trocar as imagens" → escreva em "ilustracao" uma descrição NOVA, mais rica e específica (cena, cores, quantidade, expressão) para cada questão que deve ter imagem — as imagens com "ilustracao" preenchida são desenhadas de novo. Para manter a imagem atual de uma questão, deixe "ilustracao" vazia e repita o "imagem" dela.
- "Usar melhor o espaço/folha" → ajuste "estilo.layout" (compacto), "estilo.imagem", "estilo.colunas" e "linhas".
- "Mais fácil/difícil", "trocar questão", "letra maior", "mais colorida", "tirar a nota do cabeçalho"… → mude exatamente isso.
Nunca devolva a atividade igual: o professor precisa ver o ajuste feito.

ANTES DE DEVOLVER, confira item por item (refaça o que falhar):
1. Cada pedido do professor foi atendido? (quantidade exata, tipos, tema, nível, texto, cabeçalho, imagens, fonte, cores, espaço da folha, o que ele disse para tirar ou incluir)
2. Os campos escolhidos acima (série, matéria, período, habilidades, turma, escola, professor, valor) estão respeitados?
3. Gabarito certo em todas as questões (letra da alternativa correta, V/F, respostas esperadas, critérios) e valores somando o total?
4. Linguagem e tamanho adequados à idade; português correto; nada repetido; respostas que não aparecem no enunciado?
5. Pediu imagens → "ilustracao" concreta em todas (ou quase todas) as questões e no texto, com quantidades certas e sem texto escrito na imagem?`;

const SCHEMA_ATIVIDADE = {
  type: "object",
  properties: {
    titulo: { type: "string" },
    instrucoes: { type: "string" },
    habilidades: { type: "array", items: { type: "string" } },
    questoes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["multipla", "vf", "discursiva", "completar"] },
          enunciado: { type: "string" },
          alternativas: { type: "array", items: { type: "string" } },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: { texto: { type: "string" }, resposta: { type: "string", enum: ["V", "F"] } },
              required: ["texto", "resposta"],
              additionalProperties: false,
            },
          },
          resposta: { type: "string" },
          criterios: { type: "string" },
          valor: { type: "number" },
          imagem: { type: "string" },
          ilustracao: { type: "string" },
          linhas: { type: "integer" },
          figura: {
            type: "object",
            properties: { tipo: { type: "string", enum: ["", "emoji", "svg"] }, conteudo: { type: "string" } },
            required: ["tipo", "conteudo"],
            additionalProperties: false,
          },
        },
        required: ["tipo", "enunciado", "alternativas", "itens", "resposta", "criterios", "valor", "imagem", "ilustracao", "linhas", "figura"],
        additionalProperties: false,
      },
    },
    texto: {
      type: "object",
      properties: { titulo: { type: "string" }, conteudo: { type: "string" }, ilustracao: { type: "string" } },
      required: ["titulo", "conteudo", "ilustracao"],
      additionalProperties: false,
    },
    status: { type: "string", enum: ["pronta", "perguntas"] },
    perguntas: { type: "array", items: { type: "string" } },
    cabecalho: {
      type: "object",
      properties: { escola: { type: "string" }, logo: { type: "string" }, campos: { type: "array", items: { type: "string" } } },
      required: ["escola", "logo", "campos"],
      additionalProperties: false,
    },
    estilo: {
      type: "object",
      properties: {
        fonte: { type: "string", enum: ["normal", "grande", "extra"] },
        colorido: { type: "boolean" },
        caixaAlta: { type: "boolean" },
        layout: { type: "string", enum: ["compacto", "normal", "amplo"] },
        imagem: { type: "string", enum: ["pequena", "media", "grande"] },
        colunas: { type: "boolean" },
      },
      required: ["fonte", "colorido", "caixaAlta", "layout", "imagem", "colunas"],
      additionalProperties: false,
    },
  },
  required: ["status", "perguntas", "titulo", "instrucoes", "texto", "habilidades", "questoes", "cabecalho", "estilo"],
  additionalProperties: false,
};

// Ajusta os valores para somar o total (proporcional; a diferenca de arredondamento vai na ultima questao)
export function ajustarValores<T extends { valor: number }>(questoes: T[], total: number): T[] {
  if (!questoes.length || !(total > 0)) return questoes;
  const soma = questoes.reduce((s, q) => s + (Number(q.valor) || 0), 0);
  const base = soma > 0 ? questoes.map((q) => (Number(q.valor) || 0) / soma) : questoes.map(() => 1 / questoes.length);
  const novos = base.map((b) => Math.round(b * total * 10) / 10);
  const dif = Math.round((total - novos.reduce((s, v) => s + v, 0)) * 10) / 10;
  novos[novos.length - 1] = Math.max(0, Math.round((novos[novos.length - 1] + dif) * 10) / 10);
  return questoes.map((q, i) => ({ ...q, valor: novos[i] }));
}

export interface ImagemProfessor {
  id: string;
  nome: string;
  dataUrl: string; // miniatura (para a I.A ver o que e)
}

export async function gerarAtividade(p: {
  usuario: string;
  ano: string;
  anoLetivo: number;
  periodo: number;
  componente: string;
  detalhes: string;
  valorTotal: number;
  habilidades?: string[]; // codigos escolhidos pelo professor (do plano do periodo)
  turma?: string | null;
  imagens?: ImagemProfessor[]; // imagens enviadas pelo professor (logo, figuras...)
  respostas?: string | null; // respostas as perguntas que a I.A fez
  atual?: Record<string, unknown> | null; // atividade ja gerada (para ajuste)
  ajuste?: string | null; // o que o professor quer mudar
  escola?: string | null; // para o cabecalho
  professor?: string | null;
  preferencias?: string; // o que a I.A aprendeu do professor
}) {
  // Habilidades do plano de curso do periodo, do mesmo componente
  let habilidadesPlano: Array<{ codigo: string; habilidade: string }> = [];
  try {
    const ctx = await periodoDoPlano(p.usuario, p.ano, p.anoLetivo, p.periodo, p.turma);
    habilidadesPlano = ctx.itens
      .filter((i) => mesmoComponente(i.componente, p.componente))
      .map((i) => ({ codigo: String(i.codigo), habilidade: String(i.habilidade) }));
  } catch {
    /* sem plano: gera so pelo pedido do professor */
  }
  // O professor escolhe as habilidades: so valem as do plano do periodo/materia
  const pedidas = new Set((p.habilidades ?? []).map((c) => c.toUpperCase()));
  const escolhidas = habilidadesPlano.filter((h) => pedidas.has(h.codigo.toUpperCase()));
  if (pedidas.size && !escolhidas.length) throw new ErroAtividade("As habilidades escolhidas não estão no plano de curso deste período e matéria.");
  if (!pedidas.size && habilidadesPlano.length) throw new ErroAtividade("Escolha pelo menos uma habilidade do plano de curso para a atividade.");
  const lista = escolhidas.length
    ? `A atividade DEVE trabalhar estas habilidades (escolhidas pelo professor):\n${escolhidas.map((h) => `(${h.codigo}) ${h.habilidade}`).join("\n")}`
    : "(sem plano de curso cadastrado para este período e matéria — use só o pedido do professor)";

  // Imagens do professor: a I.A ve as miniaturas para saber o que cada uma e (logo, figura...)
  const imagens = (p.imagens ?? []).slice(0, 20);
  const blocos: ParteOpenAI[] = [];
  for (const im of imagens) {
    if (!/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(im.dataUrl || "")) continue;
    blocos.push({ type: "input_text", text: `Imagem do professor — id "${im.id}", nome "${im.nome}":` });
    blocos.push({ type: "input_image", image_url: im.dataUrl, detail: "low" });
  }
  const ids = imagens.map((i) => i.id);
  const partes = [
    `Série: ${nomeAno(p.ano)}\nComponente: ${p.componente}\nPeríodo: ${p.periodo}º\nValor total da atividade: ${p.valorTotal}\nTurma: ${p.turma || "-"}\nEscola: ${p.escola || "-"}\nProfessor(a): ${p.professor || "-"}\nGerar imagens de verdade: ${imagensLigadas() ? "sim (use \"ilustracao\")" : "não disponível (use só \"figura\" com emoji/desenho)"}`,
    lista,
    `Imagens do professor: ${imagens.length ? imagens.map((i) => `"${i.id}" (${i.nome})`).join(", ") : "nenhuma enviada"}`,
    ...(p.preferencias ? [p.preferencias] : []),
    `Pedido do professor:\n"""${p.detalhes}"""`,
  ];
  if (p.respostas?.trim()) partes.push(`Respostas do professor às suas perguntas:\n"""${p.respostas.trim()}"""`);
  if (p.atual && p.ajuste?.trim()) {
    partes.push(`Atividade atual (JSON):\n${JSON.stringify(p.atual).slice(0, 20000)}`);
    partes.push(`Pedido de ajuste do professor:\n"""${p.ajuste.trim()}"""`);
  }
  blocos.push({ type: "input_text", text: partes.join("\n\n") });

  type QuestaoIA = Questao & { ilustracao?: string };
  type Resp = {
    status: "pronta" | "perguntas";
    perguntas: string[];
    titulo: string;
    instrucoes: string;
    texto: { titulo: string; conteudo: string; ilustracao: string };
    habilidades: string[];
    questoes: QuestaoIA[];
    cabecalho: Cabecalho;
    estilo: Estilo;
  };
  const chamar = (extra?: string) =>
    // Gerar e ajustar atividades: so OpenAI (GPT)
    chamarJsonOpenAI<Resp>({
      system: SYSTEM_GERAR,
      partes: extra ? [...blocos, { type: "input_text", text: extra }] : blocos,
      nome: "gerar_atividade",
      schema: SCHEMA_ATIVIDADE,
      cacheKey: `ativ-${p.usuario}`,
    });
  let r = await chamar();
  // Fidelidade: o professor pediu N questoes e veio outro numero -> pede de novo uma vez
  const pedidoN = p.ajuste ? null : quantidadePedida(p.detalhes);
  if (r.status !== "perguntas" && pedidoN && (r.questoes?.length ?? 0) !== pedidoN) {
    r = await chamar(`ATENÇÃO: você devolveu ${r.questoes?.length ?? 0} questões, mas o professor pediu EXATAMENTE ${pedidoN}. Refaça com ${pedidoN} questões, seguindo todo o pedido.`);
  }

  const perguntas = (r.perguntas || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
  if (r.status === "perguntas" && perguntas.length) return { status: "perguntas" as const, perguntas };

  let svgs = 0;
  const brutas = (r.questoes || []).filter((q) => q?.enunciado || q?.itens?.length).slice(0, 30);
  // No ajuste, a I.A as vezes "esquece" de repetir a imagem atual: mantem, a menos que o pedido seja tirar
  const atuais = (Array.isArray((p.atual as { questoes?: unknown })?.questoes) ? (p.atual as { questoes: Questao[] }).questoes : []) as Questao[];
  const pediuTirar = /\b(tir|remov|sem imag|sem figur|apag)/i.test(p.ajuste ?? "");
  const questoes = brutas.map((q, i) => {
    const l = limparQuestao(q);
    if (p.ajuste && !l.imagem && !String(q.ilustracao ?? "").trim() && !pediuTirar && atuais[i]?.imagem) l.imagem = String(atuais[i].imagem);
    if (l.imagem && !ids.includes(l.imagem)) l.imagem = "";
    if (l.figura?.tipo === "svg" && ++svgs > 6) l.figura = { tipo: "", conteudo: "" };
    return l;
  });
  if (!questoes.length) throw new ErroAtividade("A I.A não conseguiu montar a atividade. Dê mais detalhes do que você quer.");

  // Imagens de verdade (I.A de imagem) para o texto e as questoes que pediram ilustracao
  const imagensIA: Array<{ id: string; nome: string; dataUrl: string }> = [];
  const imagemTextoAtual = String((p.atual as { texto?: { imagem?: string } } | null)?.texto?.imagem ?? "");
  const texto = limparTexto({ titulo: r.texto?.titulo, conteudo: r.texto?.conteudo, imagem: pediuTirar ? "" : imagemTextoAtual }, ids);
  if (imagensLigadas()) {
    const pedidos: Array<{ alvo: number; descricao: string }> = []; // alvo -1 = texto
    const descTexto = String(r.texto?.ilustracao ?? "").trim();
    if (texto.conteudo && descTexto) pedidos.push({ alvo: -1, descricao: descTexto });
    brutas.forEach((q, i) => {
      const d = String(q.ilustracao ?? "").trim();
      // imagem do professor fica; imagem gerada pela I.A e refeita quando vem descricao nova (ex.: "melhore as imagens")
      const imagemDoProfessor = !!questoes[i].imagem && !String(questoes[i].imagem).startsWith("ia");
      if (d && !imagemDoProfessor) pedidos.push({ alvo: i, descricao: d });
    });
    const lote = pedidos.slice(0, Math.max(0, env.imagemMax));
    const geradas = await gerarImagens(lote.map((x) => x.descricao.slice(0, 400)), nomeAno(p.ano));
    lote.forEach((x, k) => {
      const dataUrl = geradas[k];
      if (!dataUrl) return; // falhou: fica o emoji/desenho de reserva
      const id = `ia${imagensIA.length + 1}-${Date.now().toString(36)}`;
      imagensIA.push({ id, nome: `I.A: ${x.descricao.slice(0, 30)}`, dataUrl });
      if (x.alvo === -1) texto.imagem = id;
      else {
        questoes[x.alvo].imagem = id;
        questoes[x.alvo].figura = { tipo: "", conteudo: "" };
      }
    });
  }
  return {
    status: "pronta" as const,
    perguntas: [] as string[],
    titulo: String(r.titulo || "Atividade").trim(),
    instrucoes: String(r.instrucoes || "").trim(),
    texto,
    questoes: ajustarValores(questoes, p.valorTotal),
    habilidades: escolhidas,
    usouPlano: escolhidas.length > 0,
    cabecalho: limparCabecalho({ ...r.cabecalho, escola: r.cabecalho?.escola || p.escola || "" }, ids),
    estilo: limparEstilo(r.estilo, p.ano),
    imagensIA,
  };
}

export function limparCabecalho(c: Partial<Cabecalho> | null | undefined, ids: string[]): Cabecalho {
  const campos = (c?.campos ?? CAMPOS_PADRAO).map((x) => String(x).toLowerCase()).filter((x) => CAMPOS_CABECALHO.includes(x));
  return {
    escola: String(c?.escola ?? "").trim().slice(0, 150),
    logo: c?.logo && ids.includes(String(c.logo)) ? String(c.logo) : "",
    campos: campos.length ? [...new Set(campos)] : CAMPOS_PADRAO,
  };
}
// Letra minima pela idade: educacao infantil e 1º ano = bem grande; 2º e 3º ano = grande
export function fonteMinima(ano?: string | null): Estilo["fonte"] {
  if (!ano) return "normal";
  if (/^EI/.test(ano) || ano === "1") return "extra";
  if (ano === "2" || ano === "3") return "grande";
  return "normal";
}
const ORDEM_FONTE = { normal: 0, grande: 1, extra: 2 } as const;
export function limparEstilo(e: Partial<Estilo> | null | undefined, ano?: string | null): Estilo {
  let fonte: Estilo["fonte"] = e?.fonte === "grande" || e?.fonte === "extra" ? e.fonte : "normal";
  const min = fonteMinima(ano);
  if (ano !== undefined && ORDEM_FONTE[min] > ORDEM_FONTE[fonte]) fonte = min;
  return {
    fonte,
    colorido: !!e?.colorido,
    caixaAlta: !!e?.caixaAlta,
    layout: e?.layout === "compacto" || e?.layout === "amplo" ? e.layout : "normal",
    imagem: e?.imagem === "pequena" || e?.imagem === "grande" ? e.imagem : "media",
    colunas: !!e?.colunas,
  };
}
export function limparTexto(t: Partial<TextoBase> | null | undefined, ids: string[]): TextoBase {
  return {
    titulo: String(t?.titulo ?? "").trim().slice(0, 200),
    conteudo: String(t?.conteudo ?? "").trim().slice(0, 8000),
    imagem: t?.imagem && ids.includes(String(t.imagem)) ? String(t.imagem) : "",
  };
}

// Quantas questoes o professor pediu ("10 questões", "dez questões")
const NUMEROS: Record<string, number> = { cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, quinze: 15, vinte: 20 };
export function quantidadePedida(texto: string): number | null {
  const m = /(\d{1,2}|cinco|seis|sete|oito|nove|dez|doze|quinze|vinte)\s+(?:quest|perguntas|exerc)/i.exec(texto);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1].toLowerCase()];
  return n >= 1 && n <= 30 ? n : null;
}

// Normaliza uma questao (vinda da I.A ou do professor)
export function limparQuestao(q: Partial<Questao>): Questao {
  const tipo: TipoQuestao = ["multipla", "vf", "discursiva", "completar"].includes(String(q.tipo)) ? (q.tipo as TipoQuestao) : "discursiva";
  const alternativas = tipo === "multipla" ? (q.alternativas || []).map((a) => String(a).replace(/^\s*[A-Ea-e][).]\s+/, "").trim()).filter(Boolean).slice(0, 6) : [];
  let resposta = String(q.resposta ?? "").trim();
  if (tipo === "multipla") {
    resposta = resposta.toUpperCase().slice(0, 1);
    if (!alternativas.some((_, i) => letra(i) === resposta)) resposta = "";
  }
  return {
    tipo,
    enunciado: String(q.enunciado ?? "").trim(),
    alternativas,
    itens:
      tipo === "vf"
        ? (q.itens || [])
            .map((it) => ({ texto: String(it?.texto ?? "").trim(), resposta: (String(it?.resposta).toUpperCase() === "F" ? "F" : "V") as "V" | "F" }))
            .filter((it) => it.texto)
            .slice(0, 10)
        : [],
    resposta,
    criterios: tipo === "discursiva" ? String(q.criterios ?? "").trim() : "",
    valor: Math.max(0, Math.round((Number(q.valor) || 0) * 100) / 100),
    imagem: String(q.imagem ?? "").slice(0, 40),
    figura: limparFigura(q.figura),
    linhas: Math.max(0, Math.min(15, Math.round(Number(q.linhas) || 0))),
  };
}

// ---------- Corrigir pela foto ----------
const SYSTEM_CORRIGIR = `Você corrige atividades de alunos da educação básica a partir de fotos da folha respondida, usando o gabarito do professor.
Para cada questão do gabarito:
- "lida": o que o aluno marcou ou escreveu (transcreva). Múltipla escolha: só a letra marcada ("A", "B"...), "" se em branco, ou mais de uma letra separadas por vírgula se marcou várias.
- "itens": para V/F, o que o aluno marcou em cada item, na ordem ("V", "F" ou "" se em branco). Outros tipos: [].
- "pontos": SÓ para discursiva/completar — de 0 até o valor da questão, seguindo a resposta esperada e os critérios; aceite respostas com outras palavras que estejam corretas e dê pontos parciais quando estiver parcialmente certa. Para múltipla e V/F use 0 (o sistema calcula).
- "comentario": curto (até 15 palavras), para o professor (ex.: "Acertou a ideia, faltou o exemplo.").
- "duvida": true se não deu para ler com segurança, se a foto está cortada/borrada, se a questão não aparece na foto ou se há rasura que muda a resposta.
Não invente respostas: se não estiver na foto, deixe "lida" vazia e "duvida": true. Seja justo e consistente; quem decide a nota final é o professor.
"nomeLido": o nome do aluno escrito na folha ("" se não houver).`;

const SCHEMA_CORRECAO = {
  type: "object",
  properties: {
    nomeLido: { type: "string" },
    respostas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          lida: { type: "string" },
          itens: { type: "array", items: { type: "string" } },
          pontos: { type: "number" },
          comentario: { type: "string" },
          duvida: { type: "boolean" },
        },
        required: ["numero", "lida", "itens", "pontos", "comentario", "duvida"],
        additionalProperties: false,
      },
    },
  },
  required: ["nomeLido", "respostas"],
  additionalProperties: false,
};

function gabaritoTexto(questoes: Questao[]) {
  return questoes
    .map((q, i) => {
      const n = i + 1;
      const cab = `Questão ${n} [${q.tipo}] (vale ${q.valor}): ${q.enunciado}`;
      if (q.tipo === "multipla") return `${cab}\n${q.alternativas.map((a, j) => `  ${letra(j)}) ${a}`).join("\n")}\n  GABARITO: ${q.resposta}`;
      if (q.tipo === "vf") return `${cab}\n${q.itens.map((it, j) => `  ${j + 1}. ${it.texto} — GABARITO: ${it.resposta}`).join("\n")}`;
      if (q.tipo === "discursiva") return `${cab}\n  RESPOSTA ESPERADA: ${q.resposta}\n  CRITÉRIOS: ${q.criterios || "-"}`;
      return `${cab}\n  RESPOSTAS ESPERADAS: ${q.resposta}`;
    })
    .join("\n\n");
}

export type Foto = { dados: Buffer; tipo: string };

// Modelo: so objetivas -> modelo barato; com discursiva/completar -> modelo principal (mais preciso para letra e sentido)
export function modeloCorrecao(questoes: Questao[]) {
  const abertas = questoes.some((q) => q.tipo === "discursiva" || q.tipo === "completar");
  return abertas ? env.anthropicModelCorrecaoDiscursiva || env.anthropicModel : env.anthropicModelCorrecaoObjetiva || env.anthropicModel;
}

export async function corrigirComFoto(p: { serie: string; componente: string; questoes: Questao[]; fotos: Foto[]; texto?: { titulo?: string; conteudo?: string } | null }) {
  const blocos: Anthropic.ContentBlockParam[] = p.fotos.map((f) => ({
    type: "image",
    source: { type: "base64", media_type: f.tipo as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: f.dados.toString("base64") },
  }));
  blocos.push({
    type: "text",
    text: `Série: ${nomeAno(p.serie)} · ${p.componente}\n\n${p.texto?.conteudo?.trim() ? `TEXTO DA ATIVIDADE (as questões são sobre ele):\n${p.texto.titulo ?? ""}\n${p.texto.conteudo.trim().slice(0, 4000)}\n\n` : ""}GABARITO DO PROFESSOR:\n${gabaritoTexto(p.questoes)}\n\nAs imagens acima são a folha respondida de UM aluno (pode ter mais de uma página). Corrija questão por questão.`,
  });
  const chamar = (modelo: string) =>
    chamarJson<{ nomeLido: string; respostas: Array<{ numero: number; lida: string; itens: string[]; pontos: number; comentario: string; duvida: boolean }> }>({
      system: SYSTEM_CORRIGIR,
      mensagem: blocos,
      formato: { nome: "corrigir_atividade", schema: SCHEMA_CORRECAO },
      maxTokens: 4000,
      modelo,
    });
  const modelo = modeloCorrecao(p.questoes);
  let r;
  try {
    r = await chamar(modelo);
  } catch (e) {
    // modelo barato indisponivel/nome errado no .env: usa o principal
    const status = (e as { status?: number }).status;
    if (modelo !== env.anthropicModel && (status === 404 || status === 400)) r = await chamar(env.anthropicModel);
    else throw e;
  }

  const porNumero = new Map((r.respostas || []).map((x) => [Number(x.numero), x]));
  const respostas: RespostaAluno[] = p.questoes.map((q, i) => {
    const x = porNumero.get(i + 1);
    const resposta = String(x?.lida ?? "").trim();
    const multipla = q.tipo === "multipla";
    return {
      questao: String(q._id),
      resposta: multipla ? resposta.toUpperCase() : resposta,
      itens: q.tipo === "vf" ? q.itens.map((_, j) => String(x?.itens?.[j] ?? "").trim().toUpperCase().slice(0, 1)) : [],
      pontos: Number(x?.pontos) || 0,
      comentario: String(x?.comentario ?? "").trim().slice(0, 200),
      // sem leitura da questao, ou multipla com mais de uma letra marcada: professor confere
      duvida: !x || !!x.duvida || (multipla && /[,;/ ]/.test(resposta)),
    };
  });
  return { respostas, nomeLido: String(r.nomeLido || "").trim() || null };
}
