import path from "path";
import { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { PlanoCurso } from "../models/PlanoCurso";
import { EXTENSOES_ACEITAS } from "../services/arquivoParaIA";
import { Achado, lerArquivoSemIA, montarItens } from "../services/planoSemIA";
import {
  cadastrarCodigosNovos,
  periodosPadrao,
  QTD_PERIODOS,
  TipoPeriodo,
} from "../services/planoCurso";

// Versao da leitura do PDF (aparece na conferencia: confirma que o servidor foi reiniciado com a leitura nova)
const VERSAO_LEITURA = "3 (07/10/2026)";

// Upload em memoria: ate 10 arquivos de 20 MB
export const uploadPlano = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (EXTENSOES_ACEITAS.includes(ext)) cb(null, true);
    else cb(new Error(`Formato nao suportado (${ext}). Use: ${EXTENSOES_ACEITAS.join(", ")}`));
  },
}).array("arquivos", 10);

const tipoSchema = z.enum(["bimestre", "trimestre", "semestre"]);

// GET /api/planos-curso/padrao?tipo=trimestre&anoLetivo=2026 -> periodos com datas padrao
export async function padrao(req: Request, res: Response) {
  const p = z.object({ tipo: tipoSchema, anoLetivo: z.coerce.number().int().min(2000).max(2100) }).safeParse(req.query);
  if (!p.success) return res.status(400).json({ message: "Informe tipo e anoLetivo" });
  res.json(periodosPadrao(p.data.tipo, p.data.anoLetivo));
}

const extrairSchema = z.object({
  ano: z.string().min(1),
  uf: z.string().length(2).optional().or(z.literal("")),
  tipoPeriodo: tipoSchema,
  periodo: z.string().optional(), // "todos" ou numero do periodo
  permitirIA: z.string().optional(), // ignorado: a leitura do plano nao usa mais I.A
});

// POST /api/planos-curso/extrair (multipart: arquivos[]) -> habilidades por periodo (nao salva)
// Leitura SEMPRE sem I.A (custo zero), no plano por periodo e no do ano todo.
export async function extrair(req: Request, res: Response) {
  const p = extrairSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Informe serie, tipo de periodo e periodo" });
  const arquivos = (req.files as Express.Multer.File[] | undefined) ?? [];
  // O multer entrega o nome em latin1: corrige acentos ("4Âº ano" -> "4º ano")
  arquivos.forEach((a) => (a.originalname = Buffer.from(a.originalname, "latin1").toString("utf8")));
  if (!arquivos.length) return res.status(400).json({ message: "Envie pelo menos um arquivo" });

  const tipo = p.data.tipoPeriodo as TipoPeriodo;
  const qtd = QTD_PERIODOS[tipo];
  const bruto = p.data.periodo || "todos";
  const periodoAlvo: number | "todos" = bruto === "todos" ? "todos" : Number(bruto);
  if (typeof periodoAlvo === "number" && !(periodoAlvo >= 1 && periodoAlvo <= qtd)) {
    return res.status(400).json({ message: "Periodo invalido" });
  }

  try {
    // 1) Leitura sem IA de todos os arquivos
    const achados: Achado[] = [];
    const semTexto: string[] = [];
    const unidades = new Set<string>();
    const codigosNoTexto = new Set<string>();
    let todosPorColuna = true;
    for (const a of arquivos) {
      const r = await lerArquivoSemIA(a.originalname, a.buffer);
      if (r.semTexto) semTexto.push(a.originalname);
      achados.push(...r.achados);
      r.unidades.forEach((u) => unidades.add(u));
      r.codigosNoTexto.forEach((c) => codigosNoTexto.add(c));
      if (!r.porColuna) todosPorColuna = false;
    }
    // Conferencia: codigos do documento que nao entraram.
    // Em PDF com tabela, sao citacoes em outras colunas (ex.: "Orientacoes pedagogicas"), nao habilidades do periodo.
    const conferir = (capturados: Set<string | null>, ignorar: string[] = []) => {
      const fora = [...codigosNoTexto].filter((c) => !capturados.has(c) && !ignorar.includes(c));
      return todosPorColuna ? { foraDaLeitura: [], citadosFora: fora } : { foraDaLeitura: fora, citadosFora: [] };
    };

    const nomes = arquivos.map((a) => a.originalname);
    const precisaIA = !achados.length;

    // ---------- Plano de UM periodo: nunca usa IA ----------
    if (typeof periodoAlvo === "number") {
      if (precisaIA) {
        return res.status(422).json({
          message: semTexto.length
            ? `Não foi possível ler o texto de: ${semTexto.join(", ")} (foto ou PDF escaneado). Envie o arquivo em PDF com texto, Word ou Excel, ou adicione as habilidades manualmente.`
            : "Nenhum código de habilidade (ex.: EF04MA30MG) foi encontrado no documento. Adicione as habilidades manualmente.",
        });
      }
      // So entram as habilidades do periodo escolhido. Se o documento indica periodos (ex.: "2º TRIMESTRE"),
      // as habilidades marcadas em OUTRO periodo ficam de fora (o plano do periodo deve ser estrito).
      const periodosDoc = [...new Set(achados.map((x) => x.periodo).filter((x): x is number => x != null))];
      const nomeUnid = [...unidades][0] ?? tipo;
      if (periodosDoc.length && !periodosDoc.includes(periodoAlvo)) {
        return res.status(422).json({
          message: `O documento é do ${periodosDoc.map((n) => `${n}º`).join(", ")} ${nomeUnid}, mas você escolheu o ${periodoAlvo}º. Escolha o período certo antes de enviar o arquivo.`,
        });
      }
      const doPeriodo = achados.filter((x) => x.periodo == null || x.periodo === periodoAlvo);
      const deOutroPeriodo = [...new Set(achados.filter((x) => x.periodo != null && x.periodo !== periodoAlvo).map((x) => x.codigo))].filter(
        (c) => !doPeriodo.some((x) => x.codigo === c)
      );
      const itens = await montarItens(doPeriodo, p.data.uf || null);
      const capturados = new Set(itens.map((i) => i.codigo));
      // Arquivo com VARIOS periodos enviado como "um arquivo de cada periodo": provavelmente e o plano do ano inteiro
      const modoErrado =
        periodosDoc.length >= 2
          ? {
              sugerido: "todos",
              mensagem: `Este arquivo parece ter o plano do ano inteiro (${periodosDoc
                .sort((a, b) => a - b)
                .map((n) => `${n}º`)
                .join(", ")} ${nomeUnid}). Se for isso, escolha "Um arquivo com o plano do ano inteiro" e envie de novo.`,
            }
          : null;
      const avisoPeriodo = deOutroPeriodo.length
        ? `O documento também tem habilidades de outro(s) ${nomeUnid}(s) (${periodosDoc.filter((n) => n !== periodoAlvo).map((n) => `${n}º`).join(", ")}). Só entraram as do ${periodoAlvo}º; ${deOutroPeriodo.length} ficaram de fora: ${deOutroPeriodo.join(", ")}.`
        : null;
      return res.json({
        metodo: "sem-ia",
        versaoLeitura: VERSAO_LEITURA,
        divisaoEncontrada: true,
        naoIdentificados: 0,
        semTexto,
        avisoPeriodo,
        modoErrado,
        recuperados: itens.filter((i) => i.conferir).map((i) => i.codigo),
        ...conferir(capturados, deOutroPeriodo),
        arquivos: nomes,
        periodos: [{ numero: periodoAlvo, itens }],
        total: itens.length,
      });
    }

    // ---------- Plano do ANO TODO ----------
    if (!precisaIA) {
      // O documento precisa dizer em qual periodo esta cada habilidade (ex.: titulo "2º TRIMESTRE")
      if (unidades.size && !unidades.has(tipo)) {
        return res.status(422).json({
          message: `O documento está dividido em ${[...unidades].join("/")}s, mas você escolheu ${tipo}s. Ajuste a "Divisão do ano" e envie de novo.`,
        });
      }
      const comPeriodo = achados.filter((x) => x.periodo != null && x.periodo >= 1 && x.periodo <= qtd);
      const semPeriodo = [...new Set(achados.filter((x) => !comPeriodo.includes(x)).map((x) => x.codigo))];
      if (!comPeriodo.length) {
        return res.status(422).json({
          message: `O documento não indica em qual ${tipo} está cada habilidade. O arquivo precisa ter títulos como "1º ${tipo}", "2º ${tipo}" antes das habilidades de cada período. Outra opção: use "Um arquivo com o plano de cada período" e envie um arquivo para cada ${tipo}.`,
          // sem nenhum periodo marcado: quase sempre e o arquivo de UM periodo enviado no lugar do ano inteiro
          modoErrado: {
            sugerido: "periodo",
            mensagem: `Este arquivo parece ser de um ${tipo} só (não tem "1º ${tipo}", "2º ${tipo}"…). Se você tem um arquivo para cada ${tipo}, escolha "Um arquivo com o plano de cada período".`,
          },
        });
      }
      const periodos = [];
      for (let n = 1; n <= qtd; n++) {
        const itens = await montarItens(comPeriodo.filter((x) => x.periodo === n), p.data.uf || null);
        if (itens.length) periodos.push({ numero: n, itens });
      }
      const capturados = new Set(periodos.flatMap((x) => x.itens.map((i) => i.codigo)));
      // Ano inteiro, mas o arquivo so tem UM periodo: provavelmente e o arquivo de um periodo
      const modoErrado =
        qtd > 1 && periodos.length === 1
          ? {
              sugerido: "periodo",
              mensagem: `Este arquivo parece ter só o ${periodos[0].numero}º ${tipo}. Se você tem um arquivo para cada ${tipo}, escolha "Um arquivo com o plano de cada período" e envie cada arquivo no seu ${tipo}.`,
            }
          : null;
      return res.json({
        modoErrado,
        metodo: "sem-ia",
        versaoLeitura: VERSAO_LEITURA,
        divisaoEncontrada: true,
        naoIdentificados: semPeriodo.length,
        semPeriodo,
        semTexto,
        recuperados: periodos.flatMap((x) => x.itens.filter((i) => i.conferir).map((i) => i.codigo)),
        ...conferir(capturados, semPeriodo),
        arquivos: nomes,
        periodos,
        total: periodos.reduce((s, x) => s + x.itens.length, 0),
      });
    }

    // Sem texto legivel ou sem codigos: a leitura do plano NAO usa I.A (economia).
    // O professor envia outro formato ou adiciona as habilidades manualmente.
    return res.status(422).json({
      message: semTexto.length
        ? `Não foi possível ler o texto de: ${semTexto.join(", ")} (foto ou PDF escaneado). Envie o plano em PDF com texto, Word ou Excel, ou adicione as habilidades manualmente em cada período.`
        : "Nenhum código de habilidade (ex.: EF04MA01) foi encontrado no documento. Confira o arquivo ou adicione as habilidades manualmente em cada período.",
    });
  } catch (e) {
    console.error("[planos-curso/extrair]", e);
    res.status(500).json({ message: e instanceof Error ? e.message : "Erro ao ler o plano" });
  }
}

const itemSchema = z.object({
  componente: z.string().min(1),
  codigo: z.string().nullish(),
  habilidade: z.string().nullish(),
  conteudo: z.string().nullish(),
  noBanco: z.boolean().optional(),
  recomposicao: z.boolean().optional(),
  conferir: z.boolean().optional(),
  origemTexto: z.enum(["oficial", "documento"]).nullish(),
  textoOficial: z.string().nullish(),
});

const salvarSchema = z.object({
  professor: z.string().nullish(),
  turma: z.string().nullish(),
  ano: z.string().min(1),
  uf: z.string().length(2).nullish().or(z.literal("")),
  anoLetivo: z.number().int().min(2000).max(2100),
  tipoPeriodo: tipoSchema,
  arquivos: z.array(z.string()).optional(),
  periodos: z
    .array(
      z.object({
        numero: z.number().int().min(1),
        // Datas opcionais ("" = nao cadastrada): sem elas o periodo da aula e escolhido na mao
        inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de início inválida").or(z.literal("")).default(""),
        fim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de fim inválida").or(z.literal("")).default(""),
        itens: z.array(itemSchema),
      })
    )
    .min(1),
});

// POST /api/planos-curso -> cria ou substitui o plano da turma/serie no ano letivo
export async function salvar(req: Request, res: Response) {
  const p = salvarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados invalidos" });
  const d = { ...p.data, uf: p.data.uf || null, turma: p.data.turma || null };

  for (const per of d.periodos) {
    if (per.inicio && per.fim && per.inicio > per.fim) return res.status(400).json({ message: `O ${per.numero}º periodo termina antes de comecar` });
  }

  const periodos = d.periodos.map((per) => ({
    ...per,
    itens: per.itens.map((i) => ({
      componente: i.componente,
      codigo: i.codigo || null,
      habilidade: i.habilidade || null,
      conteudo: i.conteudo || null,
      noBanco: !!i.noBanco,
      recomposicao: !!i.recomposicao,
      conferir: !!i.conferir,
      origemTexto: i.origemTexto ?? null,
      textoOficial: i.textoOficial ?? null,
    })),
  }));

  const plano = await PlanoCurso.findOneAndUpdate(
    { usuario: req.usuarioId, ano: d.ano, anoLetivo: d.anoLetivo, turma: d.turma },
    { ...d, periodos, usuario: req.usuarioId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const novos = await cadastrarCodigosNovos({ ano: d.ano, uf: d.uf, itens: periodos.flatMap((x) => x.itens) });
  res.json({ plano, codigosCadastrados: novos });
}

// GET /api/planos-curso?ano=4&anoLetivo=2026&turma=... -> plano salvo (ou null)
export async function obter(req: Request, res: Response) {
  const p = z
    .object({ ano: z.string().min(1), anoLetivo: z.coerce.number().int(), turma: z.string().optional() })
    .safeParse(req.query);
  if (!p.success) return res.status(400).json({ message: "Informe ano e anoLetivo" });
  const plano = await PlanoCurso.findOne({ usuario: req.usuarioId, ano: p.data.ano, anoLetivo: p.data.anoLetivo, turma: p.data.turma || null }).lean();
  res.json(plano);
}

// DELETE /api/planos-curso/:id
export async function remover(req: Request, res: Response) {
  await PlanoCurso.deleteOne({ _id: req.params.id, usuario: req.usuarioId });
  res.status(204).end();
}
