import { Request, Response } from "express";
import { z } from "zod";
import { Turma } from "../models/Turma";

// Turmas do I.A Prof (lista de alunos colada pelo professor) — para quem nao usa o D.E.V

// "1. Ana Souza", "02 - Bruno", "Carla;" -> so o nome; ignora linhas vazias e repetidas
export function nomesDaLista(texto: string): string[] {
  const vistos = new Set<string>();
  const nomes: string[] = [];
  for (const linha of String(texto || "").split(/\r?\n|;/)) {
    const nome = linha
      .replace(/^\s*\d+\s*[-.)º°:]?\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const chave = nome.toLowerCase();
    if (nome.length < 2 || vistos.has(chave)) continue;
    vistos.add(chave);
    nomes.push(nome);
  }
  return nomes.slice(0, 80);
}

const turmaSchema = z.object({
  nome: z.string().trim().min(1, "Dê um nome para a turma").max(60),
  ano: z.string().max(10).nullish(),
  anoLetivo: z.number().int().nullish(),
  // lista nova de nomes (um por linha). Alunos que ja existem (mesmo nome) mantem o id, para nao perder correcoes.
  alunosTexto: z.string().max(10000),
});

const saida = (t: { _id: unknown; nome: string; ano?: string | null; anoLetivo?: number | null; alunos: Array<{ _id: unknown; nome: string }> }) => ({
  _id: String(t._id),
  nome: t.nome,
  ano: t.ano ?? null,
  anoLetivo: t.anoLetivo ?? null,
  alunos: t.alunos.map((a) => ({ id: String(a._id), nome: a.nome })),
});

// GET /api/turmas
export async function listar(req: Request, res: Response) {
  const ts = await Turma.find({ usuario: req.usuarioId }).sort({ nome: 1 }).lean();
  res.json(ts.map(saida));
}

// POST /api/turmas
export async function criar(req: Request, res: Response) {
  const p = turmaSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const nomes = nomesDaLista(p.data.alunosTexto);
  if (!nomes.length) return res.status(400).json({ message: "Cole a lista de alunos (um nome por linha)." });
  const t = await Turma.create({ usuario: req.usuarioId, nome: p.data.nome, ano: p.data.ano ?? null, anoLetivo: p.data.anoLetivo ?? null, alunos: nomes.map((nome) => ({ nome })) });
  res.status(201).json(saida(t));
}

// PUT /api/turmas/:id
export async function atualizar(req: Request, res: Response) {
  const p = turmaSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const t = await Turma.findOne({ _id: req.params.id, usuario: req.usuarioId });
  if (!t) return res.status(404).json({ message: "Turma não encontrada." });
  const nomes = nomesDaLista(p.data.alunosTexto);
  if (!nomes.length) return res.status(400).json({ message: "A turma precisa ter pelo menos um aluno." });
  const atuais = new Map(t.alunos.map((a) => [a.nome.toLowerCase(), a]));
  t.set("alunos", nomes.map((nome) => { const a = atuais.get(nome.toLowerCase()); return a ? { _id: a._id, nome } : { nome }; }));
  t.nome = p.data.nome;
  t.ano = p.data.ano ?? null;
  t.anoLetivo = p.data.anoLetivo ?? null;
  await t.save();
  res.json(saida(t));
}

// DELETE /api/turmas/:id
export async function remover(req: Request, res: Response) {
  await Turma.deleteOne({ _id: req.params.id, usuario: req.usuarioId });
  res.status(204).end();
}
