import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { TESTE } from "../config/planos";
import { gerarToken } from "../middleware/auth";
import { Usuario } from "../models/Usuario";
import { PlanoCurso } from "../models/PlanoCurso";
import { RegistroAula } from "../models/RegistroAula";
import { situacaoDoUsuario } from "../services/uso";

const cadastroSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().trim().email("E-mail inválido"),
  senha: z.string().min(6, "A senha precisa ter pelo menos 6 caracteres"),
});
const loginSchema = z.object({ email: z.string().trim().email("E-mail inválido"), senha: z.string().min(1, "Informe a senha") });

// Primeira conta do sistema: assume os dados criados antes do login existir (planos e aulas sem dono)
async function adotarDadosAntigos(id: unknown) {
  await PlanoCurso.updateMany({ $or: [{ usuario: { $exists: false } }, { usuario: null }] }, { $set: { usuario: id } });
  await RegistroAula.updateMany({ $or: [{ usuario: { $exists: false } }, { usuario: null }] }, { $set: { usuario: id } });
}

const publico = (u: { _id: unknown; nome: string; email: string }) => ({ id: String(u._id), nome: u.nome, email: u.email });

// POST /api/auth/cadastro -> cria a conta (com teste gratis) e ja entra
export async function cadastro(req: Request, res: Response) {
  const p = cadastroSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const email = p.data.email.toLowerCase();
  if (await Usuario.exists({ email })) return res.status(409).json({ message: "Já existe uma conta com esse e-mail. Faça login." });
  const primeiro = (await Usuario.estimatedDocumentCount()) === 0;
  const u = await Usuario.create({
    nome: p.data.nome,
    email,
    senhaHash: await bcrypt.hash(p.data.senha, 10),
    testeAte: new Date(Date.now() + TESTE.dias * 86400000),
  });
  if (primeiro) await adotarDadosAntigos(u._id);
  res.status(201).json({ token: gerarToken(String(u._id)), usuario: publico(u) });
}

// POST /api/auth/login
export async function login(req: Request, res: Response) {
  const p = loginSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const u = await Usuario.findOne({ email: p.data.email.toLowerCase() });
  if (u && !u.senhaHash) return res.status(401).json({ message: "Essa conta foi criada com o Google. Use o botão “Entrar com Google”." });
  if (!u || !(await bcrypt.compare(p.data.senha, u.senhaHash!))) return res.status(401).json({ message: "E-mail ou senha incorretos." });
  res.json({ token: gerarToken(String(u._id)), usuario: publico(u) });
}

// GET /api/auth/eu -> dados do professor logado + situacao (teste/plano/uso)
export async function eu(req: Request, res: Response) {
  const u = await Usuario.findById(req.usuarioId).lean();
  if (!u) return res.status(401).json({ message: "Conta não encontrada. Faça login de novo." });
  res.json({ usuario: publico(u), situacao: await situacaoDoUsuario(String(u._id)) });
}

// POST /api/auth/google -> entra (ou cria a conta) com o token do botao "Entrar com Google"
const google = new OAuth2Client();
export async function entrarGoogle(req: Request, res: Response) {
  const credential = typeof req.body?.credential === "string" ? req.body.credential : "";
  if (!env.googleClientId) return res.status(503).json({ message: "Login com Google não configurado (GOOGLE_CLIENT_ID no .env do servidor)." });
  if (!credential) return res.status(400).json({ message: "Token do Google ausente." });
  let dados: { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string } | undefined;
  try {
    const ticket = await google.verifyIdToken({ idToken: credential, audience: env.googleClientId });
    dados = ticket.getPayload();
  } catch {
    return res.status(401).json({ message: "Não foi possível confirmar sua conta Google. Tente de novo." });
  }
  if (!dados?.sub || !dados.email || !dados.email_verified) return res.status(401).json({ message: "Conta Google sem e-mail verificado." });
  const email = dados.email.toLowerCase();
  // Mesma pessoa: pela conta Google ou pelo e-mail (liga o Google numa conta criada com senha)
  let u = (await Usuario.findOne({ googleId: dados.sub })) ?? (await Usuario.findOne({ email }));
  if (u) {
    if (!u.googleId) {
      u.googleId = dados.sub;
      if (!u.foto && dados.picture) u.foto = dados.picture;
      await u.save();
    }
  } else {
    const primeiro = (await Usuario.estimatedDocumentCount()) === 0;
    u = await Usuario.create({
      nome: dados.name || email.split("@")[0],
      email,
      googleId: dados.sub,
      foto: dados.picture ?? null,
      testeAte: new Date(Date.now() + TESTE.dias * 86400000),
    });
    if (primeiro) await adotarDadosAntigos(u._id);
  }
  res.json({ token: gerarToken(String(u._id)), usuario: publico(u) });
}

// GET /api/auth/config -> o client sabe se mostra o botao do Google
export async function configAuth(_req: Request, res: Response) {
  res.json({ googleClientId: env.googleClientId || null });
}
