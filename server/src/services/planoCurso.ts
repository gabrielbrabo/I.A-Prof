import { chamarJson, Conteudo } from "./ai/claude";
import { Habilidade } from "../models/Habilidade";
import { listarComponentes } from "./buscaHabilidades";
import { nomeAno } from "../utils/anos";
import { anosPorCodigo } from "./planoSemIA";

export type TipoPeriodo = "bimestre" | "trimestre" | "semestre";

export interface ItemPlano {
  componente: string;
  codigo: string | null;
  habilidade: string | null;
  conteudo: string | null;
  noBanco: boolean;
  recomposicao?: boolean; // habilidade de recomposicao (retomada de ano anterior)
  conferir?: boolean; // entrou pela rede de seguranca da leitura: professor deve conferir
  origemTexto?: "oficial" | "documento" | null; // de onde veio o texto da habilidade
  textoOficial?: string | null; // sugestao: texto oficial quando o do documento e quase igual (provavel erro de digitacao)
}

export interface PeriodoPlano {
  numero: number;
  inicio: string;
  fim: string;
  itens: ItemPlano[];
}

export const QTD_PERIODOS: Record<TipoPeriodo, number> = { bimestre: 4, trimestre: 3, semestre: 2 };

// Datas padrao de cada periodo (o professor ajusta na tela conforme o calendario da rede)
const DATAS_PADRAO: Record<TipoPeriodo, Array<[string, string]>> = {
  bimestre: [
    ["02-01", "04-15"],
    ["04-16", "07-10"],
    ["07-25", "09-30"],
    ["10-01", "12-20"],
  ],
  trimestre: [
    ["02-01", "05-15"],
    ["05-16", "08-31"],
    ["09-01", "12-20"],
  ],
  semestre: [
    ["02-01", "07-10"],
    ["07-25", "12-20"],
  ],
};

// Periodos novos com as datas zeradas: o professor cadastra conforme o calendario da escola
export function periodosPadrao(tipo: TipoPeriodo, _anoLetivo?: number): PeriodoPlano[] {
  return DATAS_PADRAO[tipo].map((_, idx) => ({ numero: idx + 1, inicio: "", fim: "", itens: [] }));
}

// Periodo que contem a data (YYYY-MM-DD). Se cair num recesso, usa o ultimo periodo ja iniciado.
export function periodoDaData<P extends { numero: number; inicio: string; fim: string }>(periodos: P[], data: string): P | null {
  const ordenados = periodos.filter((p) => p.inicio && p.fim).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const dentro = ordenados.find((p) => data >= p.inicio && data <= p.fim);
  if (dentro) return dentro;
  const anteriores = ordenados.filter((p) => p.inicio <= data);
  return anteriores[anteriores.length - 1] ?? null;
}

// Codigo no padrao BNCC/curriculos: EF04MA30MG, EF15LP03, EI03EF01, EM13LGG101, EF04GE01X
const PADRAO_CODIGO = /^(EI|EF|EM)\d{2}[A-Z]{2,3}\d{2,3}[A-Z0-9]*$/;

export function normalizarCodigo(c: string | null | undefined): string | null {
  if (!c) return null;
  const limpo = c.toUpperCase().replace(/[\s().\-–]/g, "");
  return PADRAO_CODIGO.test(limpo) ? limpo : null;
}

// ---------- Extracao com IA ----------

const SYSTEM_PLANO = `Você recebe o PLANO DE CURSO (planejamento anual) de uma turma da educação básica brasileira.
Extraia TODAS as habilidades/objetivos previstos, dizendo em qual período cada um deve ser trabalhado.

Regras:
- "codigo": o código da habilidade exatamente como aparece (ex.: EF04MA30MG, EF15LP03, EF04GE01X). Se o item não tiver código, deixe "".
- "habilidade": a descrição da habilidade transcrita do documento (sem resumir, sem inventar). Se não houver, "".
- "conteudo": o conteúdo/objeto de conhecimento ligado à habilidade, se o documento trouxer (curto). Se não, "".
- "componente": use um nome da lista de componentes fornecida quando corresponder (ex.: "Mat." = "Matemática").
- Não invente habilidades que não estão no documento. Ignore cabeçalhos, assinaturas e textos administrativos.
- Se a mesma habilidade aparece em mais de um período, repita o item em cada período.`;

interface Extracao {
  divisaoEncontrada: boolean;
  itens: Array<{ periodo: number; componente: string; codigo: string; habilidade: string; conteudo: string }>;
}

export async function extrairPlanoDeArquivos(params: {
  blocos: Conteudo;
  ano: string;
  uf?: string | null;
  tipoPeriodo: TipoPeriodo;
  // numero = arquivo de um periodo escolhido pelo professor
  // "todos" = arquivo com o ano todo (se nao houver divisao, distribui em ordem)
  // "auto"  = arquivo de um ou mais periodos: a IA descobre qual pelo documento (nao distribui)
  periodoAlvo: number | "todos" | "auto";
}): Promise<{ itensPorPeriodo: Map<number, ItemPlano[]>; divisaoEncontrada: boolean; naoIdentificados: number }> {
  const qtd = QTD_PERIODOS[params.tipoPeriodo];
  const componentes = await listarComponentes(params.ano, params.uf);

  const fixo = typeof params.periodoAlvo === "number" ? params.periodoAlvo : null;
  const instrucaoPeriodo =
    fixo != null
      ? `Este arquivo é o plano do ${fixo}º ${params.tipoPeriodo}. Use periodo = ${fixo} em todos os itens.`
      : params.periodoAlvo === "auto"
      ? `O arquivo é o plano de um (ou mais) ${params.tipoPeriodo}s do ano, que tem ${qtd} ${params.tipoPeriodo}s.
Descubra pelo próprio documento a qual ${params.tipoPeriodo} cada habilidade pertence (títulos como "1º ${params.tipoPeriodo}", "I ${params.tipoPeriodo}", datas, meses).
Se o documento usar outra divisão (ex.: bimestres num ano de trimestres), converta pela posição no ano.
NÃO distribua por conta própria: se não houver nenhuma indicação de período, use periodo = 0 e divisaoEncontrada = false.`
      : `O arquivo cobre o ano todo, dividido em ${qtd} ${params.tipoPeriodo}s. Identifique em qual ${params.tipoPeriodo} (1 a ${qtd}) cada habilidade está.
Se o documento usar outra divisão (ex.: bimestres num ano de trimestres), converta pela posição no ano.
Se o documento NÃO dividir por período, distribua as habilidades de cada componente em ordem, de forma equilibrada entre os ${qtd} períodos, mantendo a sequência do documento, e devolva divisaoEncontrada = false.`;

  const blocos = typeof params.blocos === "string" ? [{ type: "text" as const, text: params.blocos }] : params.blocos;

  const r = await chamarJson<Extracao>({
    system: SYSTEM_PLANO,
    mensagem: [
      ...blocos,
      {
        type: "text",
        text: `Série: ${nomeAno(params.ano)}\nComponentes conhecidos: ${componentes.join(" | ")}\n\n${instrucaoPeriodo}`,
      },
    ],
    maxTokens: 32000,
    formato: {
      nome: "plano_curso",
      schema: {
        type: "object",
        properties: {
          divisaoEncontrada: { type: "boolean" },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                periodo: { type: "integer" },
                componente: { type: "string" },
                codigo: { type: "string" },
                habilidade: { type: "string" },
                conteudo: { type: "string" },
              },
              required: ["periodo", "componente", "codigo", "habilidade", "conteudo"],
              additionalProperties: false,
            },
          },
        },
        required: ["divisaoEncontrada", "itens"],
        additionalProperties: false,
      },
    },
  });

  const porNome = new Map(componentes.map((c) => [c.toLowerCase(), c]));
  const auto = params.periodoAlvo === "auto";
  const brutosTodos = (r.itens || []).map((i) => ({
    periodo:
      fixo ??
      (auto
        ? Math.round(i.periodo) >= 1 && Math.round(i.periodo) <= qtd
          ? Math.round(i.periodo)
          : 0 // 0 = periodo nao identificado
        : Math.min(Math.max(Math.round(i.periodo) || 1, 1), qtd)),
    componente: porNome.get(i.componente.trim().toLowerCase()) ?? i.componente.trim(),
    codigo: normalizarCodigo(i.codigo),
    habilidade: i.habilidade?.trim() || null,
    conteudo: i.conteudo?.trim() || null,
  }));

  const naoIdentificados = brutosTodos.filter((b) => b.periodo === 0).length;
  const brutos = brutosTodos.filter((b) => b.periodo !== 0);
  const itens = await validarNoBanco(brutos);
  const itensPorPeriodo = new Map<number, ItemPlano[]>();
  itens.forEach((it, idx) => {
    const p = brutos[idx].periodo;
    const lista = itensPorPeriodo.get(p) ?? [];
    // evita duplicata no mesmo periodo
    const chave = it.codigo ?? `${it.componente}|${it.habilidade ?? it.conteudo}`;
    if (!lista.some((x) => (x.codigo ?? `${x.componente}|${x.habilidade ?? x.conteudo}`) === chave)) lista.push(it);
    itensPorPeriodo.set(p, lista);
  });

  return { itensPorPeriodo, divisaoEncontrada: fixo != null || r.divisaoEncontrada, naoIdentificados };
}

// Confere os codigos na base: se existir, usa a descricao e o componente oficiais
async function validarNoBanco(
  itens: Array<{ componente: string; codigo: string | null; habilidade: string | null; conteudo: string | null }>
): Promise<ItemPlano[]> {
  const codigos = [...new Set(itens.map((i) => i.codigo).filter((c): c is string => !!c))];
  const docs = await Habilidade.find({ codigo: { $in: codigos } }).lean();
  const mapa = new Map(docs.map((d) => [d.codigo, d]));
  return itens
    .filter((i) => i.codigo || i.habilidade || i.conteudo)
    .map((i) => {
      const d = i.codigo ? mapa.get(i.codigo) : undefined;
      return {
        componente: d?.componente ?? i.componente,
        codigo: i.codigo,
        habilidade: d?.habilidade ?? i.habilidade,
        conteudo: i.conteudo ?? d?.objetoConhecimento ?? null,
        noBanco: !!d,
      };
    });
}

// Ao salvar o plano: codigos que nao existem na base (ex.: curriculo estadual ainda nao importado)
// entram na base como fonte "PLANO-CURSO", para o registro de aula poder usa-los.
export async function cadastrarCodigosNovos(params: { ano: string; uf?: string | null; itens: ItemPlano[] }): Promise<number> {
  if (!params.uf) return 0; // sem UF nao da para saber de qual curriculo e
  const comTexto = params.itens.filter((i) => i.codigo && i.habilidade);
  if (!comTexto.length) return 0;
  const existentes = new Map(
    (await Habilidade.find({ codigo: { $in: comTexto.map((n) => n.codigo) } }, { codigo: 1, fonte: 1, habilidade: 1 }).lean()).map((d) => [
      d.codigo,
      d,
    ])
  );
  const ops: Parameters<typeof Habilidade.bulkWrite>[0] = [];
  let novos = 0;
  for (const n of comTexto) {
    const atual = existentes.get(n.codigo!);
    if (!atual) {
      novos++;
      ops.push({
        updateOne: {
          filter: { codigo: n.codigo! },
          update: {
            $setOnInsert: {
              codigo: n.codigo!,
              fonte: "PLANO-CURSO",
              uf: params.uf!.toUpperCase(),
              anos: anosPorCodigo(n.codigo!).length ? anosPorCodigo(n.codigo!) : [params.ano],
              componente: n.componente,
              habilidade: n.habilidade!,
              objetoConhecimento: n.conteudo,
            },
          },
          upsert: true,
        },
      });
    } else if (atual.fonte === "PLANO-CURSO" && atual.habilidade !== n.habilidade) {
      // Codigo que veio de um plano anterior (texto pode ter sido lido errado): atualiza com o texto do plano atual.
      // Habilidades oficiais (BNCC/curriculo importado) nunca sao alteradas.
      ops.push({ updateOne: { filter: { codigo: n.codigo!, fonte: "PLANO-CURSO" }, update: { $set: { habilidade: n.habilidade!, componente: n.componente } } } });
    }
  }
  if (ops.length) await Habilidade.bulkWrite(ops);
  return novos;
}
