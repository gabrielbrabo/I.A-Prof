import { Request, Response } from "express";
import { z } from "zod";
import { Usuario } from "../models/Usuario";
import { RegistroAula } from "../models/RegistroAula";
import { diario, ErroDiario } from "../services/diario";
import { diarioLigado } from "../config/env";

// Integracao com o Diario escolar: conectar a conta, listar turmas e enviar a aula salva.

async function tokenDo(usuarioId: string) {
  const u = await Usuario.findById(usuarioId).select("diario").lean();
  return u?.diario?.token ?? null;
}

// Token do Diario recusado: desconecta para o professor conectar de novo
async function tratarErro(res: Response, usuarioId: string, e: unknown) {
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
  const u = await Usuario.findById(req.usuarioId).select("diario").lean();
  res.json({
    disponivel: diarioLigado(),
    conectado: !!u?.diario?.token,
    nome: u?.diario?.nome ?? null,
    escolas: u?.diario?.escolas ?? [],
  });
}

// POST /api/diario/conectar { cpf, senha } -> a senha vai direto ao Diario e nao e guardada aqui
const conectarSchema = z.object({ cpf: z.string().min(11).max(20), senha: z.string().min(1).max(200) });
export async function conectar(req: Request, res: Response) {
  const p = conectarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: "Informe o CPF e a senha do Diário." });
  try {
    const r = await diario.vincular(p.data.cpf, p.data.senha);
    await Usuario.updateOne({ _id: req.usuarioId }, { $set: { diario: { token: r.token, nome: r.nome, escolas: r.escolas ?? [], conectadoEm: new Date() } } });
    res.json({ conectado: true, nome: r.nome, escolas: r.escolas ?? [] });
  } catch (e) {
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
  if (!token) return res.status(409).json({ message: "Conecte sua conta do Diário escolar.", reconectar: true });
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
  if (!token) return res.status(409).json({ message: "Conecte sua conta do Diário escolar.", reconectar: true });
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
  if (!token) return res.status(409).json({ message: "Conecte sua conta do Diário escolar.", reconectar: true });

  const reg = await RegistroAula.findOne({ _id: p.data.registroId, usuario: req.usuarioId });
  if (!reg) return res.status(404).json({ message: "Aula não encontrada" });
  if (!reg.diarioTurmaId) return res.status(400).json({ message: "Escolha a turma do Diário nesta aula antes de enviar." });

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
