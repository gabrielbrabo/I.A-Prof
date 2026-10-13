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
