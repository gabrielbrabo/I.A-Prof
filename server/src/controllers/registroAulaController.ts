import { Request, Response } from "express";
import { z } from "zod";
import { RegistroAula } from "../models/RegistroAula";
import { codigosForaDoPeriodo, ErroRegistro, formatarNoEstilo, gerarRegistroAula } from "../services/registroAula";
import { formatarComLimite } from "../utils/formatarRegistro";
import { limites } from "../config/limites";
import { comMedicao, exigirAcesso, SemAcesso } from "../services/uso";
import { diario } from "../services/diario";
import { tokenDo } from "./diarioController";
import { travaAula } from "../services/travaDiario";

// Limite de saida: o professor pode informar o limite do campo do diario; senao vale o do .env
const limiteSaidaSchema = z.number().int().min(0).max(100000).nullish();

const gerarSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(3, "Descreva a aula")
    .max(limites.entrada, `O texto pode ter no maximo ${limites.entrada} caracteres`),
  ano: z.string().min(1),
  uf: z.string().length(2).nullish(),
  turma: z.string().nullish(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  anoLetivo: z.number().int().min(2000).max(2100),
  periodo: z.number().int().min(1, "Selecione o período da aula").max(4),
  limiteSaida: limiteSaidaSchema,
});

// GET /api/config -> limites para a tela
export async function config(_req: Request, res: Response) {
  res.json({ limiteEntrada: limites.entrada, limiteRegistro: limites.registro });
}

// POST /api/registro-aula/gerar -> IA monta os itens com codigos (nao salva)
export async function gerar(req: Request, res: Response) {
  const p = gerarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados invalidos" });
  try {
    await exigirAcesso(req.usuarioId!, { abrirLote: "aula", recurso: "aula" }); // teste gratis / assinatura / limite do mes
    const r = await comMedicao(
      req.usuarioId!,
      () => gerarRegistroAula({ ...p.data, usuario: req.usuarioId!, limiteSaida: p.data.limiteSaida ?? limites.registro }),
      { aula: true }
    );
    res.json(r);
  } catch (e) {
    if (e instanceof SemAcesso) return res.status(402).json({ message: e.message, semAcesso: true });
    if (e instanceof ErroRegistro) return res.status(422).json({ message: e.message });
    console.error("[registro-aula/gerar]", e);
    res.status(500).json({ message: e instanceof Error ? e.message : "Erro ao gerar registro" });
  }
}

const salvarSchema = z.object({
  professor: z.string().nullish(),
  turma: z.string().nullish(),
  diarioTurmaId: z.string().regex(/^[a-f0-9]{24}$/i).nullish(), // turma escolhida do Diario escolar
  ano: z.string().min(1),
  uf: z.string().length(2).nullish(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entrada: z.string().min(1).max(limites.entrada),
  anoLetivo: z.number().int().nullish(),
  periodo: z.number().int().nullish(),
  limiteSaida: limiteSaidaSchema,
  textoManual: z.string().max(20000).nullish(), // texto final editado a mao pelo professor (substitui o montado)
  // Ja existe aula no mesmo dia (mesma serie/turma): o que fazer. Sem isso, o servidor responde 409 para o professor decidir.
  duplicado: z.enum(["substituir", "juntar", "nova"]).nullish(),
  abertura: z.array(z.string().max(300)).max(10).default([]), // momentos sem componente (Acolhida, Rotina diaria...)
  itens: z
    .array(
      z.object({
        componente: z.string().min(1),
        conteudo: z.string().min(1),
        habilidades: z.array(z.object({ codigo: z.string().min(1), habilidade: z.string().nullish() })).max(5, "No máximo 5 habilidades por componente").default([]),
        conferir: z.boolean().optional(), // palpite ainda nao conferido
      })
    )
    .default([]),
});

// O registro so pode ter habilidades do plano de curso do periodo da aula. Devolve a mensagem de erro (ou null).
async function validarHabilidades(d: z.infer<typeof salvarSchema> & { usuario: string }): Promise<string | null> {
  if (!d.anoLetivo || !d.periodo) return "Selecione o período da aula.";
  const codigos = d.itens.flatMap((i) => i.habilidades.map((h) => h.codigo));
  try {
    const { fora, tipoPeriodo } = await codigosForaDoPeriodo({ usuario: d.usuario, ano: d.ano, anoLetivo: d.anoLetivo, periodo: d.periodo, turma: d.turma, uf: d.uf, codigos });
    if (fora.length) {
      return `${fora.join(", ")} não ${fora.length > 1 ? "estão" : "está"} no plano de curso de ${d.anoLetivo} (nenhum ${tipoPeriodo}). Troque ou remova antes de salvar.`;
    }
    return null;
  } catch (e) {
    if (e instanceof ErroRegistro) return e.message;
    throw e;
  }
}

// POST /api/registro-aula -> salva o registro revisado pelo professor
export async function salvar(req: Request, res: Response) {
  const p = salvarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados invalidos" });
  const { limiteSaida, textoManual, duplicado, ...dados } = p.data;
  const limite = limiteSaida ?? limites.registro;

  // Aula ja salva no mesmo dia, mesma serie e turma
  const existente = await RegistroAula.findOne({ usuario: req.usuarioId, ano: dados.ano, data: dados.data, turma: dados.turma ?? null }).sort({ createdAt: -1 }).lean();
  if (existente && !duplicado) {
    return res.status(409).json({
      conflito: true,
      message: "Já existe uma aula salva nesse dia.",
      existente: { _id: existente._id, data: existente.data, textoFinal: existente.textoFinal, periodo: existente.periodo },
    });
  }

  // Juntar: itens da aula salva + os novos (sem repetir o mesmo componente/conteudo)
  let itens = dados.itens;
  let abertura = dados.abertura;
  let manual = textoManual?.trim() || null;
  if (existente && duplicado === "juntar") {
    const antigos = (existente.itens ?? []) as typeof dados.itens;
    const chave = (i: { componente: string; conteudo: string }) => `${i.componente}|${i.conteudo}`.toLowerCase().trim();
    itens = [...antigos, ...dados.itens.filter((n) => !antigos.some((a) => chave(a) === chave(n)))];
    const aberturaAntiga = ((existente as { abertura?: string[] }).abertura ?? []) as string[];
    abertura = [...aberturaAntiga, ...dados.abertura.filter((a) => !aberturaAntiga.includes(a))];
    // Se alguma das duas tinha texto editado a mao, junta os textos (o editado nao pode ser refeito pelos cards)
    if (manual || existente.textoEditado) {
      const novoTexto = manual ?? formatarComLimite(dados.itens, null, dados.abertura).texto;
      manual = `${existente.textoFinal.trim()}/ -${novoTexto}`;
    }
  }
  const corpo = { ...dados, itens, abertura, usuario: req.usuarioId! };
  if (!itens.length && !abertura.length) return res.status(400).json({ message: "A aula está vazia." });

  const invalido = await validarHabilidades(corpo);
  if (invalido) return res.status(400).json({ message: invalido });
  const fmt = manual ? { texto: manual, excede: !!limite && manual.length > limite } : formatarComLimite(itens, limite, abertura);
  if (fmt.excede) {
    return res.status(400).json({
      message:
        duplicado === "juntar"
          ? `Juntando as duas aulas o texto passa do limite de ${limite} caracteres. Encurte o texto ou escolha substituir/salvar como outra aula.`
          : `O registro passou do limite de ${limite} caracteres. Encurte o texto.`,
    });
  }

  if (existente && (duplicado === "substituir" || duplicado === "juntar")) {
    // aula que ja esta no D.E.V com o periodo fechado la: nao altera
    const trava = await travaAula(req.usuarioId!, existente);
    if (trava) return res.status(trava.status).json({ message: trava.message, periodoFechado: trava.status === 423 });
    // texto mudou: precisa enviar de novo ao Diario
    const doc = await RegistroAula.findByIdAndUpdate(existente._id, { ...corpo, textoFinal: fmt.texto, textoEditado: !!manual, diarioEnviadoEm: null }, { new: true });
    return res.json(doc);
  }
  const doc = await RegistroAula.create({ ...corpo, textoFinal: fmt.texto, textoEditado: !!manual });
  res.status(201).json(doc);
}

// PUT /api/registro-aula/:id -> salva as alteracoes de um registro aberto pelo historico
export async function atualizar(req: Request, res: Response) {
  const p = salvarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados invalidos" });
  const invalido = await validarHabilidades({ ...p.data, usuario: req.usuarioId! });
  if (invalido) return res.status(400).json({ message: invalido });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { limiteSaida, textoManual, duplicado: _d, ...dados } = p.data;
  const limite = limiteSaida ?? limites.registro;
  const manual = textoManual?.trim() || null;
  const fmt = manual ? { texto: manual, excede: !!limite && manual.length > limite } : formatarComLimite(dados.itens, limite, dados.abertura);
  if (fmt.excede) {
    return res.status(400).json({ message: `O registro passou do limite de ${limite} caracteres. Encurte o texto.` });
  }
  const antes = await RegistroAula.findOne({ _id: req.params.id, usuario: req.usuarioId }).lean();
  if (!antes) return res.status(404).json({ message: "Registro nao encontrado" });
  // aula que ja esta no D.E.V com o periodo fechado la: nao altera (o diario oficial ficaria diferente)
  const trava = await travaAula(req.usuarioId!, antes);
  if (trava) return res.status(trava.status).json({ message: trava.message, periodoFechado: trava.status === 423 });
  // texto, data ou turma mudaram: o que esta no Diario ficou desatualizado (precisa enviar de novo)
  const mudouDiario = antes.textoFinal !== fmt.texto || antes.data !== dados.data || (antes.diarioTurmaId ?? null) !== (dados.diarioTurmaId ?? null);
  const doc = await RegistroAula.findOneAndUpdate(
    { _id: req.params.id, usuario: req.usuarioId },
    { ...dados, textoFinal: fmt.texto, textoEditado: !!manual, ...(mudouDiario ? { diarioEnviadoEm: null } : {}) },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Registro nao encontrado" });
  res.json(doc);
}

// POST /api/registro-aula/formatar -> reescreve o texto final no formato das aulas do professor (usa I.A)
const formatarSchema = z.object({
  ano: z.string().min(1),
  turma: z.string().nullish(),
  abertura: z.array(z.string()).max(10).default([]),
  limiteSaida: limiteSaidaSchema,
  itens: z.array(
    z.object({
      componente: z.string(),
      conteudo: z.string(),
      habilidades: z.array(z.object({ codigo: z.string(), habilidade: z.string().nullish() })).max(5),
    })
  ),
});
export async function formatar(req: Request, res: Response) {
  const p = formatarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Dados invalidos" });
  try {
    // formatar faz parte da aula que acabou de ser gerada: termina mesmo se o limite acabou na geracao
    await exigirAcesso(req.usuarioId!, { continuarLote: "aula" });
    const texto = await comMedicao(req.usuarioId!, () =>
      formatarNoEstilo({ ...p.data, usuario: req.usuarioId!, limite: p.data.limiteSaida ?? limites.registro })
    );
    if (!texto) {
      return res.status(422).json({
        message: "Ainda não há aulas suas com texto editado para aprender o formato (ou não deu para manter os códigos). Edite e salve uma aula no seu formato.",
      });
    }
    res.json({ texto });
  } catch (e) {
    if (e instanceof SemAcesso) return res.status(402).json({ message: e.message, semAcesso: true });
    console.error("[registro-aula/formatar]", e);
    res.status(500).json({ message: "Erro ao formatar o texto" });
  }
}

// GET /api/registro-aula?turma=... -> ultimos registros
export async function listar(req: Request, res: Response) {
  const filtro: Record<string, unknown> = { usuario: req.usuarioId };
  if (typeof req.query.turma === "string" && req.query.turma) filtro.turma = req.query.turma;
  const lista = await RegistroAula.find(filtro).sort({ data: -1, createdAt: -1 }).limit(50).lean();
  res.json(lista);
}

// DELETE /api/registro-aula/:id
// Aula ja enviada ao D.E.V: so pode ser excluida aqui depois de excluida no D.E.V (evita diario e I.A Prof diferentes)
export async function remover(req: Request, res: Response) {
  const r = await RegistroAula.findOne({ _id: req.params.id, usuario: req.usuarioId }).lean();
  if (!r) return res.status(204).end();
  if (r.diarioEnviadoEm && r.diarioTurmaId) {
    const token = await tokenDo(req.usuarioId!);
    if (!token) {
      return res.status(409).json({ message: "Esta aula foi enviada ao D.E.V. Conecte sua conta do D.E.V para conferir se ela já foi excluída lá.", noDiario: true });
    }
    try {
      const v = await diario.verificarAula(token, r.diarioTurmaId, r.data);
      if (!v.podeRegistrar) {
        return res.status(409).json({ message: `Não deu para conferir no D.E.V (${v.motivo ?? "data indisponível"}). Exclua a aula no D.E.V e tente de novo.`, noDiario: true });
      }
      if (v.existe && (!r.diarioRegistroId || v.id === r.diarioRegistroId)) {
        return res.status(409).json({ message: "Esta aula está no D.E.V. Exclua primeiro no D.E.V; depois ela pode ser excluída aqui.", noDiario: true });
      }
    } catch {
      return res.status(503).json({ message: "Não deu para falar com o D.E.V agora para conferir. Tente de novo em instantes." });
    }
  }
  await RegistroAula.deleteOne({ _id: r._id });
  res.status(204).end();
}
