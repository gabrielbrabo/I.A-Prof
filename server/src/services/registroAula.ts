import { chamarJson } from "./ai/claude";
import { listarComponentes, Candidata } from "./buscaHabilidades";
import { formatarComLimite } from "../utils/formatarRegistro";
import { nomeAno } from "../utils/anos";
import { PlanoCurso } from "../models/PlanoCurso";
import { RegistroAula } from "../models/RegistroAula";
import { env } from "../config/env";

export interface HabilidadeEscolhida {
  codigo: string;
  habilidade: string;
  fonte: string; // PLANO ou RECOMPOSIÇÃO
}

export interface ItemGerado {
  componente: string;
  conteudo: string;
  habilidades: HabilidadeEscolhida[]; // 1 a 5 habilidades do plano do periodo
  revisar: boolean; // true = IA nao achou habilidade adequada, professor deve escolher
  confianca: "alta" | "baixa" | "memoria"; // memoria = repetiu a escolha do professor para o mesmo conteudo
  candidatas: Array<Pick<Candidata, "codigo" | "habilidade" | "fonte">>;
}

export interface InfoPlano {
  usado: boolean;
  tipoPeriodo: string | null;
  periodo: number | null;
  habilidadesNoPeriodo: number;
}

export interface ResultadoRegistro {
  plano: InfoPlano;
  abertura: string[]; // momentos sem componente (Acolhida, Rotina diaria...), na ordem do professor
  itens: ItemGerado[];
  textoEstilo?: string | null; // texto final no formato das aulas anteriores do professor (quando ha exemplos)
  textoFinal: string;
  compactado: boolean; // descricoes removidas para caber no limite
  excede: boolean; // passou do limite mesmo compactado
}

// ---------- Etapa 1: separar o texto do professor em itens por componente ----------

const SYSTEM_EXTRAIR = `Você é um assistente de professores da educação básica brasileira.
O professor digita, de forma rápida e abreviada, o que trabalhou na aula do dia. Sua tarefa é separar em itens, um por componente curricular, e escrever o conteúdo do jeito que se registra no diário de classe.

Regras:
- Use SOMENTE componentes da lista fornecida (nome exato).
- Abreviações comuns: mat=Matemática, port/lp=Língua Portuguesa, geo=Geografia, hist=História, cien/ciên=Ciências, ens rel/er=Ensino Religioso, ed fis/ef=Educação Física, ing=Língua Inglesa, art=Arte.
- "conteudo" no formato do diário: "Tema: detalhe" quando fizer sentido (ex.: "Multiplicação: Tabuada de 0 a 10", "Estudo do texto: Dia Internacional da Mulher"). Corrija ortografia e maiúsculas.
- NÃO invente conteúdos que o professor não mencionou. Pode apenas organizar e deixar o texto mais claro.
- "palavras_chave": termos pedagógicos ligados ao conteúdo, que ajudem a achar a habilidade (ex.: multiplicação, operações, números naturais).
- Mantenha a ordem em que o professor escreveu.
- Momentos da aula que NÃO são de um componente — acolhida, rotina diária, roda de conversa, chamada, oração, lanche, recreio, parque, habilidade auditiva, música de boas-vindas, calendário, tempo etc. — vão em "abertura" (NÃO viram item), escritos como frase curta do diário: "Acolhida.", "Rotina diária.", "Habilidade auditiva: Sons emitidos pelos animais.". Só inclua o que o professor escreveu, na ordem dele.

Exemplo de entrada: "mat tabuada 0 a 10, port texto dia da mulher, ens rel manifestações religiosas, geo poema diversidade cultural"
Exemplo de saída (conteudo): "Multiplicação: Tabuada de 0 a 10" | "Estudo do texto: Dia Internacional da Mulher" | "Manifestações Religiosas" | "Diversidade Cultural: Poema"`;

interface Extraido {
  abertura: string[];
  itens: Array<{ componente: string; conteudo: string; palavras_chave: string[] }>;
}

async function extrairItens(texto: string, ano: string, componentes: string[]): Promise<Extraido> {
  const r = await chamarJson<Extraido>({
    system: SYSTEM_EXTRAIR,
    mensagem: `Série: ${nomeAno(ano)}\nComponentes permitidos: ${componentes.join(" | ")}\n\nTexto do professor:\n"""${texto}"""`,
    formato: {
      nome: "registrar_itens",
      schema: {
        type: "object",
        properties: {
          abertura: { type: "array", items: { type: "string" } },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                componente: { type: "string", enum: componentes },
                conteudo: { type: "string" },
                palavras_chave: { type: "array", items: { type: "string" } },
              },
              required: ["componente", "conteudo", "palavras_chave"],
              additionalProperties: false,
            },
          },
        },
        required: ["abertura", "itens"],
        additionalProperties: false,
      },
    },
  });
  // Normaliza o componente (a IA pode variar maiusculas) e descarta invalidos
  const porNome = new Map(componentes.map((c) => [c.toLowerCase(), c]));
  return {
    abertura: (r.abertura || []).map((a) => String(a).trim()).filter(Boolean).slice(0, 8),
    itens: (r.itens || [])
      .map((i) => ({ ...i, componente: porNome.get(String(i.componente).toLowerCase()) ?? "" }))
      .filter((i) => i.componente && i.conteudo?.trim()),
  };
}

// ---------- Etapa 2: escolher a habilidade de cada item entre as candidatas ----------

const SYSTEM_ESCOLHER = `Você é especialista na BNCC e nos currículos estaduais brasileiros e ajuda professores a registrar aulas no diário.
Para cada item de aula, escolha de 1 a 5 habilidades que a atividade descrita realmente desenvolve, considerando a série.

Como decidir — pense no que os alunos FAZEM na aula:
- Estudo do texto / leitura / interpretação → habilidades de leitura e compreensão (ideia central, localizar informações explícitas, inferir, relacionar texto e imagem). NÃO use habilidades de oralidade/escuta, a menos que a aula seja de fala/escuta.
- Produção de texto / escrita → habilidades de produção escrita do gênero trabalhado.
- Avaliação, revisão, atividades de fixação → habilidades do CONTEÚDO avaliado/revisado (ex.: revisão de contas → operações com números naturais).
- Atividades sobre um tema (ex.: transformação da matéria) → as habilidades que tratam exatamente desse tema; escolha a mais específica.
- Normalmente escolha 1 habilidade. Use 2 a 5 SÓ quando o texto do professor deixar claro que a atividade trabalha mais de uma (ex.: estudo de texto com interpretação → ideia central + localizar informações). Nunca acrescente habilidade só por ser "do mesmo assunto" ou do mesmo componente.
- Se houver "Escolhas anteriores do professor", siga o mesmo critério dele para conteúdos parecidos — ele é quem conhece a turma.
- "confianca": "alta" quando o conteúdo deixa claro qual habilidade é; "baixa" quando o texto é genérico (ex.: "revisão de conteúdos", "atividades", "avaliação" sem dizer o assunto) e a escolha é um palpite.

Regras:
- Escolha SOMENTE códigos da lista de candidatas daquele item. Nunca invente código.
- As candidatas são as habilidades previstas no plano de curso da turma para este período.
- Prefira as habilidades regulares; use uma marcada [RECOMPOSIÇÃO] só se ela corresponder claramente melhor ao conteúdo.
- Se nenhuma candidata corresponder razoavelmente, devolva lista vazia.`;

interface Escolhas {
  escolhas: Array<{ indice: number; codigos: string[]; confianca: "alta" | "baixa" }>;
}

async function escolherHabilidades(
  ano: string,
  itens: Extraido["itens"],
  candidatas: CandidataPlano[][],
  exemplos: string
): Promise<Escolhas["escolhas"]> {
  const blocos = itens
    .map((it, idx) => {
      const lista = candidatas[idx]
        .map((c) => `  - ${c.codigo} ${c.recomposicao ? "[RECOMPOSIÇÃO] " : ""}${c.objetoConhecimento ? `(${c.objetoConhecimento}) ` : ""}${c.habilidade}`)
        .join("\n");
      return `ITEM ${idx}: ${it.componente} — ${it.conteudo}\nCandidatas:\n${lista || "  (nenhuma)"}`;
    })
    .join("\n\n");

  const r = await chamarJson<Escolhas>({
    system: SYSTEM_ESCOLHER,
    mensagem: `Série: ${nomeAno(ano)}\n\n${exemplos ? `Escolhas anteriores do professor (mesmo período):\n${exemplos}\n\n` : ""}${blocos}`,
    modelo: env.anthropicModelEscolha || undefined,
    formato: {
      nome: "escolher_habilidades",
      schema: {
        type: "object",
        properties: {
          escolhas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                indice: { type: "integer" },
                codigos: { type: "array", items: { type: "string" } },
                confianca: { type: "string", enum: ["alta", "baixa"] },
              },
              required: ["indice", "codigos", "confianca"],
              additionalProperties: false,
            },
          },
        },
        required: ["escolhas"],
        additionalProperties: false,
      },
    },
  });
  return r.escolhas || [];
}

// ---------- Plano de curso ----------

type CandidataPlano = Candidata & { doPlano: boolean; recomposicao: boolean };

interface ItemPlanoLean {
  componente: string;
  codigo?: string | null;
  habilidade?: string | null;
  conteudo?: string | null;
  noBanco?: boolean | null;
  recomposicao?: boolean | null;
}
interface PeriodoLean {
  numero: number;
  inicio: string;
  fim: string;
  itens: ItemPlanoLean[];
}

// Periodo do plano de curso escolhido pelo professor. Erro claro se nao houver plano para ele.
async function periodoDoPlano(usuario: string, ano: string, anoLetivo: number, periodo: number, turma?: string | null) {
  const plano =
    (turma ? await PlanoCurso.findOne({ usuario, ano, anoLetivo, turma }).lean() : null) ??
    (await PlanoCurso.findOne({ usuario, ano, anoLetivo }).sort({ updatedAt: -1 }).lean());
  if (!plano) throw new ErroRegistro(`Não há plano de curso para ${nomeAno(ano)} em ${anoLetivo}. Cadastre na aba Plano de curso.`);
  const p = (plano.periodos as PeriodoLean[]).find((x) => x.numero === periodo);
  const itens = (p?.itens ?? []).filter((i) => i.codigo && i.habilidade);
  if (!p || !itens.length) throw new ErroRegistro(`O plano de curso não tem habilidades no ${periodo}º ${plano.tipoPeriodo}.`);
  // Todos os codigos do plano do ano (o professor pode escolher A MAO habilidades de outros periodos)
  const doAno = (plano.periodos as PeriodoLean[]).flatMap((x) => x.itens).filter((i) => i.codigo);
  return { tipoPeriodo: plano.tipoPeriodo, periodo: p, itens, doAno };
}

// Codigos que NAO estao no plano de curso do ano (usado ao salvar).
// A I.A so escolhe do periodo da aula; o professor pode incluir a mao habilidades de outros periodos do plano.
export async function codigosForaDoPeriodo(p: { usuario: string; ano: string; anoLetivo: number; periodo: number; turma?: string | null; codigos: string[] }) {
  const ctx = await periodoDoPlano(p.usuario, p.ano, p.anoLetivo, p.periodo, p.turma);
  const doAno = new Set(ctx.doAno.map((i) => String(i.codigo).toUpperCase()));
  return { fora: [...new Set(p.codigos.map((c) => c.toUpperCase()))].filter((c) => !doAno.has(c)), tipoPeriodo: ctx.tipoPeriodo };
}

// Erro de regra (mostrado ao professor), diferente de erro interno
export class ErroRegistro extends Error {}

// ---------- Memoria das escolhas do professor ----------

const chaveConteudo = (componente: string, conteudo: string) =>
  `${componente}|${conteudo}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9|]+/g, " ")
    .trim();

// Registros ja salvos (revisados pelo professor) do mesmo periodo: viram exemplos e "memoria"
async function memoriaDoPeriodo(usuario: string, ano: string, anoLetivo: number, periodo: number) {
  const regs = await RegistroAula.find({ usuario, ano, anoLetivo, periodo }).sort({ createdAt: -1 }).limit(40).lean();
  const memoria = new Map<string, string[]>(); // conteudo exato -> codigos escolhidos
  const exemplos: string[] = [];
  for (const r of regs) {
    for (const it of r.itens as Array<{ componente: string; conteudo: string; habilidades?: Array<{ codigo: string }>; conferir?: boolean }>) {
      const cods = (it.habilidades ?? []).map((h) => h.codigo);
      if (!cods.length || it.conferir) continue; // palpite nao conferido nao vira exemplo
      const chave = chaveConteudo(it.componente, it.conteudo);
      if (!memoria.has(chave)) {
        memoria.set(chave, cods);
        if (exemplos.length < 20) exemplos.push(`- ${it.componente}: "${it.conteudo}" → ${cods.join(", ")}`);
      }
    }
  }
  return { memoria, exemplos: exemplos.join("\n") };
}

// ---------- Fluxo completo ----------

// As habilidades vem SOMENTE do plano de curso do periodo escolhido pelo professor.
export async function gerarRegistroAula(params: {
  usuario: string;
  texto: string;
  ano: string;
  uf?: string | null;
  turma?: string | null;
  anoLetivo: number;
  periodo: number;
  limiteSaida?: number | null;
}): Promise<ResultadoRegistro> {
  const ctx = await periodoDoPlano(params.usuario, params.ano, params.anoLetivo, params.periodo, params.turma);
  const plano: InfoPlano = {
    usado: true,
    tipoPeriodo: ctx.tipoPeriodo,
    periodo: ctx.periodo.numero,
    habilidadesNoPeriodo: ctx.itens.length,
  };

  // Componentes: os do plano no periodo + os da base (para reconhecer o que o professor escreveu)
  const daBase = await listarComponentes(params.ano, params.uf);
  const componentes = [...new Set([...ctx.itens.map((i) => i.componente), ...daBase])];

  const { itens, abertura } = await extrairItens(params.texto, params.ano, componentes);
  if (!itens.length) {
    const fmt0 = formatarComLimite([], params.limiteSaida, abertura);
    return { plano, abertura, itens: [], textoFinal: fmt0.texto, compactado: false, excede: fmt0.excede };
  }

  // Candidatas = habilidades do plano do periodo, do mesmo componente
  const candidatas: CandidataPlano[][] = itens.map((it) =>
    ctx.itens
      .filter((p) => p.componente === it.componente)
      .map((p) => ({
        codigo: p.codigo!,
        habilidade: p.habilidade!,
        fonte: "PLANO",
        uf: null,
        objetoConhecimento: p.conteudo ?? null,
        unidadeTematica: null,
        doPlano: true,
        recomposicao: !!p.recomposicao,
      }))
  );

  // Memoria: se o professor ja registrou EXATAMENTE esse conteudo neste periodo, repete a escolha dele (sem IA)
  const { memoria, exemplos } = await memoriaDoPeriodo(params.usuario, params.ano, params.anoLetivo, params.periodo);
  const daMemoria = itens.map((it, idx) => {
    const cods = memoria.get(chaveConteudo(it.componente, it.conteudo)) ?? [];
    return cods.filter((c) => candidatas[idx].some((x) => x.codigo === c));
  });

  // A I.A escolhe entre as habilidades REGULARES do plano do periodo. As de recomposicao (muitas vezes de
  // anos/periodos anteriores) so vao para a I.A se o componente nao tiver nenhuma regular neste periodo;
  // o professor ainda pode inclui-las manualmente.
  const candidatasIA: CandidataPlano[][] = candidatas.map((lista) => {
    const regulares = lista.filter((c) => !c.recomposicao);
    return regulares.length ? regulares : lista;
  });

  // So chama a IA para os itens que tem candidatas e nao vieram da memoria
  const precisaIA = itens.some((_, idx) => candidatasIA[idx].length && !daMemoria[idx].length);
  const escolhas = precisaIA ? await escolherHabilidades(params.ano, itens, candidatasIA, exemplos) : [];

  const resultado: ItemGerado[] = itens.map((it, idx) => {
    const escolha = escolhas.find((e) => e.indice === idx);
    const lembrado = daMemoria[idx].length > 0;
    const pedidos = (lembrado ? daMemoria[idx] : escolha?.codigos ?? []).map((c) => String(c).trim().toUpperCase());
    // Validacao: so entram codigos do plano do periodo (impede codigo inventado), sem repetir, no maximo 5.
    // Escolha da I.A: so entre as que ela recebeu. Memoria: escolha do professor entre todas do periodo.
    const permitidas = lembrado ? candidatas[idx] : candidatasIA[idx];
    const escolhidas = [...new Set(pedidos)]
      .map((cod) => permitidas.find((c) => c.codigo === cod))
      .filter((c): c is CandidataPlano => !!c)
      .slice(0, 5);
    return {
      componente: it.componente,
      conteudo: it.conteudo.trim(),
      // descricao vem do plano, nunca da IA
      habilidades: escolhidas.map((c) => ({ codigo: c.codigo, habilidade: c.habilidade, fonte: c.recomposicao ? "RECOMPOSIÇÃO" : "PLANO" })),
      revisar: !escolhidas.length,
      confianca: lembrado ? "memoria" : escolha?.confianca === "alta" ? "alta" : "baixa",
      candidatas: candidatas[idx].map((c) => ({ codigo: c.codigo, habilidade: c.habilidade, fonte: c.recomposicao ? "RECOMPOSIÇÃO" : "PLANO" })),
    };
  });

  const fmt = formatarComLimite(resultado, params.limiteSaida, abertura);
  // Formato do professor: se ele ja editou textos de aulas salvas, a I.A escreve no mesmo formato
  const textoEstilo = await formatarNoEstilo({
    usuario: params.usuario,
    ano: params.ano,
    turma: params.turma,
    abertura,
    itens: resultado,
    limite: params.limiteSaida,
  }).catch((e) => {
    console.error("[registro-aula/estilo]", e);
    return null;
  });
  return { plano, abertura, itens: resultado, textoFinal: fmt.texto, compactado: fmt.compactado, excede: fmt.excede, textoEstilo };
}

// ---------- Etapa 3 (opcional): escrever o texto final no formato do professor ----------

// Aulas salvas em que o professor editou o texto final a mao = o formato que ele usa no diario
async function exemplosDeFormato(usuario: string, ano: string, turma?: string | null): Promise<string[]> {
  const filtro: Record<string, unknown> = { usuario, ano, textoEditado: true };
  const daTurma = turma ? await RegistroAula.find({ ...filtro, turma }).sort({ updatedAt: -1 }).limit(3).lean() : [];
  const lista = daTurma.length ? daTurma : await RegistroAula.find(filtro).sort({ updatedAt: -1 }).limit(3).lean();
  return lista.map((r) => String(r.textoFinal ?? "").trim()).filter((t) => t.length > 20);
}

const SYSTEM_ESTILO = `Você escreve o registro de aula do diário escolar NO MESMO FORMATO que o professor usa.
Você recebe exemplos de aulas que o próprio professor escreveu e os dados da aula de hoje (momentos de abertura, componentes, conteúdos e habilidades já escolhidas).

Regras:
- Copie a estrutura dos exemplos: ordem das partes, rótulos (ex.: "Atividade 1:", "Campo de experiência:", "Componente curricular:", "Habilidade:"), quebras de linha, pontuação, maiúsculas e se usa ou não a descrição das habilidades.
- Use SOMENTE os dados da aula de hoje. Não copie conteúdos dos exemplos e não invente atividades.
- Use EXATAMENTE os códigos de habilidade informados, todos eles, e nenhum outro.
- Se o formato dos exemplos não tiver lugar para algo, adapte da forma mais parecida possível.
- Responda só com o texto do registro.`;

// Codigos de habilidade presentes num texto
const codigosNoTexto = (t: string) => new Set((t.toUpperCase().match(/\b(?:EI|EF|EM)\d{2}[A-Z]{2,3}\d{2,3}[A-Z0-9]{0,4}\b/g) ?? []));

export async function formatarNoEstilo(p: {
  usuario: string;
  ano: string;
  turma?: string | null;
  abertura: string[];
  itens: Array<{ componente: string; conteudo: string; habilidades: Array<{ codigo: string; habilidade?: string | null }> }>;
  limite?: number | null;
}): Promise<string | null> {
  const exemplos = await exemplosDeFormato(p.usuario, p.ano, p.turma);
  if (!exemplos.length || !p.itens.length) return null;
  const dados = [
    p.abertura.length ? `Abertura: ${p.abertura.join(" | ")}` : "Abertura: (nenhuma)",
    ...p.itens.map(
      (it, i) =>
        `Item ${i + 1} — Componente: ${it.componente} | Conteúdo: ${it.conteudo} | Habilidades: ${
          it.habilidades.map((h) => `${h.codigo}${h.habilidade ? ` (${h.habilidade})` : ""}`).join("; ") || "(nenhuma)"
        }`
    ),
  ].join("\n");
  const r = await chamarJson<{ texto: string }>({
    system: SYSTEM_ESTILO,
    mensagem: `Série: ${nomeAno(p.ano)}${p.limite ? `\nLimite: até ${p.limite} caracteres.` : ""}\n\nExemplos do professor:\n${exemplos
      .map((e, i) => `--- Exemplo ${i + 1} ---\n${e}`)
      .join("\n")}\n\nAula de hoje:\n${dados}`,
    formato: {
      nome: "registro_no_estilo",
      schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"], additionalProperties: false },
    },
  });
  const texto = (r.texto ?? "").trim();
  if (!texto) return null;
  // Seguranca: os codigos do texto tem de ser exatamente os escolhidos (nem a mais, nem a menos)
  const esperados = new Set(p.itens.flatMap((i) => i.habilidades.map((h) => h.codigo.toUpperCase())));
  const achados = codigosNoTexto(texto);
  const iguais = esperados.size === achados.size && [...esperados].every((c) => achados.has(c));
  if (!iguais) return null;
  if (p.limite && texto.length > p.limite) return null;
  return texto;
}
