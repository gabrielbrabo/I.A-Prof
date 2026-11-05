import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Usuario } from "../models/Usuario";

// Usuario logado em cada requisicao
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuarioId?: string;
    }
  }
}

export function gerarToken(usuarioId: string): string {
  return jwt.sign({ sub: usuarioId }, env.jwtSecret, { expiresIn: env.jwtExpira as jwt.SignOptions["expiresIn"] });
}

// Conta ligada (mesmo professor com dois e-mails): o login de qualquer uma abre a conta principal.
// Cache curto para nao consultar o banco a cada requisicao.
const principalCache = new Map<string, { id: string; ate: number }>();
export async function contaEfetiva(usuarioId: string): Promise<string> {
  const c = principalCache.get(usuarioId);
  if (c && c.ate > Date.now()) return c.id;
  const u = await Usuario.findById(usuarioId).select("contaPrincipal").lean();
  const id = u?.contaPrincipal ? String(u.contaPrincipal) : usuarioId;
  principalCache.set(usuarioId, { id, ate: Date.now() + 60_000 });
  return id;
}

// Exige login (header Authorization: Bearer <token>)
export async function proteger(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Faça login para continuar." });
  try {
    const dados = jwt.verify(token, env.jwtSecret) as { sub?: string };
    if (!dados.sub) throw new Error("token sem usuario");
    req.usuarioId = dados.sub;
  } catch {
    return res.status(401).json({ message: "Sessão expirada. Faça login de novo." });
  }
  try {
    req.usuarioId = await contaEfetiva(req.usuarioId);
  } catch {
    /* banco fora: segue com o id do token */
  }
  next();
}
