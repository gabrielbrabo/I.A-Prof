import { Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { Atividade } from "../models/Atividade";
import { Correcao } from "../models/Correcao";
import { Turma } from "../models/Turma";
import { aprenderDaSalva, aprenderDoAjuste, esquecerPreferencias, preferenciasDoProfessor } from "../services/perfilAtividade";
import { gabaritoDaFoto } from "../services/atividade";
import { calcularNota, corrigirComFoto, ErroAtividade, gerarAtividade, limparCabecalho, limparEstilo, limparQuestao, limparTexto, Questao, RespostaAluno } from "../services/atividade";
import { comMedicao, exigirAcesso, exigirConta, exigirPlanoPago, fecharLote, SemAcesso } from "../services/uso";
import { diario, ErroDiario } from "../services/diario";
import { tokenDo, tratarErro } from "./diarioController";
import { travaAtividade } from "../services/travaDiario";
import { foraDoPeriodo, pontosDoPeriodo } from "../services/pontosPeriodo";

// Ferramenta de atividades: gerar (I.A) -> editar gabarito/valores -> salvar -> corrigir (manual ou foto) -> aprovar -> lancar notas

const semAcesso = (res: Response, e: SemAcesso) => res.status(402).json({ message: e.message, semAcesso: true });
const objectId = /^[a-f0-9]{24}$/i;
const arred = (n: number) => Math.round(n * 100) / 100;

// ---------- Gerar ----------
const gerarSchema = z.object({
  ano: z.string().min(1),
  uf: z.string().length(2).nullish(),
  anoLetivo: z.number().int().min(2000).max(2100),
  periodo: z.number().int().min(1, "Selecione o período").max(4),
  componente: z.string().trim().min(1, "Escolha a matéria"),
  turma: z.string().nullish(),
  detalhes: z.string().trim().min(3, "Descreva a atividade").max(1500, "Descreva em até 1500 caracteres"),
  valorTotal: z.number().min(0.5).max(1000).default(10),
  // habilidades do plano de curso escolhidas pelo professor (codigos)
  habilidades: z.array(z.string().max(30)).max(10).default([]),
  // imagens do professor (miniaturas para a I.A saber o que e cada uma)
  imagens: z.array(z.object({ id: z.string().max(40), nome: z.string().max(80), dataUrl: z.string().max(400_000) })).max(20).default([]),
  respostas: z.string().max(3000).nullish(), // respostas as perguntas da I.A
  atual: z.record(z.unknown()).nullish(), // atividade ja gerada (ajuste)
  ajuste: z.string().max(1500).nullish(), // o que mudar
  escola: z.string().max(150).nullish(), // cabecalho
  professor: z.string().max(150).nullish(),
  // turma/materia do D.E.V (com notas): o valor tem que caber nos pontos do periodo
  diarioTurmaId: z.string().regex(objectId).nullish(),
  diarioMateriaId: z.string().regex(objectId).nullish(),
  atividadeId: z.string().regex(objectId).nullish(), // atividade salva sendo refeita (nao conta duas vezes)
});

// POST /api/atividades/gerar -> atividade + gabarito (nao salva)
export async function gerar(req: Request, res: Response) {
  const p = gerarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  try {
    // ajuste tambem gasta I.A: no teste gratis conta como uma atividade (e usa o limite de I.A)
    const ehAjuste = !!(p.data.atual && p.data.ajuste?.trim());
    // D.E.V: so gera se o valor couber nos pontos que restam no periodo (antes de gastar I.A)
    if (!ehAjuste && p.data.diarioTurmaId && p.data.diarioMateriaId) {
      const pts = await pontosDoPeriodo(req.usuarioId!, { turma: p.data.diarioTurmaId, periodo: p.data.periodo, materia: p.data.diarioMateriaId, excluirId: p.data.atividadeId });
      if ("erro" in pts) return res.status(409).json({ message: pts.erro, reconectar: pts.reconectar });
      const fora = foraDoPeriodo(pts, p.data.valorTotal, p.data.periodo);
      if (fora) return res.status(422).json({ message: fora, semPontos: true, pontos: pts });
    }
    await exigirAcesso(req.usuarioId!, ehAjuste ? { continuarLote: "atividade", abrirLote: "atividade", recurso: "atividade" } : { abrirLote: "atividade", recurso: "atividade" });
    // o que a I.A ja aprendeu do jeito do professor (atividades salvas e ajustes pedidos)
    const prefs = await preferenciasDoProfessor(req.usuarioId!);
    const r = await comMedicao(req.usuarioId!, () => gerarAtividade({ ...p.data, usuario: req.usuarioId!, preferencias: prefs.texto }), { atividade: !ehAjuste, ajuste: ehAjuste });
    if (ehAjuste && r.status === "pronta") void aprenderDoAjuste(req.usuarioId!, p.data.ajuste!);
    res.json(r);
  } catch (e) {
    if (e instanceof SemAcesso) return semAcesso(res, e);
    if (e instanceof ErroAtividade) return res.status(422).json({ message: e.message });
    console.error("[atividades/gerar]", e);
    res.status(500).json({ message: e instanceof Error ? e.message : "Erro ao gerar a atividade" });
  }
}

// ---------- Salvar / listar ----------
const questaoSchema = z.object({
  _id: z.string().regex(objectId).nullish(),
  tipo: z.enum(["multipla", "vf", "discursiva", "completar"]),
  enunciado: z.string().max(3000),
  alternativas: z.array(z.string().max(500)).max(6).default([]),
  itens: z.array(z.object({ texto: z.string().max(500), resposta: z.enum(["V", "F"]) })).max(10).default([]),
  resposta: z.string().max(3000).default(""),
  criterios: z.string().max(2000).default(""),
  valor: z.number().min(0).max(1000),
  imagem: z.string().max(40).default(""),
  linhas: z.number().int().min(0).max(15).default(0),
  figura: z.object({ tipo: z.enum(["", "emoji", "svg"]), conteudo: z.string().max(8000) }).default({ tipo: "", conteudo: "" }),
});
const salvarSchema = z.object({
  ano: z.string().min(1),
  uf: z.string().length(2).nullish(),
  anoLetivo: z.number().int(),
  periodo: z.number().int().min(1).max(4),
  componente: z.string().trim().min(1),
  turma: z.string().max(80).nullish(),
  turmaId: z.string().regex(objectId).nullish(),
  diarioTurmaId: z.string().regex(objectId).nullish(),
  diarioMateriaId: z.string().regex(objectId).nullish(),
  tipoDev: z.enum(["Normal", "Prova", "Trabalho", "Outra Atividade"]).default("Normal"),
  detalhes: z.string().max(1500).default(""),
  origem: z.enum(["ia", "externa"]).default("ia"),
  titulo: z.string().trim().min(1, "Dê um título").max(200),
  instrucoes: z.string().max(1000).default(""),
  questoes: z.array(questaoSchema).min(1, "A atividade precisa de pelo menos uma questão").max(30),
  habilidades: z.array(z.object({ codigo: z.string(), habilidade: z.string() })).max(10).default([]),
  valorTotal: z.number().min(0.5).max(1000),
  imagens: z.array(z.object({ id: z.string().max(40), nome: z.string().max(80), dataUrl: z.string().max(1_500_000) })).max(20).default([]),
  cabecalho: z.object({ escola: z.string().max(150), logo: z.string().max(40), campos: z.array(z.string()).max(8) }).nullish(),
  estilo: z
    .object({
      fonte: z.enum(["normal", "grande", "extra"]),
      colorido: z.boolean(),
      caixaAlta: z.boolean().default(false),
      layout: z.enum(["compacto", "normal", "amplo"]).default("normal"),
      imagem: z.enum(["pequena", "media", "grande"]).default("media"),
      colunas: z.boolean().default(false),
    })
    .nullish(),
  texto: z.object({ titulo: z.string().max(200), conteudo: z.string().max(8000), imagem: z.string().max(40), posicao: z.enum(["topo", "direita", "esquerda"]).default("topo") }).nullish(),
});

// Imagens validas (so data URL de imagem) e cabecalho/estilo limpos
function dadosVisuais(d: z.infer<typeof salvarSchema>) {
  const imagens = d.imagens.filter((i) => /^data:image\/(png|jpeg|webp|gif);base64,/.test(i.dataUrl));
  const ids = imagens.map((i) => i.id);
  return { imagens, cabecalho: limparCabecalho(d.cabecalho, ids), estilo: limparEstilo(d.estilo), texto: limparTexto(d.texto, ids) };
}

function dadosQuestoes(qs: z.infer<typeof questaoSchema>[]) {
  return qs.map((q) => {
    const limpa = limparQuestao(q as Partial<Questao>);
    return q._id ? { ...limpa, _id: q._id } : limpa;
  });
}

// Mudou o gabarito/valores: recalcula as notas das correcoes ja feitas
async function recalcularNotas(atividadeId: unknown, questoes: Questao[]) {
  const cs = await Correcao.find({ atividade: atividadeId });
  for (const c of cs) {
    const r = calcularNota(questoes, c.respostas as unknown as RespostaAluno[]);
    c.set("respostas", r.respostas);
    c.nota = r.nota;
    await c.save();
  }
}

// POST /api/atividades
export async function salvar(req: Request, res: Response) {
  const p = salvarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  try {
    await exigirConta(req.usuarioId!);
  } catch (e) {
    if (e instanceof SemAcesso) return semAcesso(res, e);
    throw e;
  }
  // D.E.V: o valor tem que caber nos pontos que restam no periodo (atividade de fora nao passou pela geracao)
  if (p.data.diarioTurmaId && p.data.diarioMateriaId) {
    try {
      const pts = await pontosDoPeriodo(req.usuarioId!, { turma: p.data.diarioTurmaId, periodo: p.data.periodo, materia: p.data.diarioMateriaId });
      if (!("erro" in pts)) {
        const fora = foraDoPeriodo(pts, p.data.valorTotal, p.data.periodo);
        if (fora) return res.status(422).json({ message: fora, semPontos: true, pontos: pts });
      }
    } catch {
      /* D.E.V fora do ar: salva (o lancamento confere de novo) */
    }
  }
  const a = await Atividade.create({ ...p.data, ...dadosVisuais(p.data), usuario: req.usuarioId, questoes: dadosQuestoes(p.data.questoes) });
  void aprenderDaSalva(req.usuarioId!, { estilo: a.estilo, cabecalho: a.cabecalho, questoes: a.questoes } as never);
  res.status(201).json(a);
}

// GET /api/atividades/preferencias -> o que a I.A ja aprendeu do professor
export async function preferencias(req: Request, res: Response) {
  res.json(await preferenciasDoProfessor(req.usuarioId!));
}

// DELETE /api/atividades/preferencias -> esquecer (comeca do zero)
export async function esquecer(req: Request, res: Response) {
  await esquecerPreferencias(req.usuarioId!);
  res.json({ ok: true });
}

// PUT /api/atividades/:id
export async function atualizar(req: Request, res: Response) {
  const p = salvarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const a = await Atividade.findOne({ _id: req.params.id, usuario: req.usuarioId });
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  // notas ja no D.E.V e periodo fechado la: nao altera (gabarito/valores mudariam as notas so aqui)
  const trava = await travaAtividade(req.usuarioId!, a as never);
  if (trava) return res.status(trava.status).json({ message: trava.message, periodoFechado: trava.status === 423 });
  // trocar de turma depois de corrigir apagaria a ligacao com os alunos: so sem correcoes
  const mudouTurma = String(a.turmaId ?? "") !== String(p.data.turmaId ?? "") || String(a.diarioTurmaId ?? "") !== String(p.data.diarioTurmaId ?? "");
  if (mudouTurma && (await Correcao.exists({ atividade: a._id }))) {
    return res.status(409).json({ message: "Esta atividade já tem correções. Para usar em outra turma, salve como uma nova atividade." });
  }
  if (a.diario?.atividadeId && (a.periodo !== p.data.periodo || String(a.diarioMateriaId ?? "") !== String(p.data.diarioMateriaId ?? ""))) {
    return res.status(409).json({ message: "A atividade já foi lançada no D.E.V: não dá para mudar o período ou a matéria." });
  }
  a.set({ ...p.data, ...dadosVisuais(p.data), questoes: dadosQuestoes(p.data.questoes) });
  await a.save();
  await recalcularNotas(a._id, a.questoes as unknown as Questao[]);
  res.json(a);
}

// GET /api/atividades -> lista com o andamento da correcao
export async function listar(req: Request, res: Response) {
  // lista leve: sem as imagens do professor (a atividade completa vem em GET /atividades/:id)
  const as = await Atividade.find({ usuario: req.usuarioId }).select("-imagens").sort({ createdAt: -1 }).limit(200).lean();
  const contagem = await Correcao.aggregate([
    { $match: { atividade: { $in: as.map((a) => a._id) } } },
    { $group: { _id: "$atividade", corrigidas: { $sum: 1 }, aprovadas: { $sum: { $cond: [{ $eq: ["$status", "aprovada"] }, 1, 0] } } } },
  ]);
  const porId = new Map(contagem.map((c) => [String(c._id), c]));
  res.json(
    as.map((a) => ({
      ...a,
      corrigidas: porId.get(String(a._id))?.corrigidas ?? 0,
      aprovadas: porId.get(String(a._id))?.aprovadas ?? 0,
    }))
  );
}

// GET /api/atividades/:id
export async function obter(req: Request, res: Response) {
  const a = await Atividade.findOne({ _id: req.params.id, usuario: req.usuarioId }).lean();
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  res.json(a);
}

// DELETE /api/atividades/:id (as notas ja lancadas no D.E.V continuam la)
export async function remover(req: Request, res: Response) {
  const a = await Atividade.findOneAndDelete({ _id: req.params.id, usuario: req.usuarioId });
  if (a) await Correcao.deleteMany({ atividade: a._id });
  res.status(204).end();
}

// ---------- Alunos e correcoes ----------
async function atividadeDo(req: Request) {
  if (!objectId.test(req.params.id)) return null;
  return Atividade.findOne({ _id: req.params.id, usuario: req.usuarioId });
}

// Alunos da turma da atividade: D.E.V (turma vinculada) ou turma do I.A Prof
async function alunosDa(usuarioId: string, a: { diarioTurmaId?: string | null; turmaId?: unknown }) {
  if (a.diarioTurmaId) {
    const token = await tokenDo(usuarioId);
    if (!token) throw new ErroDiario("Conecte sua conta do D.E.V para ver os alunos desta turma.", 409, { reconectar: true });
    const r = await diario.alunos(token, a.diarioTurmaId);
    return { fonte: "dev" as const, alunos: r.alunos, dev: { materias: r.materias, periodos: r.periodos, papel: r.papel, notas: r.notas !== false } };
  }
  if (a.turmaId) {
    const t = await Turma.findOne({ _id: a.turmaId, usuario: usuarioId }).lean();
    if (t) return { fonte: "turma" as const, alunos: t.alunos.map((x) => ({ id: String(x._id), nome: x.nome })), dev: null };
  }
  return { fonte: "nenhuma" as const, alunos: [] as Array<{ id: string; nome: string }>, dev: null };
}

// GET /api/atividades/:id/alunos -> alunos + correcoes ja feitas
export async function alunos(req: Request, res: Response) {
  const a = await atividadeDo(req);
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  try {
    const r = await alunosDa(req.usuarioId!, a);
    const correcoes = await Correcao.find({ atividade: a._id }).lean();
    res.json({ ...r, correcoes });
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}

const correcaoSchema = z.object({
  alunoNome: z.string().trim().min(1).max(150),
  metodo: z.enum(["manual", "ia"]).default("manual"),
  aprovar: z.boolean().default(false),
  respostas: z
    .array(
      z.object({
        questao: z.string(),
        resposta: z.string().max(3000).default(""),
        itens: z.array(z.string().max(1)).max(10).default([]),
        pontos: z.number().min(0).max(1000).default(0),
        comentario: z.string().max(300).default(""),
        duvida: z.boolean().default(false),
      })
    )
    .max(30),
});

// PUT /api/atividades/:id/correcoes/:alunoId -> correcao manual (ou revisao da correcao da I.A) e aprovacao
// Sem I.A: funciona mesmo com o limite de uso esgotado.
export async function salvarCorrecao(req: Request, res: Response) {
  const p = correcaoSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  try {
    await exigirConta(req.usuarioId!); // correcao a mao: sem I.A, liberada tambem no teste gratis
  } catch (e) {
    if (e instanceof SemAcesso) return semAcesso(res, e);
    throw e;
  }
  const a = await atividadeDo(req);
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  const trava = await travaAtividade(req.usuarioId!, a as never);
  if (trava) return res.status(trava.status).json({ message: trava.message, periodoFechado: trava.status === 423 });
  const alunoId = String(req.params.alunoId).slice(0, 64);
  const atual = await Correcao.findOne({ atividade: a._id, alunoId }).lean();
  const r = calcularNota(a.questoes as unknown as Questao[], p.data.respostas as RespostaAluno[]);
  const c = await Correcao.findOneAndUpdate(
    { atividade: a._id, alunoId },
    {
      usuario: req.usuarioId,
      atividade: a._id,
      alunoId,
      alunoNome: p.data.alunoNome,
      metodo: atual?.metodo === "ia" ? "ia" : p.data.metodo,
      respostas: r.respostas,
      nota: r.nota,
      status: p.data.aprovar ? "aprovada" : "corrigida",
      aprovadaEm: p.data.aprovar ? new Date() : null,
    },
    { upsert: true, new: true }
  );
  res.json(c);
}

// DELETE /api/atividades/:id/correcoes/:alunoId
export async function removerCorrecao(req: Request, res: Response) {
  const a = await atividadeDo(req);
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  const trava = await travaAtividade(req.usuarioId!, a as never);
  if (trava) return res.status(trava.status).json({ message: trava.message, periodoFechado: trava.status === 423 });
  await Correcao.deleteOne({ atividade: a._id, alunoId: req.params.alunoId });
  res.status(204).end();
}

// Fotos da folha do aluno (ate 4 paginas). O app ja reduz a foto antes de enviar.
export const uploadFotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Envie fotos (JPG, PNG ou WEBP)."));
  },
}).array("fotos", 4);

// POST /api/atividades/:id/correcoes/:alunoId/foto (multipart: fotos[], alunoNome) -> I.A corrige pelo gabarito
// A correcao de uma atividade e uma "tarefa": se o limite acabar no meio da turma, os alunos desta atividade
// ainda podem ser corrigidos; corrigir OUTRA atividade com I.A fica bloqueado (a manual continua liberada).
export async function corrigirFoto(req: Request, res: Response) {
  const fotos = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!fotos.length) return res.status(400).json({ message: "Envie a foto da atividade do aluno." });
  const alunoNome = String(req.body?.alunoNome || "").trim().slice(0, 150);
  if (!alunoNome) return res.status(400).json({ message: "Aluno não informado." });
  const a = await atividadeDo(req);
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  const trava = await travaAtividade(req.usuarioId!, a as never);
  if (trava) return res.status(trava.status).json({ message: trava.message, periodoFechado: trava.status === 423 });
  const chave = `correcao:${a._id}`;
  try {
    await exigirPlanoPago(req.usuarioId!);
    await exigirAcesso(req.usuarioId!, { abrirLote: chave, continuarLote: chave });
    const r = await comMedicao(
      req.usuarioId!,
      () =>
        corrigirComFoto({
          serie: a.ano,
          componente: a.componente,
          questoes: a.questoes as unknown as Questao[],
          fotos: fotos.map((f) => ({ dados: f.buffer, tipo: f.mimetype })),
          texto: a.texto as { titulo?: string; conteudo?: string } | null,
        }),
      { correcao: true }
    );
    const nota = calcularNota(a.questoes as unknown as Questao[], r.respostas);
    const alunoId = String(req.params.alunoId).slice(0, 64);
    const c = await Correcao.findOneAndUpdate(
      { atividade: a._id, alunoId },
      {
        usuario: req.usuarioId,
        atividade: a._id,
        alunoId,
        alunoNome,
        metodo: "ia",
        respostas: nota.respostas,
        nota: nota.nota,
        nomeLido: r.nomeLido,
        status: "corrigida",
        aprovadaEm: null,
      },
      { upsert: true, new: true }
    );
    res.json(c);
  } catch (e) {
    if (e instanceof SemAcesso) return semAcesso(res, e);
    console.error("[atividades/foto]", e);
    res.status(500).json({ message: e instanceof Error ? `Não foi possível corrigir pela foto: ${e.message}` : "Erro ao corrigir pela foto" });
  }
}

// GET /api/atividades/pontos-periodo?turma&periodo&materia&excluir -> pontos do periodo no D.E.V (+ salvas aqui)
export async function pontosPeriodo(req: Request, res: Response) {
  const turma = String(req.query.turma ?? "");
  const materia = String(req.query.materia ?? "");
  const periodo = Number(req.query.periodo);
  const excluir = String(req.query.excluir ?? "");
  if (!/^[a-f0-9]{24}$/i.test(turma) || !/^[a-f0-9]{24}$/i.test(materia) || !(periodo >= 1 && periodo <= 4)) return res.status(400).json({ message: "Dados inválidos" });
  try {
    const r = await pontosDoPeriodo(req.usuarioId!, { turma, periodo, materia, excluirId: /^[a-f0-9]{24}$/i.test(excluir) ? excluir : null });
    if ("erro" in r) return res.status(409).json({ message: r.erro, reconectar: r.reconectar });
    res.json(r);
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}

// POST /api/atividades/gabarito-foto (multipart: fotos[], ano, componente, valorTotal)
// Atividade feita fora do I.A Prof: a I.A le a folha e monta o gabarito para corrigir (Profissional e Premium)
export async function gabaritoFoto(req: Request, res: Response) {
  const fotos = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!fotos.length) return res.status(400).json({ message: "Envie a foto da atividade." });
  const ano = String(req.body?.ano || "").slice(0, 10);
  const componente = String(req.body?.componente || "").slice(0, 80);
  const valorTotal = Math.min(1000, Math.max(0.5, Number(req.body?.valorTotal) || 10));
  if (!ano || !componente) return res.status(400).json({ message: "Escolha a série e a matéria." });
  try {
    await exigirPlanoPago(req.usuarioId!);
    await exigirAcesso(req.usuarioId!);
    const r = await comMedicao(req.usuarioId!, () =>
      gabaritoDaFoto({ serie: ano, componente, valorTotal, fotos: fotos.map((f) => ({ dados: f.buffer, tipo: f.mimetype })) })
    );
    res.json(r);
  } catch (e) {
    if (e instanceof SemAcesso) return semAcesso(res, e);
    if (e instanceof ErroAtividade) return res.status(422).json({ message: e.message });
    console.error("[atividades/gabarito-foto]", e);
    res.status(500).json({ message: e instanceof Error ? `Não foi possível ler a foto: ${e.message}` : "Erro ao ler a foto" });
  }
}

// ---------- Lancar notas ----------
// GET /api/atividades/:id/pontos -> pontos restantes no bimestre/materia do D.E.V
export async function pontosDev(req: Request, res: Response) {
  const a = await atividadeDo(req);
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  if (!a.diarioTurmaId || !a.diarioMateriaId) return res.json(null);
  const token = await tokenDo(req.usuarioId!);
  if (!token) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });
  try {
    res.json(
      await diario.pontos(token, { id_turma: a.diarioTurmaId, bimestre: `${a.periodo}º BIMESTRE`, id_matter: a.diarioMateriaId, excluir: a.diario?.atividadeId ?? null })
    );
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}

// POST /api/atividades/:id/lancar -> notas APROVADAS vao para o D.E.V (turma do D.E.V) ou ficam na lista do I.A Prof
export async function lancar(req: Request, res: Response) {
  try {
    await exigirConta(req.usuarioId!); // lancar notas nao usa I.A
  } catch (e) {
    if (e instanceof SemAcesso) return semAcesso(res, e);
    throw e;
  }
  const a = await atividadeDo(req);
  if (!a) return res.status(404).json({ message: "Atividade não encontrada." });
  const aprovadas = await Correcao.find({ atividade: a._id, status: "aprovada" });
  if (!aprovadas.length) return res.status(400).json({ message: "Aprove a correção de pelo menos um aluno antes de lançar as notas." });

  // fecha a "tarefa" de correcao desta atividade
  await fecharLote(req.usuarioId!, `correcao:${a._id}`);

  if (!a.diarioTurmaId) {
    return res.json({ destino: "iaprof", lancadas: aprovadas.length });
  }
  const tokenDev = await tokenDo(req.usuarioId!);
  if (!tokenDev) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });
  // Educacao Infantil (escola com conceitos): usa a lista de alunos do D.E.V, mas as notas ficam so no I.A Prof
  try {
    const info = await diario.alunos(tokenDev, a.diarioTurmaId);
    if (info.notas === false) return res.json({ destino: "iaprof", lancadas: aprovadas.length, infantil: true });
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
  if (!a.diarioMateriaId) return res.status(400).json({ message: "Escolha a matéria do D.E.V nesta atividade (Editar) antes de lançar." });
  const token = await tokenDo(req.usuarioId!);
  if (!token) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });
  const valor = arred((a.questoes as unknown as Questao[]).reduce((s, q) => s + (Number(q.valor) || 0), 0));
  try {
    const r = await diario.registrarAtividade(token, {
      id_turma: a.diarioTurmaId,
      bimestre: `${a.periodo}º BIMESTRE`,
      id_matter: a.diarioMateriaId,
      descricao: a.titulo,
      tipo: a.tipoDev,
      valor,
      idAtividade: a.diario?.atividadeId ?? null,
      notas: aprovadas.map((c) => ({ id_student: c.alunoId, nota: Math.min(valor, c.nota) })),
    });
    a.set("diario", { atividadeId: r.idAtividade, enviadoEm: new Date() });
    await a.save();
    await Correcao.updateMany({ _id: { $in: aprovadas.map((c) => c._id) } }, { $set: { enviadaDiarioEm: new Date() } });
    res.json({ destino: "dev", lancadas: aprovadas.length, criadas: r.criadas, atualizadas: r.atualizadas });
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}
