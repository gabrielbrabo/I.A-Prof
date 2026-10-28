import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Usuario } from "../models/Usuario";
import { Assinatura } from "../models/Assinatura";
import { UsoMensal } from "../models/UsoMensal";
import { RegistroAula } from "../models/RegistroAula";
import { Atividade } from "../models/Atividade";
import { PlanoCurso } from "../models/PlanoCurso";
import { Correcao } from "../models/Correcao";
import { AcessoAdmin } from "../models/AcessoAdmin";
import { situacaoDoUsuario } from "../services/uso";

// Painel admin SO LEITURA: ver como os professores estao usando (nada e alterado, nao gasta I.A).
// Acesso so para os e-mails de ADMIN_EMAILS. Cada abertura de dados de um professor fica registrada.

export async function exigirAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const u = await Usuario.findById(req.usuarioId).select("email").lean();
    if (!u || !env.adminEmails.includes(u.email)) return res.status(403).json({ message: "Acesso restrito." });
    next();
  } catch (e) {
    next(e);
  }
}

const registrar = (req: Request, usuarioVisto: string | null) =>
  AcessoAdmin.create({ admin: req.usuarioId, usuarioVisto, rota: req.originalUrl }).catch(() => undefined);
const ehId = (v: unknown): v is string => typeof v === "string" && mongoose.isValidObjectId(v);
const contarPor = async (m: mongoose.Model<any>, ids?: unknown[]) => {
  const r = await m.aggregate([...(ids ? [{ $match: { usuario: { $in: ids } } }] : []), { $group: { _id: "$usuario", n: { $sum: 1 }, ultimo: { $max: "$createdAt" } } }]);
  return new Map(r.map((x: { _id: unknown; n: number; ultimo: Date }) => [String(x._id), x]));
};

// GET /api/admin/usuarios?q= -> lista com plano, uso de I.A e quanto cada um usou
export async function usuarios(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const filtro = q ? { $or: [{ nome: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }] } : {};
  const lista = await Usuario.find(filtro).select("nome email createdAt diario.conectadoEm diario.token creditosCentavos").sort({ createdAt: -1 }).limit(300).lean();
  const ids = lista.map((u) => u._id);
  const [aulas, ativs, planos, correcoes] = await Promise.all([contarPor(RegistroAula, ids), contarPor(Atividade, ids), contarPor(PlanoCurso, ids), contarPor(Correcao, ids)]);
  const linhas = await Promise.all(
    lista.map(async (u) => {
      const id = String(u._id);
      const s = await situacaoDoUsuario(id).catch(() => null);
      const ultimos = [aulas.get(id)?.ultimo, ativs.get(id)?.ultimo].filter(Boolean).map((d) => new Date(d as Date).getTime());
      return {
        id,
        nome: u.nome,
        email: u.email,
        criadoEm: (u as { createdAt?: Date }).createdAt ?? null,
        acesso: s?.acesso ?? null,
        planoNome: s?.planoNome ?? null,
        usoPercentual: s?.uso.percentual ?? 0,
        aulas: aulas.get(id)?.n ?? 0,
        atividades: ativs.get(id)?.n ?? 0,
        correcoes: correcoes.get(id)?.n ?? 0,
        planosCurso: planos.get(id)?.n ?? 0,
        devConectado: !!u.diario?.token,
        ultimoUso: ultimos.length ? new Date(Math.max(...ultimos)) : null,
      };
    })
  );
  await registrar(req, null);
  res.json(linhas);
}

// GET /api/admin/usuarios/:id -> detalhe: consumo por mes, aulas, atividades e planos de curso
export async function usuario(req: Request, res: Response) {
  if (!ehId(req.params.id)) return res.status(400).json({ message: "Id inválido" });
  const id = req.params.id;
  const u = await Usuario.findById(id).select("nome email createdAt testeAte testeAulas testeAtividades creditosCentavos diario.nome diario.escolas diario.conectadoEm diario.token").lean();
  if (!u) return res.status(404).json({ message: "Professor não encontrado" });
  const [situacao, assinatura, usos, aulas, atividades, planos] = await Promise.all([
    situacaoDoUsuario(id).catch(() => null),
    Assinatura.findOne({ usuario: id }).select("planoId ciclo metodo status periodoFim cancelarNoFim createdAt").lean(),
    UsoMensal.find({ usuario: id }).sort({ updatedAt: -1 }).limit(12).lean(),
    RegistroAula.find({ usuario: id }).sort({ createdAt: -1 }).limit(60).select("data turma ano uf anoLetivo periodo entrada textoFinal itens diarioEnviadoEm createdAt").lean(),
    Atividade.find({ usuario: id }).sort({ createdAt: -1 }).limit(60).select("titulo componente ano anoLetivo periodo turma detalhes origem semNota valorTotal habilidades createdAt questoes.tipo").lean(),
    PlanoCurso.find({ usuario: id }).sort({ anoLetivo: -1, ano: 1 }).select("ano anoLetivo turma tipoPeriodo periodos.numero periodos.itens.codigo updatedAt").lean(),
  ]);
  await registrar(req, id);
  res.json({
    usuario: {
      id,
      nome: u.nome,
      email: u.email,
      criadoEm: (u as { createdAt?: Date }).createdAt ?? null,
      testeAte: u.testeAte,
      testeAulas: u.testeAulas ?? 0,
      testeAtividades: u.testeAtividades ?? 0,
      creditosCentavos: Math.round(u.creditosCentavos ?? 0),
      dev: u.diario?.token ? { nome: u.diario.nome, escolas: u.diario.escolas, conectadoEm: u.diario.conectadoEm } : null,
    },
    situacao,
    assinatura,
    usos: usos.map((x) => ({ mes: x.mes, custoCentavos: Math.round(x.custoCentavos ?? 0), aulas: x.aulas, atividades: x.atividades, correcoes: x.correcoes, chamadas: x.chamadas })),
    aulas,
    atividades: atividades.map((a) => ({ ...a, questoes: (a.questoes ?? []).length })),
    planos: planos.map((p) => ({
      _id: p._id,
      ano: p.ano,
      anoLetivo: p.anoLetivo,
      turma: p.turma,
      tipoPeriodo: p.tipoPeriodo,
      periodos: (p.periodos ?? []).map((x: { numero: number; itens?: Array<{ codigo?: string | null }> }) => ({ numero: x.numero, habilidades: (x.itens ?? []).filter((i) => i.codigo).length })),
      atualizadoEm: (p as { updatedAt?: Date }).updatedAt ?? null,
    })),
  });
}

// GET /api/admin/atividades/:id -> atividade completa (para ver a folha como o professor gerou)
export async function atividade(req: Request, res: Response) {
  if (!ehId(req.params.id)) return res.status(400).json({ message: "Id inválido" });
  const a = await Atividade.findById(req.params.id).lean();
  if (!a) return res.status(404).json({ message: "Atividade não encontrada" });
  await registrar(req, String(a.usuario));
  res.json(a);
}
