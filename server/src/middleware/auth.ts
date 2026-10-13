import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

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

// Exige login (header Authorization: Bearer <token>)
export function proteger(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Faça login para continuar." });
  try {
    const dados = jwt.verify(token, env.jwtSecret) as { sub?: string };
    if (!dados.sub) throw new Error("token sem usuario");
    req.usuarioId = dados.sub;
    next();
  } catch {
    res.status(401).json({ message: "Sessão expirada. Faça login de novo." });
  }
}
