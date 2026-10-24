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
// Figuras exatas desenhadas pelo sistema (a I.A de imagem erra ponteiros, numeros e escalas):
//  relogio "8:10" | termometro "20" | fracao "3/4" | grafico "Manha:28; Tarde:32"
export const FIGURAS_EXATAS = ["relogio", "termometro", "fracao", "grafico"] as const;
export interface Figura {
  tipo: "" | "emoji" | "svg" | (typeof FIGURAS_EXATAS)[number];
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
  quadro?: string; // bloco de largura fixa: grade de caca-palavras, colunas para ligar, tabela, sequencia
  imagem?: string; // id de uma imagem (enviada pelo professor ou gerada pela I.A de imagem)
  figura?: Figura; // ilustracao simples feita pela I.A (emoji ou desenho SVG)
  sequencia?: number; // imagem em sequencia de cenas (producao de texto): quantos quadros ela tem
}
// Texto de apoio (leitura e interpretacao)
export interface TextoBase {
  titulo: string;
  conteudo: string;
  imagem: string; // id da ilustracao do texto
  posicao: "topo" | "direita" | "esquerda"; // onde fica a imagem; direita/esquerda = o texto contorna a imagem
}
export const POSICOES_TEXTO = ["topo", "direita", "esquerda"] as const;

// A folha mostra TEXTO PURO: se a I.A mandar HTML/markdown, vira texto normal (nunca aparece "<p>" para o professor)
const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", deg: "°", hellip: "…", mdash: "—", ndash: "–", laquo: "«", raquo: "»" };
export function textoPuro(s: unknown): string {
  let t = String(s ?? "");
  if (/<\/?[a-z][\s\S]*?>|&[a-z#0-9]+;/i.test(t)) {
    t = t
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/<\s*li[^>]*>/gi, "\n- ")
      .replace(/<\/\s*(p|div|h[1-6]|li|tr|blockquote|section|article)\s*>/gi, "\n\n")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);
  }
  return t
    .replace(/\*\*(.+?)\*\*/g, "$1") // **negrito** de markdown
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "") // # titulos de markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export interface Cabecalho {
  escola: string;
  logo: string; // id da imagem do professor usada como logo ("" = sem logo)
  campos: string[]; // aluno, data, turma, professor, nota, escola
  mascote?: string; // id da ilustracao do topo da folha (personagem do tema), gerada pela I.A
}
export interface Estilo {
  fonte: "normal" | "grande" | "extra";
  colorido: boolean;
  caixaAlta: boolean; // letra bastao (tudo maiusculo), para quem esta aprendendo a ler
  layout: "compacto" | "normal" | "amplo"; // aproveitamento da folha
  imagem: "pequena" | "media" | "grande"; // tamanho das imagens
  colunas: boolean; // alternativas curtas em 2 colunas (economiza espaco)
  paginas: 0 | 1 | 2; // 1 = tudo em uma folha (a impressao encolhe ate caber); 0 = livre
  visual: "cards" | "simples"; // cards = quadros coloridos por questao (so se o professor pedir); simples = folha limpa
  enfeites: boolean; // estrelas e selo no titulo (so se pedir enfeites/chamativa)
  rodape: string; // frase no rodape (so se o professor pedir uma frase)
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
// Valida o conteudo das figuras exatas ("" = invalido)
export function conteudoFiguraExata(tipo: string, c: string): string {
  const t = String(c ?? "").trim();
  if (tipo === "relogio") {
    const m = /^(\d{1,2})\s*[:h]\s*(\d{2})$/i.exec(t);
    if (!m || Number(m[2]) > 59 || Number(m[1]) > 23) return "";
    return `${Number(m[1]) % 12 || 12}:${m[2]}`;
  }
  if (tipo === "termometro") {
    const v = Number(t.replace(",", ".").replace(/[^\d.-]/g, ""));
    return t && Number.isFinite(v) && v >= -50 && v <= 60 ? String(Math.round(v)) : "";
  }
  if (tipo === "fracao") {
    const m = /^(\d{1,2})\s*\/\s*(\d{1,2})$/.exec(t);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 16 || Number(m[1]) > Number(m[2])) return "";
    return `${Number(m[1])}/${Number(m[2])}`;
  }
  if (tipo === "grafico") {
    const barras = t
      .split(/[;\n]+/)
      .map((p) => /^(.{1,24}?)\s*[:=]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(p.trim()))
      .filter((m): m is RegExpExecArray => !!m)
      .map((m) => `${m[1].trim().replace(/[;:]/g, "")}:${Number(m[2].replace(",", "."))}`)
      .slice(0, 8);
    return barras.length >= 2 && barras.every((b) => Number(b.split(":")[1]) >= 0) ? barras.join("; ") : "";
  }
  return "";
}
export function limparFigura(f?: Partial<Figura> | null): Figura {
  if (FIGURAS_EXATAS.includes(f?.tipo as never)) {
    const c = conteudoFiguraExata(String(f!.tipo), String(f?.conteudo ?? ""));
    return c ? { tipo: f!.tipo as Figura["tipo"], conteudo: c } : { tipo: "", conteudo: "" };
  }
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

REGRA DE OURO: o PEDIDO DO PROFESSOR é a ordem principal e vem antes de qualquer outra regra abaixo. Faça EXATAMENTE o que ele pediu — tema, quantidade, tipos de questão, nível, tamanho, visual, cabeçalho, imagens, número de folhas — como um professor caprichoso faria no Word. Se uma regra abaixo conflitar com o pedido, vale o pedido. Leia o pedido duas vezes antes de começar e confira de novo no fim.

Tipos de questão:
- "multipla": enunciado + 3 a 5 alternativas (sem letras no texto da alternativa) + "resposta" = letra correta ("A", "B"...).
- "vf": enunciado (ex.: "Marque V para verdadeiro e F para falso") + "itens" com 3 a 6 afirmações, cada uma com "resposta" "V" ou "F".
- "discursiva": pergunta aberta + "resposta" = resposta esperada + "criterios" = como dar nota (o que vale total, o que vale metade).
- "completar": frase(s) com lacunas "____" ou perguntas de resposta curta + "resposta" = respostas esperadas na ordem.
- "quadro" (qualquer tipo, opcional): bloco de texto em largura fixa que aparece logo abaixo do enunciado, para o que precisa ficar alinhado — colunas para ligar, tabela, sequência numérica, quadro de cálculo. Use linhas e espaços para alinhar. Sem quadro: "".

TIPOS DE ATIVIDADE (faça o que o professor pedir, do jeito certo de cada um):
- Produção de texto / redação: "discursiva" com proposta clara (gênero, tema, situação, para quem escreve, tamanho), dicas curtas de como fazer, "linhas" 15–25 (crianças pequenas 8–12) e "criterios" com a rubrica (adequação ao tema e ao gênero, organização, ortografia, pontuação). Pode ter imagem de estímulo.
- Leitura e interpretação: texto de apoio original + questões variadas sobre ele.
- Ditado: "completar" com instrução e "linhas" = quantidade de palavras/frases; as palavras do ditado vão em "resposta" (gabarito do professor), NUNCA no enunciado.
- Caça-palavras: "completar" com enunciado ("Encontre no caça-palavras as palavras…") e "quadro" = "CAÇA-PALAVRAS: PALAVRA1, PALAVRA2, …" (só a lista; o sistema monta a grade). Liste as palavras também no enunciado se o professor quiser.
- Ligar colunas: "completar" com "quadro" em duas colunas alinhadas (Coluna A numerada 1, 2, 3…; Coluna B com ( ) antes de cada item, em outra ordem) e "resposta" com os pares (ex.: "1-c, 2-a, 3-b").
- Cruzadinha: "completar" com dicas numeradas e espaços ____ com a quantidade de letras (não desenhe a grade).
- Problemas de matemática / situações-problema: "discursiva" com dados claros, "linhas" para o cálculo e resposta; contas armadas/tabuada no "quadro" quando ajudar.
- Avaliação / prova: cabeçalho completo, mistura de tipos, progressão de dificuldade, valores somando o total.
- Exercício de fixação / tarefa de casa: questões objetivas e curtas, sem nota se pedirem.

Regras:
- Siga o que o professor pediu (tipos, quantidade, tema). Se não disser a quantidade, faça de 5 a 8 questões.
- Quando o professor escolher habilidades, TODAS as questões devem trabalhar essas habilidades (distribua as questões entre elas). Em "habilidades" devolva os códigos usados.
- Distribua o "valor" das questões para somar exatamente o valor total informado (use no máximo 1 casa decimal; discursivas costumam valer mais). Se a atividade for SEM NOTA: "valor" = 1 em todas as questões e tire "nota" de "cabecalho.campos".
- Campos que não se aplicam ao tipo ficam vazios ("" ou []).
- Não coloque a resposta no enunciado.
- "instrucoes": uma linha para o aluno (ex.: "Leia com atenção e responda.").

FORMATO DO TEXTO: tudo é TEXTO PURO. NUNCA use HTML (<p>, <br>, <b>, <div>…), markdown (**, #) ou qualquer tag/código. Parágrafos do texto de apoio separados por uma linha em branco. Versos de poema: um por linha.

Leitura e interpretação: se o professor pedir leitura/interpretação de texto (ou "texto"), escreva em "texto" um texto ORIGINAL adequado à série (título + conteúdo: fábula, conto, notícia, poema, bilhete, receita… conforme o pedido; 1º/2º ano: curto, frases simples; 3º–5º: 1 a 3 parágrafos) e faça as questões sobre ESSE texto (localizar informação, inferir, sentido de palavra, ideia principal, opinião…). Sem texto de apoio: "texto" com campos vazios. "texto.posicaoImagem": onde fica a imagem do texto — "topo" (acima do texto, padrão), "direita" ou "esquerda" (a imagem fica ao lado e o texto CONTORNA a imagem). Se o professor pedir o texto ao lado/em volta/contornando a imagem, ou a imagem à direita/esquerda, use "direita"/"esquerda" conforme o pedido.

Quantidade: faça EXATAMENTE o número de questões pedido. "Variadas/abertas e fechadas": misture tipos (fechadas = multipla e vf; abertas = discursiva e completar), metade de cada se não disser.

Cabeçalho: use os dados informados (escola, professor, turma, série) e deixe linhas para aluno e data. "Faça o cabeçalho" = cabeçalho completo e caprichado.

Fonte/legibilidade: "fonte nítida/adequada à idade" ou alunos pequenos → "estilo.fonte" "grande" (2º–3º ano) ou "extra" (educação infantil e 1º ano) e frases curtas. "estilo.caixaAlta": true para educação infantil e 1º ano (letra bastão) ou se o professor pedir letra de forma maiúscula.

Qualidade (como uma professora experiente faria): questões bem escritas, criativas e contextualizadas no mundo da criança, enunciados curtos e claros, comandos variados (marque, circule, complete, ligue com palavras, escreva, desenhe), distratores plausíveis nas alternativas, progressão do mais fácil ao mais difícil, nada repetitivo, português correto. Revise antes de devolver.

Número de folhas: "estilo.paginas" = 1 quando o professor pedir "uma folha só", "uma página", "caber numa folha", "tudo em uma folha" (2 para "duas folhas"; 0 = livre). Com 1 folha: textos e enunciados CURTOS, poucas linhas de resposta (discursiva 2, completar 1), alternativas curtas em 2 colunas, imagens pequenas, "layout" "compacto" e a quantidade de questões que cabe (se o professor disse a quantidade, mantenha e encurte tudo).

Aproveitamento da folha: "estilo.layout" = "compacto" (menos espaço em branco, imagem ao lado da questão — use quando pedirem para economizar papel/usar melhor o espaço), "normal" ou "amplo" (mais espaço, bom para os pequenos). "estilo.imagem" = "pequena" | "media" | "grande". "estilo.colunas": true para colocar alternativas curtas em 2 colunas. "linhas" de cada questão = quantas linhas para a resposta (discursiva 3–6, completar 1–2; 0 = automático).

SEJA FIEL AO PROFESSOR — a atividade deve ficar exatamente do jeito que ele pediu (tema, quantidade, tipos, nível, linguagem, visual, cabeçalho, imagens, fonte grande, colorida…). Nunca ignore um pedido.

Imagens e figuras:
- NUNCA use emojis (nem no texto, nem no enunciado, nem nas alternativas, nem em "figura") a menos que o professor PEÇA emojis. Sem pedido de imagem: nada de figura, nada de emoji.
- "ilustracao" de cada questão (e do texto): quando o professor pedir IMAGENS/figuras/desenhos/ilustrações, descreva em português, em uma frase concreta, a ilustração que deve ser desenhada para aquela questão (ex.: "três maçãs vermelhas em cima de uma mesa", "um menino lendo um livro embaixo de uma árvore"). Ela vira uma imagem de verdade. Coloque em TODAS ou quase todas as questões. Nunca peça texto escrito dentro da imagem. Para questões de contagem, diga a quantidade exata. Sem pedido de imagem: "".
- FIGURAS EXATAS (desenhadas pelo sistema, sem custo, sempre certas — use mesmo SEM pedido de imagem quando a questão precisar): relógio de ponteiros {"tipo":"relogio","conteudo":"8:10"}; termômetro {"tipo":"termometro","conteudo":"20"} (graus °C, de -50 a 60); fração em círculo {"tipo":"fracao","conteudo":"3/4"}; gráfico de barras {"tipo":"grafico","conteudo":"Manhã:28; Tarde:32; Noite:18"} (2 a 8 barras, rótulos curtos). Use em leitura de horas, temperatura, frações e gráficos. NUNCA peça relógio, termômetro, gráfico, régua ou números na "ilustracao" (a I.A de imagem erra ponteiros e números); use a figura exata e, se quiser, uma "ilustracao" de cena ao lado (ex.: uma menina olhando o relógio de pulso).
- "figura" nos outros casos: deixe {"tipo":"","conteudo":""}. Só use {"tipo":"emoji",...} se o professor pedir emojis; e {"tipo":"svg","conteudo":"<svg ...>…</svg>"} (desenho simples, no máximo 1500 caracteres, no máximo 4 por atividade) só se ele pedir imagens e "Gerar imagens de verdade" for "não disponível".
- "cenas" de cada questão: SÓ em produção de texto com imagens ("observe as imagens e escreva uma história", sequência de cenas, tirinha): 3 a 5 descrições curtas, uma por cena, na ordem da história, descrevendo os personagens SEMPRE do mesmo jeito em todas (ex.: "menino de boné azul e camiseta vermelha com um filhote beagle"). Vira uma faixa de quadros numerados. Nesses casos deixe "ilustracao" vazia. Nos outros: [].
- "ilustracaoCapa": SÓ se o professor pedir imagens E um personagem/mascote/desenho no topo (ou atividade "bem chamativa/decorada" com imagens): descreva um personagem infantil ligado ao tema (ex.: "menina de óculos estudando com um livro aberto e números coloridos ao redor"). Senão "".
- "imagem" de cada questão: o id de uma imagem ENVIADA pelo professor (lista "Imagens do professor") quando ele pedir para usá-la na questão; senão "".
- "cabecalho.logo": id da imagem enviada que é a logo/brasão da escola, se o professor pedir para colocar no cabeçalho; senão "".
- "cabecalho.escola": nome da escola, se o professor informar; senão "".
- "cabecalho.campos": quais linhas o cabeçalho mostra, entre: escola, professor, turma, aluno, data, nota, serie, periodo. Padrão: escola, professor, turma, aluno, data, nota. "serie" (ano escolar) e "periodo" (bimestre/trimestre) SÓ se o professor pedir. Siga o pedido (ex.: "sem nota" → tire "nota").
- "estilo.fonte": "normal", "grande" ou "extra" (letra grande para educação infantil / 1º ano ou se o professor pedir). "estilo.colorido": true se pedir colorida/chamativa.
- O VISUAL DA FOLHA SEGUE O PEDIDO. Nada de enfeite que o professor não pediu:
  - "estilo.visual": "cards" (cada questão num quadro colorido com o número em destaque) SÓ se ele pedir colorida, caprichada, chamativa, bonita, em quadros/caixinhas, ilustrada, "igual às atividades da internet/Pinterest", ou se as preferências dele mostrarem esse visual. Senão "simples" (folha limpa e organizada).
  - "estilo.enfeites": true SÓ se pedir enfeites, estrelinhas, decorada, bem chamativa. Senão false.
  - "estilo.rodape": a frase do rodapé SÓ se o professor pedir uma frase/mensagem no rodapé (use o texto dele, ou crie uma frase curta de incentivo se ele pedir "uma frase de incentivo"). Senão "".
  - Imagens: só com pedido de imagens; "sem imagem" = nenhuma ilustração, nenhuma cena, nenhum personagem e nenhuma figura (faça questões que não dependam de figura).

PADRÃO DE QUALIDADE (vale em QUALQUER visual, com ou sem imagem — é o conteúdo que precisa ser excelente, como as atividades caprichadas que as professoras compartilham): título forte e direto ("Avaliação de Matemática", "Produção de Texto"); cada questão com contexto do dia a dia da criança (padaria, escola, passeio, previsão do tempo, brinquedos); números e dados claros no enunciado; alternativas curtas e plausíveis; comandos variados (observe, marque, ligue, complete, escreva, cite); em avaliações, misture objetivas e abertas e termine com uma questão de resposta pessoal ou produção curta. Com imagens pedidas: cada questão com sua ilustração concreta (quantidades certas), relógio/termômetro/gráfico/fração como figura exata.

Quando FALTAR algo que o professor pediu e só ele pode dar (ex.: pediu a logo da escola no cabeçalho mas não enviou nenhuma imagem; pediu "o texto que trabalhamos" sem mandar o texto; pediu o nome da escola sem dizer qual), devolva "status":"perguntas" com as perguntas curtas e diretas em "perguntas" (e o resto pode vir vazio). Se der para fazer tudo, devolva "status":"pronta" e "perguntas": [].
Se houver "Respostas do professor", use-as.

AJUSTE: se houver "Atividade atual" + "Pedido de ajuste", aplique TODAS as mudanças pedidas, de forma visível e caprichada, e mantenha o resto (mesmas questões, gabarito e valores, a menos que o ajuste peça mudança). Devolva a atividade inteira.
- "Melhorar/trocar as imagens" → escreva em "ilustracao" uma descrição NOVA, mais rica e específica (cena, cores, quantidade, expressão) para cada questão que deve ter imagem — as imagens com "ilustracao" preenchida são desenhadas de novo. Para manter a imagem atual de uma questão, deixe "ilustracao" vazia e repita o "imagem" dela.
- "Texto contornando/ao lado da imagem", "imagem à direita/esquerda" → "texto.posicaoImagem" = "direita"/"esquerda" (e mantenha a imagem do texto).
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
          quadro: { type: "string" },
          figura: {
            type: "object",
            properties: { tipo: { type: "string", enum: ["", "emoji", "svg", "relogio", "termometro", "fracao", "grafico"] }, conteudo: { type: "string" } },
            required: ["tipo", "conteudo"],
            additionalProperties: false,
          },
          cenas: { type: "array", items: { type: "string" } },
        },
        required: ["tipo", "enunciado", "alternativas", "itens", "resposta", "criterios", "valor", "imagem", "ilustracao", "linhas", "quadro", "figura", "cenas"],
        additionalProperties: false,
      },
    },
    texto: {
      type: "object",
      properties: {
        titulo: { type: "string" },
        conteudo: { type: "string" },
        ilustracao: { type: "string" },
        posicaoImagem: { type: "string", enum: ["topo", "direita", "esquerda"] },
      },
      required: ["titulo", "conteudo", "ilustracao", "posicaoImagem"],
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
        paginas: { type: "integer", enum: [0, 1, 2] },
        visual: { type: "string", enum: ["cards", "simples"] },
        enfeites: { type: "boolean" },
        rodape: { type: "string" },
      },
      required: ["fonte", "colorido", "caixaAlta", "layout", "imagem", "colunas", "paginas", "visual", "enfeites", "rodape"],
      additionalProperties: false,
    },
    ilustracaoCapa: { type: "string" },
  },
  required: ["status", "perguntas", "titulo", "instrucoes", "texto", "habilidades", "questoes", "cabecalho", "estilo", "ilustracaoCapa"],
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

// Quadro (largura fixa): so texto, sem tags; mantem espacos e quebras de linha
function limparQuadro(s: unknown): string {
  return String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, "").slice(0, 80))
    .slice(0, 30)
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

// Caca-palavras montado pelo sistema (a I.A erra a grade): palavras na horizontal e na vertical, sem acento
const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
export function montarCacaPalavras(palavras: string[], semente = Date.now()): { grade: string; colocadas: string[] } | null {
  const ws = [...new Set(palavras.map(semAcento).filter((w) => w.length >= 2 && w.length <= 14))].slice(0, 15);
  if (ws.length < 2) return null;
  const n = Math.min(15, Math.max(10, Math.max(...ws.map((w) => w.length)) + 2));
  let s = semente % 2147483647 || 1;
  const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  for (let tentativa = 0; tentativa < 40; tentativa++) {
    const g: string[][] = Array.from({ length: n }, () => Array(n).fill(""));
    const colocadas: string[] = [];
    for (const w of [...ws].sort((a, b) => b.length - a.length)) {
      let ok = false;
      for (let k = 0; k < 200 && !ok; k++) {
        const hor = rnd() < 0.5;
        const r = Math.floor(rnd() * (hor ? n : n - w.length + 1));
        const c = Math.floor(rnd() * (hor ? n - w.length + 1 : n));
        if ([...w].every((ch, i) => { const x = g[hor ? r : r + i][hor ? c + i : c]; return x === "" || x === ch; })) {
          [...w].forEach((ch, i) => (g[hor ? r : r + i][hor ? c + i : c] = ch));
          colocadas.push(w);
          ok = true;
        }
      }
    }
    if (colocadas.length === ws.length) {
      const A = "ABCDEFGHIJLMNOPRSTUV";
      const grade = g.map((linha) => linha.map((x) => x || A[Math.floor(rnd() * A.length)]).join(" ")).join("\n");
      return { grade, colocadas };
    }
  }
  return null;
}

// Revisor: compara o pedido do professor com a atividade feita e lista o que faltou (lista vazia = atendeu)
const SCHEMA_REVISAO = {
  type: "object",
  properties: { faltando: { type: "array", items: { type: "string" } } },
  required: ["faltando"],
  additionalProperties: false,
};
async function revisarPedido(p: { pedido: string; ajuste?: string | null; respostas?: string | null; atividade: unknown }): Promise<string[]> {
  try {
    const a = p.atividade as { questoes?: Array<Record<string, unknown>> } & Record<string, unknown>;
    // resumo sem desenhos (mais barato): o que importa e o conteudo, tipos, quantidade e o visual escolhido
    const resumo = {
      titulo: a.titulo,
      texto: a.texto,
      cabecalho: a.cabecalho,
      estilo: a.estilo,
      questoes: (a.questoes ?? []).map((q) => ({ tipo: q.tipo, enunciado: q.enunciado, alternativas: q.alternativas, itens: q.itens, resposta: q.resposta, linhas: q.linhas, quadro: q.quadro, temImagem: !!(q.ilustracao || q.imagem || (q as { cenas?: string[] }).cenas?.length), figura: (q as { figura?: { tipo?: string } }).figura?.tipo || "" })),
    };
    const r = await chamarJsonOpenAI<{ faltando: string[] }>({
      system:
        "Você revisa atividades escolares. Compare o PEDIDO do professor com a ATIVIDADE pronta e liste, em frases curtas, SÓ o que o pedido exigiu e não foi feito (quantidade, tipos de questão, tema, nível, texto de apoio, imagens, cabeçalho, número de folhas/espaço, letra, cores, gabarito errado). Não invente exigências que o professor não fez e não opine sobre gosto. Se atendeu tudo, devolva a lista vazia.",
      partes: [
        {
          type: "input_text",
          text: `PEDIDO DO PROFESSOR:\n"""${p.pedido}"""${p.respostas?.trim() ? `\nRESPOSTAS DO PROFESSOR:\n"""${p.respostas}"""` : ""}${p.ajuste?.trim() ? `\nAJUSTE PEDIDO AGORA:\n"""${p.ajuste}"""` : ""}\n\nATIVIDADE PRONTA (JSON):\n${JSON.stringify(resumo).slice(0, 15000)}`,
        },
      ],
      nome: "revisar_pedido",
      schema: SCHEMA_REVISAO,
      maxTokens: 6000,
      raciocinio: "low",
    });
    return (r.faltando ?? []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
  } catch (e) {
    console.error("[atividade/revisao]", e instanceof Error ? e.message : e);
    return []; // revisao nunca impede entregar a atividade
  }
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
  semNota?: boolean; // atividade sem nota (so exercicio)
  uf?: string | null; // estado do professor (plano oficial do estado quando ele nao cadastrou o plano)
}) {
  // Habilidades do plano de curso do periodo, do mesmo componente
  let habilidadesPlano: Array<{ codigo: string; habilidade: string }> = [];
  try {
    if (!p.periodo || !p.componente.trim()) throw new Error("sem periodo/materia"); // sem periodo: so o pedido
    const ctx = await periodoDoPlano(p.usuario, p.ano, p.anoLetivo, p.periodo, p.turma, p.uf);
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
  const lista = escolhidas.length
    ? `A atividade DEVE trabalhar estas habilidades (escolhidas pelo professor):\n${escolhidas.map((h) => `(${h.codigo}) ${h.habilidade}`).join("\n")}`
    : "(sem habilidades escolhidas — use só o pedido do professor)";

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
    `PEDIDO DO PROFESSOR (cumpra à risca, item por item):\n"""${p.detalhes}"""`,
    `Série: ${nomeAno(p.ano)}\nComponente: ${p.componente || "(não informado — deduza do pedido)"}\nPeríodo: ${p.periodo ? `${p.periodo}º` : "-"}\n${p.semNota ? "Atividade SEM NOTA (valor 1 em cada questão, sem \"nota\" no cabeçalho)" : `Valor total da atividade: ${p.valorTotal}`}\nTurma: ${p.turma || "-"}\nEscola: ${p.escola || "-"}\nProfessor(a): ${p.professor || "-"}\nGerar imagens de verdade: ${imagensLigadas() ? "sim (use \"ilustracao\")" : "não disponível (use só \"figura\" com desenho SVG, se ele pedir imagens)"}`,
    lista,
    `Imagens do professor: ${imagens.length ? imagens.map((i) => `"${i.id}" (${i.nome})`).join(", ") : "nenhuma enviada"}`,
    ...(p.preferencias ? [p.preferencias] : []),
  ];
  if (p.respostas?.trim()) partes.push(`Respostas do professor às suas perguntas:\n"""${p.respostas.trim()}"""`);
  if (p.atual && p.ajuste?.trim()) {
    partes.push(`Atividade atual (JSON):\n${JSON.stringify(p.atual).slice(0, 20000)}`);
    partes.push(`Pedido de ajuste do professor (aplique TUDO, de forma visível):\n"""${p.ajuste.trim()}"""`);
  }
  partes.push(`LEMBRE: a atividade tem que atender exatamente ao pedido do professor${p.ajuste?.trim() ? " e ao ajuste" : ""}. Confira cada item antes de devolver.`);
  blocos.push({ type: "input_text", text: partes.join("\n\n") });

  type QuestaoIA = Questao & { ilustracao?: string; cenas?: string[] };
  type Resp = {
    status: "pronta" | "perguntas";
    perguntas: string[];
    titulo: string;
    instrucoes: string;
    texto: { titulo: string; conteudo: string; ilustracao: string; posicaoImagem?: TextoBase["posicao"] };
    habilidades: string[];
    questoes: QuestaoIA[];
    cabecalho: Cabecalho;
    estilo: Estilo;
    ilustracaoCapa?: string;
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

  // Revisao (como um segundo professor conferindo): o que o pedido exigia e nao foi feito? Se faltar algo, refaz uma vez.
  if (r.status !== "perguntas") {
    const falta = await revisarPedido({ pedido: p.detalhes, ajuste: p.ajuste, respostas: p.respostas, atividade: r });
    if (falta.length) {
      r = await chamar(
        `REVISÃO: a atividade que você fez NÃO atendeu a estes pontos do pedido do professor:\n${falta.map((f) => `- ${f}`).join("\n")}\nRefaça a atividade inteira corrigindo TODOS esses pontos e mantendo o que já estava certo.`
      );
    }
  }

  const perguntas = (r.perguntas || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
  if (r.status === "perguntas" && perguntas.length) return { status: "perguntas" as const, perguntas };

  let svgs = 0;
  const brutas = (r.questoes || []).filter((q) => q?.enunciado || q?.itens?.length).slice(0, 30);
  // No ajuste, a I.A as vezes "esquece" de repetir a imagem atual: mantem, a menos que o pedido seja tirar
  const atuais = (Array.isArray((p.atual as { questoes?: unknown })?.questoes) ? (p.atual as { questoes: Questao[] }).questoes : []) as Questao[];
  const pediuTirar = /\b(tir|remov|sem imag|sem figur|apag)/i.test(p.ajuste ?? "");
  // Emoji so se o professor pedir (no pedido, nas respostas ou no ajuste)
  const pediuEmoji = /emoji|emotic|carinha/i.test(`${p.detalhes} ${p.respostas ?? ""} ${p.ajuste ?? ""}`);
  const semEmoji = (t: string) => (pediuEmoji ? t : t.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/ {2,}/g, " ").trim());
  const questoes = brutas.map((q, i) => {
    const l = limparQuestao(q);
    if (!pediuEmoji) {
      if (l.figura?.tipo === "emoji") l.figura = { tipo: "", conteudo: "" };
      l.enunciado = semEmoji(l.enunciado);
      l.alternativas = l.alternativas.map(semEmoji);
      l.itens = l.itens.map((it) => ({ ...it, texto: semEmoji(it.texto) }));
    }
    const cenasNovas = (q.cenas ?? []).map((c) => String(c).trim()).filter(Boolean);
    l.sequencia = 0; // a I.A manda descricoes das cenas; a imagem da sequencia e gerada abaixo
    if (p.ajuste && !l.imagem && !String(q.ilustracao ?? "").trim() && !cenasNovas.length && !pediuTirar && atuais[i]?.imagem) {
      l.imagem = String(atuais[i].imagem);
      l.sequencia = Number(atuais[i].sequencia) || 0;
    }
    if (l.imagem && !ids.includes(l.imagem)) l.imagem = "";
    if (l.figura?.tipo === "svg" && ++svgs > 6) l.figura = { tipo: "", conteudo: "" };
    return l;
  });
  if (!questoes.length) throw new ErroAtividade("A I.A não conseguiu montar a atividade. Dê mais detalhes do que você quer.");
  // Caca-palavras: o sistema monta a grade de verdade com as palavras pedidas
  questoes.forEach((q) => {
    const m = /^\s*CA[CÇ]A[- ]PALAVRAS\s*:\s*(.+)$/is.exec(q.quadro ?? "");
    if (!m) return;
    const palavras = m[1].split(/[,;\n]+/).map((w) => w.trim()).filter(Boolean);
    const cp = montarCacaPalavras(palavras);
    if (!cp) return;
    q.quadro = cp.grade;
    if (!q.resposta.trim()) q.resposta = cp.colocadas.join(", ");
  });

  // Imagens de verdade (I.A de imagem) para o texto e as questoes que pediram ilustracao
  const imagensIA: Array<{ id: string; nome: string; dataUrl: string }> = [];
  const imagemTextoAtual = String((p.atual as { texto?: { imagem?: string } } | null)?.texto?.imagem ?? "");
  const texto = limparTexto(
    { titulo: semEmoji(textoPuro(r.texto?.titulo)), conteudo: semEmoji(textoPuro(r.texto?.conteudo)), imagem: pediuTirar ? "" : imagemTextoAtual, posicao: r.texto?.posicaoImagem },
    ids
  );
  // Do jeito que foi pedido: "sem imagem" tira ilustracoes, cenas, personagem e figuras; sem pedido de imagem, sem personagem
  const pedidoTodo = `${p.detalhes} ${p.respostas ?? ""} ${p.ajuste ?? ""}`;
  const SEM_IMG = /sem (nenhuma )?(imag|figur|ilustr|desenh)|n[aã]o (coloque|ponha|use|quero) (imag|figur|ilustr|desenh)/i;
  // no ajuste, o pedido novo vence ("coloque imagens" depois de uma atividade sem imagem)
  const ajustePedeImagem = !!p.ajuste && /(coloque|ponha|adicione|inclua|com|use|gere) (as |umas |mais )?(imag|figur|ilustr|desenh)/i.test(p.ajuste) && !SEM_IMG.test(p.ajuste);
  const semImagem = !ajustePedeImagem && SEM_IMG.test(pedidoTodo);
  const pediuImagem = !semImagem && /imag|figur|ilustr|desenh|personag|mascote/i.test(pedidoTodo);
  if (semImagem) {
    brutas.forEach((q) => ((q.ilustracao = ""), (q.cenas = [])));
    r.ilustracaoCapa = "";
    if (r.texto) r.texto.ilustracao = "";
    questoes.forEach((q) => {
      if (q.figura?.tipo) q.figura = { tipo: "", conteudo: "" };
      if (String(q.imagem).startsWith("ia")) (q.imagem = ""), (q.sequencia = 0);
    });
  }
  if (!pediuImagem && !(p.ajuste && /personag|mascote|topo/i.test(p.ajuste))) r.ilustracaoCapa = "";
  // visual em quadros coloridos e enfeites: so se o professor pediu (agora, antes nesta atividade ou nas preferencias aprovadas)
  const atualEstilo = (p.atual as { estilo?: Partial<Estilo> } | null)?.estilo;
  if (r.estilo) {
    const querCards = /colorid|caprich|chamativ|bonit|quadr|caixinh|ilustrad|pinterest|internet|decorad|enfeit|cards/i.test(pedidoTodo) || /visual cards/.test(p.preferencias ?? "") || (!!p.ajuste && atualEstilo?.visual === "cards");
    if (!querCards) r.estilo.visual = "simples";
    const querEnfeites = /enfeit|estrel|decorad|chamativ/i.test(pedidoTodo) || /estilo\.enfeites/.test(p.preferencias ?? "") || (!!p.ajuste && !!atualEstilo?.enfeites);
    if (!querEnfeites) r.estilo.enfeites = false;
    if (p.ajuste && /simples|sem (quadro|cor|enfeite)|preto e branco|economi[zs]ar tinta/i.test(p.ajuste)) r.estilo.visual = "simples";
  }
  // frase no rodape so com pedido
  if (r.estilo && !/rodap|frase|mensagem|incentiv|motiva/i.test(pedidoTodo)) r.estilo.rodape = (p.atual as { estilo?: { rodape?: string } } | null)?.estilo?.rodape ?? "";

  // Ilustracao do topo (personagem do tema): no ajuste, mantem a atual se nao vier outra
  const mascoteAtual = String((p.atual as { cabecalho?: { mascote?: string } } | null)?.cabecalho?.mascote ?? "");
  let mascote = pediuTirar || semImagem ? "" : mascoteAtual;
  if (imagensLigadas()) {
    // alvo: -1 = texto, -2 = topo da folha, i = questao. Questoes primeiro (se passar do limite, o enfeite do topo fica de fora)
    const pedidos: Array<{ alvo: number; descricao: string; tipo: "cena" | "sequencia" | "capa"; quadros?: number }> = [];
    brutas.forEach((q, i) => {
      const imagemDoProfessor = !!questoes[i].imagem && !String(questoes[i].imagem).startsWith("ia");
      if (imagemDoProfessor) return; // imagem do professor fica
      const cenas = (q.cenas ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 5);
      const d = String(q.ilustracao ?? "").trim();
      // producao de texto: uma faixa com as cenas em ordem (mesmos personagens em todos os quadros)
      if (cenas.length >= 2) pedidos.push({ alvo: i, descricao: cenas.map((c, k) => `Quadro ${k + 1}: ${c.slice(0, 220)}`).join(" "), tipo: "sequencia", quadros: cenas.length });
      // imagem gerada pela I.A e refeita quando vem descricao nova (ex.: "melhore as imagens")
      else if (d) pedidos.push({ alvo: i, descricao: d.slice(0, 400), tipo: "cena" });
    });
    const descTexto = String(r.texto?.ilustracao ?? "").trim();
    if (texto.conteudo && descTexto) pedidos.push({ alvo: -1, descricao: descTexto.slice(0, 400), tipo: "cena" });
    const descCapa = String(r.ilustracaoCapa ?? "").trim();
    if (descCapa && !(p.ajuste && mascote && !/topo|personagem|mascote|enfeite|capa/i.test(p.ajuste))) pedidos.push({ alvo: -2, descricao: descCapa.slice(0, 300), tipo: "capa" });
    const lote = pedidos.slice(0, Math.max(0, env.imagemMax));
    const geradas = await gerarImagens(lote, nomeAno(p.ano));
    lote.forEach((x, k) => {
      const dataUrl = geradas[k];
      if (!dataUrl) return; // falhou: a questao fica sem imagem
      const id = `ia${imagensIA.length + 1}-${Date.now().toString(36)}`;
      imagensIA.push({ id, nome: `I.A: ${x.descricao.slice(0, 30)}`, dataUrl });
      if (x.alvo === -1) texto.imagem = id;
      else if (x.alvo === -2) mascote = id;
      else {
        questoes[x.alvo].imagem = id;
        questoes[x.alvo].sequencia = x.tipo === "sequencia" ? x.quadros ?? 0 : 0;
        // figura exata (relogio, termometro...) fica junto da ilustracao; emoji/svg sai
        if (!FIGURAS_EXATAS.includes(questoes[x.alvo].figura?.tipo as never)) questoes[x.alvo].figura = { tipo: "", conteudo: "" };
      }
    });
  }
  return {
    status: "pronta" as const,
    perguntas: [] as string[],
    titulo: semEmoji(textoPuro(r.titulo || "Atividade")) || "Atividade",
    instrucoes: semEmoji(textoPuro(r.instrucoes || "")),
    texto,
    questoes: p.semNota ? questoes.map((q) => ({ ...q, valor: 1 })) : ajustarValores(questoes, p.valorTotal),
    semNota: !!p.semNota,
    habilidades: escolhidas,
    usouPlano: escolhidas.length > 0,
    cabecalho: limparCabecalho({ ...r.cabecalho, escola: r.cabecalho?.escola || p.escola || "", mascote }, [...ids, ...imagensIA.map((i) => i.id), ...(mascote ? [mascote] : [])]),
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
    mascote: c?.mascote && ids.includes(String(c.mascote)) ? String(c.mascote) : "",
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
  const paginas = (e?.paginas === 1 || e?.paginas === 2 ? e.paginas : 0) as Estilo["paginas"];
  // letra minima pela idade, a menos que o professor queira caber em poucas folhas
  if (ano !== undefined && !paginas && ORDEM_FONTE[min] > ORDEM_FONTE[fonte]) fonte = min;
  return {
    fonte,
    colorido: !!e?.colorido,
    caixaAlta: !!e?.caixaAlta,
    layout: e?.layout === "compacto" || e?.layout === "amplo" ? e.layout : "normal",
    imagem: e?.imagem === "pequena" || e?.imagem === "grande" ? e.imagem : "media",
    colunas: !!e?.colunas,
    paginas,
    visual: e?.visual === "cards" ? "cards" : "simples",
    enfeites: !!e?.enfeites,
    rodape: textoPuro(e?.rodape).replace(/\s+/g, " ").slice(0, 160),
  };
}
export function limparTexto(t: Partial<TextoBase> | null | undefined, ids: string[]): TextoBase {
  return {
    titulo: textoPuro(t?.titulo).slice(0, 200),
    conteudo: textoPuro(t?.conteudo).slice(0, 8000),
    imagem: t?.imagem && ids.includes(String(t.imagem)) ? String(t.imagem) : "",
    posicao: POSICOES_TEXTO.includes(t?.posicao as never) ? (t!.posicao as TextoBase["posicao"]) : "topo",
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
  const alternativas = tipo === "multipla" ? (q.alternativas || []).map((a) => textoPuro(a).replace(/^\s*[A-Ea-e][).]\s+/, "").trim()).filter(Boolean).slice(0, 6) : [];
  let resposta = textoPuro(q.resposta);
  if (tipo === "multipla") {
    resposta = resposta.toUpperCase().slice(0, 1);
    if (!alternativas.some((_, i) => letra(i) === resposta)) resposta = "";
  }
  return {
    tipo,
    enunciado: textoPuro(q.enunciado),
    alternativas,
    itens:
      tipo === "vf"
        ? (q.itens || [])
            .map((it) => ({ texto: textoPuro(it?.texto), resposta: (String(it?.resposta).toUpperCase() === "F" ? "F" : "V") as "V" | "F" }))
            .filter((it) => it.texto)
            .slice(0, 10)
        : [],
    resposta,
    criterios: tipo === "discursiva" ? textoPuro(q.criterios) : "",
    valor: Math.max(0, Math.round((Number(q.valor) || 0) * 100) / 100),
    imagem: String(q.imagem ?? "").slice(0, 40),
    figura: limparFigura(q.figura),
    linhas: Math.max(0, Math.min(30, Math.round(Number(q.linhas) || 0))),
    quadro: limparQuadro(q.quadro),
    sequencia: q.imagem ? Math.max(0, Math.min(5, Math.round(Number(q.sequencia) || 0))) : 0,
  };
}

// ---------- Gabarito de uma atividade feita FORA do I.A Prof (lido da foto) ----------
const SYSTEM_GABARITO = `Você lê a foto de uma atividade escolar (impressa ou feita à mão pelo professor) para montar o GABARITO e corrigir os alunos depois.
A foto pode ser a folha em branco, a folha já com as respostas marcadas pelo professor, ou só uma lista de respostas ("1-B, 2-V, 3-…").
Para cada questão, na ordem da folha:
- "tipo": "multipla" (marcar uma alternativa), "vf" (verdadeiro ou falso, com afirmações), "discursiva" (resposta escrita) ou "completar" (lacunas/resposta curta).
- "enunciado": o enunciado transcrito de forma resumida (até 300 caracteres). Se não aparece, use "Questão N".
- "alternativas": textos das alternativas da múltipla escolha, sem a letra. Se só houver letras, use "A", "B", "C"…
- "itens": afirmações do V/F com a resposta "V" ou "F".
- "resposta": a resposta certa (letra da alternativa, resposta esperada ou respostas das lacunas na ordem). Se a folha mostrar a resposta marcada/escrita pelo professor, use-a. Se não mostrar, RESOLVA a questão como um professor faria.
- "criterios": para discursivas, o que vale nota inteira e o que vale metade.
- "valor": o valor da questão se estiver escrito na folha; senão 0.
- "duvida": true se você não conseguiu ler bem ou não teve certeza da resposta certa (o professor confere).
Texto puro: nunca use HTML, markdown ou emojis. Não invente questões que não estão na foto.`;

const SCHEMA_GABARITO = {
  type: "object",
  properties: {
    titulo: { type: "string" },
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
          duvida: { type: "boolean" },
        },
        required: ["tipo", "enunciado", "alternativas", "itens", "resposta", "criterios", "valor", "duvida"],
        additionalProperties: false,
      },
    },
  },
  required: ["titulo", "questoes"],
  additionalProperties: false,
};

export async function gabaritoDaFoto(p: { serie: string; componente: string; valorTotal: number; fotos: Foto[] }) {
  const blocos: Anthropic.ContentBlockParam[] = p.fotos.map((f) => ({
    type: "image",
    source: { type: "base64", media_type: f.tipo as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data: f.dados.toString("base64") },
  }));
  blocos.push({ type: "text", text: `Série: ${nomeAno(p.serie)} · ${p.componente}
Valor total da atividade: ${p.valorTotal}
Monte o gabarito das questões das imagens acima (pode ter mais de uma página).` });
  const r = await chamarJson<{ titulo: string; questoes: Array<Partial<Questao> & { duvida?: boolean }> }>({
    system: SYSTEM_GABARITO,
    mensagem: blocos,
    formato: { nome: "gabarito_foto", schema: SCHEMA_GABARITO },
    maxTokens: 8000,
    modelo: env.anthropicModelCorrecaoDiscursiva || undefined, // leitura caprichada (modelo da correcao com questoes abertas)
  });
  const brutas = (r.questoes || []).slice(0, 30);
  const questoes = brutas.map((q, i) => {
    const l = limparQuestao({ ...q, figura: { tipo: "", conteudo: "" } });
    if (!l.enunciado) l.enunciado = `Questão ${i + 1}`;
    return l;
  });
  if (!questoes.length) throw new ErroAtividade("Não consegui ler as questões na foto. Tire outra foto com a folha inteira, reta e bem iluminada — ou digite o gabarito à mão.");
  const duvidas = brutas.map((q, i) => (q.duvida ? i + 1 : 0)).filter(Boolean);
  return { titulo: textoPuro(r.titulo) || "Atividade", questoes: ajustarValores(questoes, p.valorTotal), duvidas };
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
