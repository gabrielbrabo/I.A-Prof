import { createHash } from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { Usuario } from "../models/Usuario";
import { RegistroAula } from "../models/RegistroAula";
import { diario, ErroDiario } from "../services/diario";
import { diarioLigado } from "../config/env";

// Integracao com o Diario escolar: conectar a conta, listar turmas e enviar a aula salva.

// CPF do D.E.V guardado so como hash (identifica o professor sem guardar o CPF)
const SAL_CPF = process.env.DIARIO_CPF_SAL || "iaprof-dev-cpf-v1";
export const hashCpf = (cpf: string) => createHash("sha256").update(`${SAL_CPF}:${cpf.replace(/\D/g, "")}`).digest("hex");
const SEM_CONEXAO = { token: null, nome: null, escolas: [], conectadoEm: null };

export async function tokenDo(usuarioId: string) {
  const u = await Usuario.findById(usuarioId).select("diario diarioCpf").lean();
  if (u?.diario?.token && !u.diarioCpf) {
    // conexao antiga (antes da trava de 1 D.E.V por conta): pede para conectar de novo uma vez
    await Usuario.updateOne({ _id: usuarioId }, { $set: { diario: SEM_CONEXAO } });
    return null;
  }
  return u?.diario?.token ?? null;
}

// Token do Diario recusado: desconecta para o professor conectar de novo
export async function tratarErro(res: Response, usuarioId: string, e: unknown) {
  if (e instanceof ErroDiario) {
    if (e.dados.vinculoInvalido) {
      await Usuario.updateOne({ _id: usuarioId }, { $set: { diario: { token: null, nome: null, escolas: [], conectadoEm: null } } });
      return res.status(409).json({ message: e.message, reconectar: true });
    }
    return res.status(e.status >= 500 ? 502 : e.status).json({ message: e.message, ...e.dados });
  }
  throw e;
}

// GET /api/diario -> situacao da conexao
export async function status(req: Request, res: Response) {
  const u = await Usuario.findById(req.usuarioId).select("diario diarioCpf").lean();
  const conectado = !!u?.diario?.token && !!u.diarioCpf;
  if (u?.diario?.token && !u.diarioCpf) await Usuario.updateOne({ _id: req.usuarioId }, { $set: { diario: SEM_CONEXAO } });
  res.json({
    disponivel: diarioLigado(),
    conectado,
    nome: u?.diario?.nome ?? null,
    escolas: u?.diario?.escolas ?? [],
  });
}

// POST /api/diario/conectar { cpf, senha } -> a senha vai direto ao Diario e nao e guardada aqui
const conectarSchema = z.object({ cpf: z.string().min(11).max(20), senha: z.string().min(1).max(200) });
export async function conectar(req: Request, res: Response) {
  const p = conectarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Informe o CPF e a senha do D.E.V." });
  // 1 D.E.V por conta: esta conta so conecta o D.E.V do proprio professor; cada D.E.V so em uma conta do I.A Prof
  const h = hashCpf(p.data.cpf);
  const eu = await Usuario.findById(req.usuarioId).select("diarioCpf").lean();
  if (eu?.diarioCpf && eu.diarioCpf !== h) {
    return res.status(409).json({ message: "Sua conta do I.A Prof já está ligada ao D.E.V de outro professor. Cada conta só conecta o D.E.V do próprio professor. Se precisar trocar, fale com o suporte." });
  }
  if (await Usuario.exists({ diarioCpf: h, _id: { $ne: req.usuarioId } })) {
    return res.status(409).json({ message: "Este D.E.V já está conectado a outra conta do I.A Prof. Cada professor conecta o seu D.E.V em uma única conta." });
  }
  try {
    const r = await diario.vincular(p.data.cpf, p.data.senha);
    await Usuario.updateOne({ _id: req.usuarioId }, { $set: { diarioCpf: h, diario: { token: r.token, nome: r.nome, escolas: r.escolas ?? [], conectadoEm: new Date() } } });
    res.json({ conectado: true, nome: r.nome, escolas: r.escolas ?? [] });
  } catch (e) {
    // duas contas tentando o mesmo D.E.V ao mesmo tempo: o indice unico barra a segunda
    if ((e as { code?: number }).code === 11000) return res.status(409).json({ message: "Este D.E.V já está conectado a outra conta do I.A Prof." });
    if (e instanceof ErroDiario && e.status === 401) return res.status(400).json({ message: e.message });
    return tratarErro(res, req.usuarioId!, e);
  }
}

// DELETE /api/diario/conectar
export async function desconectar(req: Request, res: Response) {
  await Usuario.updateOne({ _id: req.usuarioId }, { $set: { diario: { token: null, nome: null, escolas: [], conectadoEm: null } } });
  res.json({ conectado: false });
}

// GET /api/diario/turmas?ano=2026
export async function turmas(req: Request, res: Response) {
  const token = await tokenDo(req.usuarioId!);
  if (!token) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });
  try {
    const r = await diario.turmas(token, typeof req.query.ano === "string" ? req.query.ano : undefined);
    res.json(r.turmas);
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}

// GET /api/diario/verificar?turma=<id>&data=AAAA-MM-DD -> ja tem aula no Diario nesse dia? a data pode receber aula?
export async function verificar(req: Request, res: Response) {
  const turma = String(req.query.turma || "");
  const data = String(req.query.data || "");
  if (!/^[a-f0-9]{24}$/i.test(turma) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.status(400).json({ message: "Dados inválidos" });
  const token = await tokenDo(req.usuarioId!);
  if (!token) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });
  try {
    res.json(await diario.verificarAula(token, turma, data));
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}

// POST /api/diario/enviar { registroId, modo? } -> grava a aula salva no Diario
const enviarSchema = z.object({
  registroId: z.string().regex(/^[a-f0-9]{24}$/i),
  modo: z.enum(["substituir", "juntar"]).nullish(),
});
export async function enviar(req: Request, res: Response) {
  const p = enviarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Dados inválidos" });
  const token = await tokenDo(req.usuarioId!);
  if (!token) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });

  const reg = await RegistroAula.findOne({ _id: p.data.registroId, usuario: req.usuarioId });
  if (!reg) return res.status(404).json({ message: "Aula não encontrada" });
  if (!reg.diarioTurmaId) return res.status(400).json({ message: "Escolha a turma do D.E.V nesta aula antes de enviar." });

  try {
    const r = await diario.registrarAula(token, {
      id_turma: reg.diarioTurmaId,
      data: reg.data,
      descricao: reg.textoFinal,
      modo: p.data.modo ?? undefined,
    });
    reg.diarioEnviadoEm = new Date();
    reg.diarioRegistroId = r.id;
    await reg.save();
    res.json({ ok: true, acao: r.acao, enviadoEm: reg.diarioEnviadoEm });
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}

// GET /api/diario/turmas/:id/alunos -> alunos, materias do professor e periodos da turma do D.E.V
export async function alunos(req: Request, res: Response) {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Turma inválida" });
  const token = await tokenDo(req.usuarioId!);
  if (!token) return res.status(409).json({ message: "Conecte sua conta do D.E.V.", reconectar: true });
  try {
    res.json(await diario.alunos(token, req.params.id));
  } catch (e) {
    return tratarErro(res, req.usuarioId!, e);
  }
}
