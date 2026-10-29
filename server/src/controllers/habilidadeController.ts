import { Request, Response } from "express";
import { z } from "zod";
import { Habilidade } from "../models/Habilidade";
import { buscarCandidatas, listarComponentes } from "../services/buscaHabilidades";

const anoUfSchema = z.object({
  ano: z.string().min(1),
  uf: z.string().length(2).optional(),
});

// GET /api/habilidades/componentes?ano=4&uf=MG
export async function getComponentes(req: Request, res: Response) {
  const p = anoUfSchema.safeParse(req.query);
  if (!p.success) return res.status(400).json({ message: "Informe ano (e uf opcional)" });
  res.json(await listarComponentes(p.data.ano, p.data.uf));
}

// GET /api/habilidades/ufs -> UFs que ja tem curriculo proprio importado
export async function getUfs(_req: Request, res: Response) {
  const ufs = (await Habilidade.distinct("uf", { uf: { $ne: null } })) as string[];
  res.json(ufs.sort());
}

// GET /api/habilidades?ano=4&componente=Matemática&q=tabuada&uf=MG
export async function getHabilidades(req: Request, res: Response) {
  const p = anoUfSchema.extend({ componente: z.string().min(1), q: z.string().optional() }).safeParse(req.query);
  if (!p.success) return res.status(400).json({ message: "Informe ano e componente" });
  const lista = await buscarCandidatas({
    ano: p.data.ano,
    uf: p.data.uf,
    componente: p.data.componente,
    consulta: p.data.q ?? "",
    limite: 100,
  });
  res.json(lista);
}

// GET /api/habilidades/objetos?codigos=EF04MA09,EF04LP01&uf=MG -> objeto de conhecimento de cada codigo
// (para mostrar nos cards da aula e nas atividades; o do estado tem prioridade sobre o da BNCC)
export async function getObjetos(req: Request, res: Response) {
  const codigos = String(req.query.codigos ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z0-9]{4,20}$/.test(c))
    .slice(0, 200);
  const uf = typeof req.query.uf === "string" && /^[A-Z]{2}$/i.test(req.query.uf) ? req.query.uf.toUpperCase() : null;
  if (!codigos.length) return res.json({});
  const docs = await Habilidade.find({ codigo: { $in: codigos }, objetoConhecimento: { $nin: [null, ""] } })
    .select("codigo uf objetoConhecimento unidadeTematica")
    .lean();
  const r: Record<string, { objeto: string; unidade: string | null }> = {};
  for (const d of docs.sort((a, b) => (a.uf === uf ? -1 : 0) - (b.uf === uf ? -1 : 0))) {
    const c = String(d.codigo).toUpperCase();
    if (!r[c]) r[c] = { objeto: d.objetoConhecimento as string, unidade: (d.unidadeTematica as string | null) ?? null };
  }
  res.json(r);
}
