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
import { conferirPlano, comoFoiEnviado, EnvioRegistro } from "../services/conferenciaPlano";
import { EnvioPlano } from "../models/EnvioPlano";
import { diario, ErroDiario } from "../services/diario";

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

// Situacao do D.E.V igual a do app do professor: conectado = tem token E o D.E.V ligado a conta (diarioCpf)
type DevUsuario = { diario?: { token?: string | null } | null; diarioCpf?: string | null; diarioPedido?: { id?: string | null; expiraEm?: Date | null } | null };
export function situacaoDev(u: DevUsuario): "conectado" | "conexao_antiga" | "desconectado" | "pendente" | "nunca" {
  if (u.diario?.token && u.diarioCpf) return "conectado";
  if (u.diario?.token) return "conexao_antiga"; // antes da trava de 1 D.E.V por conta: vai pedir para conectar de novo
  if (u.diarioPedido?.id && u.diarioPedido.expiraEm && new Date(u.diarioPedido.expiraEm).getTime() > Date.now()) return "pendente";
  if (u.diarioCpf) return "desconectado"; // ja conectou antes e hoje esta desconectado
  return "nunca";
}

// Series que o professor usou (aulas e atividades do ano letivo atual) sem plano de curso dessa serie
async function seriesSemPlano(ids: unknown[], planos: Array<{ usuario?: unknown; ano: string; anoLetivo: number }>) {
  const anoAtual = new Date().getFullYear();
  const usadas = await Promise.all(
    [RegistroAula, Atividade].map((m: mongoose.Model<any>) =>
      m.aggregate([{ $match: { usuario: { $in: ids }, anoLetivo: anoAtual } }, { $group: { _id: { u: "$usuario", a: "$ano" }, n: { $sum: 1 } } }])
    )
  );
  const res = new Map<string, string[]>();
  for (const x of usadas.flat() as Array<{ _id: { u: unknown; a: string } }>) {
    const u = String(x._id.u);
    if (planos.some((p) => String(p.usuario) === u && p.ano === x._id.a && p.anoLetivo === anoAtual)) continue;
    const l = res.get(u) ?? [];
    if (!l.includes(x._id.a)) l.push(x._id.a);
    res.set(u, l);
  }
  return res;
}
const SELECT_PLANO = "usuario ano anoLetivo turma uf tipoPeriodo arquivos periodos.numero periodos.itens.codigo periodos.itens.origemTexto updatedAt";

// GET /api/admin/usuarios?q= -> lista com plano, uso de I.A e quanto cada um usou
export async function usuarios(req: Request, res: Response) {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const filtro = q ? { $or: [{ nome: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { email: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }] } : {};
  const lista = await Usuario.find(filtro).select("nome email createdAt diario diarioCpf diarioPedido creditosCentavos").sort({ createdAt: -1 }).limit(300).lean();
  const ids = lista.map((u) => u._id);
  const [aulas, ativs, planos, correcoes, listaPlanos, enviadas] = await Promise.all([
    contarPor(RegistroAula, ids),
    contarPor(Atividade, ids),
    contarPor(PlanoCurso, ids),
    contarPor(Correcao, ids),
    PlanoCurso.find({ usuario: { $in: ids } }).select(SELECT_PLANO).lean(),
    RegistroAula.aggregate([{ $match: { usuario: { $in: ids }, diarioEnviadoEm: { $ne: null } } }, { $group: { _id: "$usuario", n: { $sum: 1 }, ultimo: { $max: "$diarioEnviadoEm" } } }]),
  ]);
  const semPlano = await seriesSemPlano(ids, listaPlanos as never);
  const enviosLista = await EnvioPlano.find({ usuario: { $in: ids } }).lean();
  const enviadasPor = new Map(enviadas.map((x: { _id: unknown; n: number; ultimo: Date }) => [String(x._id), x]));
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
        dev: situacaoDev(u as DevUsuario),
        aulasNoDev: enviadasPor.get(id)?.n ?? 0,
        ultimaNoDev: enviadasPor.get(id)?.ultimo ?? null,
        planosComAlerta: listaPlanos.filter((p) => {
          if (String(p.usuario) !== id) return false;
          const meus = enviosLista.filter((e) => String(e.usuario) === id) as unknown as EnvioRegistro[];
          return conferirPlano(p as never).length > 0 || comoFoiEnviado(p as never, meus).alertas.length > 0;
        }).length,
        seriesSemPlano: semPlano.get(id) ?? [],
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
  const u = await Usuario.findById(id).select("nome email createdAt testeAte testeAulas testeAtividades creditosCentavos diario diarioCpf diarioPedido").lean();
  if (!u) return res.status(404).json({ message: "Professor não encontrado" });
  const [situacao, assinatura, usos, aulas, atividades, planos] = await Promise.all([
    situacaoDoUsuario(id).catch(() => null),
    Assinatura.findOne({ usuario: id }).select("planoId ciclo metodo status periodoFim cancelarNoFim createdAt").lean(),
    UsoMensal.find({ usuario: id }).sort({ updatedAt: -1 }).limit(12).lean(),
    RegistroAula.find({ usuario: id }).sort({ createdAt: -1 }).limit(60).select("data turma ano uf anoLetivo periodo entrada textoFinal itens diarioEnviadoEm createdAt").lean(),
    Atividade.find({ usuario: id }).sort({ createdAt: -1 }).limit(60).select("titulo componente ano anoLetivo periodo turma detalhes origem semNota valorTotal habilidades createdAt questoes.tipo").lean(),
    PlanoCurso.find({ usuario: id }).sort({ anoLetivo: -1, ano: 1 }).select(SELECT_PLANO).lean(),
  ]);
  const [semPlano, enviadas, envios] = await Promise.all([
    seriesSemPlano([new mongoose.Types.ObjectId(id)], planos as never),
    RegistroAula.aggregate([{ $match: { usuario: new mongoose.Types.ObjectId(id), diarioEnviadoEm: { $ne: null } } }, { $group: { _id: null, n: { $sum: 1 }, ultimo: { $max: "$diarioEnviadoEm" } } }]),
    EnvioPlano.find({ usuario: id }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  // D.E.V: confere AGORA com o D.E.V se a conexao funciona (so leitura: lista as turmas)
  const sit = situacaoDev(u as DevUsuario);
  let devAoVivo: { ok: boolean; mensagem: string; turmas?: number } | null = null;
  if (u.diario?.token) {
    try {
      const r = await diario.turmas(u.diario.token, String(new Date().getFullYear()));
      devAoVivo = { ok: true, mensagem: `Confirmado agora com o D.E.V (${r.turmas.length} turma(s) em ${new Date().getFullYear()}).`, turmas: r.turmas.length };
    } catch (e) {
      devAoVivo = {
        ok: false,
        mensagem: e instanceof ErroDiario && e.dados?.vinculoInvalido ? "O D.E.V recusou a conexão (professor inativo ou vínculo inválido)." : `Não consegui confirmar com o D.E.V agora: ${e instanceof Error ? e.message : "erro"}`,
      };
    }
  }
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
      dev: {
        situacao: sit,
        nome: u.diario?.nome ?? null,
        escolas: u.diario?.escolas ?? [],
        conectadoEm: u.diario?.conectadoEm ?? null,
        aoVivo: devAoVivo,
        aulasEnviadas: enviadas[0]?.n ?? 0,
        ultimaEnviada: enviadas[0]?.ultimo ?? null,
      },
    },
    situacao,
    assinatura,
    usos: usos.map((x) => ({ mes: x.mes, custoCentavos: Math.round(x.custoCentavos ?? 0), aulas: x.aulas, atividades: x.atividades, correcoes: x.correcoes, chamadas: x.chamadas })),
    seriesSemPlano: semPlano.get(id) ?? [],
    aulas,
    atividades: atividades.map((a) => ({ ...a, questoes: (a.questoes ?? []).length })),
    envios: envios.map((e) => ({
      _id: e._id,
      em: (e as { createdAt?: Date }).createdAt ?? null,
      ano: e.ano,
      anoLetivo: e.anoLetivo,
      turma: e.turma,
      tipoPeriodo: e.tipoPeriodo,
      modo: e.modo,
      periodoEscolhido: e.periodoEscolhido,
      arquivos: e.arquivos,
      periodosNoDocumento: e.periodosNoDocumento,
      periodosLidos: e.periodosLidos,
      habilidades: e.habilidades,
      resultado: e.resultado,
      mensagem: e.mensagem,
    })),
    planos: planos.map((p) => ({
      _id: p._id,
      ano: p.ano,
      anoLetivo: p.anoLetivo,
      turma: p.turma,
      tipoPeriodo: p.tipoPeriodo,
      uf: p.uf,
      arquivos: p.arquivos ?? [],
      ...(() => {
        const como = comoFoiEnviado(p as never, envios as unknown as EnvioRegistro[]);
        return { forma: como.forma, periodos: como.porPeriodo, alertas: [...conferirPlano(p as never), ...como.alertas] };
      })(),
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
