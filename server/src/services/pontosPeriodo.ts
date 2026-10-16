import { Atividade } from "../models/Atividade";
import { diario } from "./diario";
import { tokenDo } from "../controllers/diarioController";

// Pontos do periodo (bimestre) na turma/materia do D.E.V: as atividades somadas nao podem passar o total.
// Conta o que ja esta no D.E.V + as atividades salvas aqui que ainda nao foram lancadas (vao ocupar pontos ao lancar).
export interface PontosPeriodo {
  total: number; // total de pontos do periodo (0 = sem limite cadastrado)
  usadoDev: number; // ja lancado no D.E.V
  pendente: number; // salvo no I.A Prof, ainda nao lancado
  restante: number | null; // null = sem limite
  aberto: boolean;
}

export async function pontosDoPeriodo(
  usuarioId: string,
  q: { turma: string; periodo: number; materia: string; excluirId?: string | null }
): Promise<PontosPeriodo | { erro: string; reconectar?: boolean }> {
  const token = await tokenDo(usuarioId);
  if (!token) return { erro: "Conecte sua conta do D.E.V para conferir os pontos do período.", reconectar: true };
  const atual = q.excluirId ? await Atividade.findOne({ _id: q.excluirId, usuario: usuarioId }).select("diario").lean().catch(() => null) : null;
  const p = await diario.pontos(token, {
    id_turma: q.turma,
    bimestre: `${q.periodo}º BIMESTRE`,
    id_matter: q.materia,
    excluir: atual?.diario?.atividadeId ?? null,
  });
  const pendentes = await Atividade.find({
    usuario: usuarioId,
    diarioTurmaId: q.turma,
    diarioMateriaId: q.materia,
    periodo: q.periodo,
    "diario.atividadeId": null,
    ...(q.excluirId ? { _id: { $ne: q.excluirId } } : {}),
  })
    .select("valorTotal")
    .lean();
  const pendente = Math.round(pendentes.reduce((s, a) => s + (Number(a.valorTotal) || 0), 0) * 100) / 100;
  const total = Number(p.total) || 0;
  const usadoDev = Number(p.usado) || 0;
  const restante = total > 0 ? Math.max(0, Math.round((total - usadoDev - pendente) * 100) / 100) : null;
  return { total, usadoDev, pendente, restante, aberto: p.aberto !== false };
}

// Mensagem quando o valor nao cabe nos pontos que restam; null = pode
// (periodo fechado nao bloqueia gerar/corrigir: so o lancamento no D.E.V)
export function foraDoPeriodo(p: PontosPeriodo, valor: number, periodo: number): string | null {
  if (p.restante != null && valor > p.restante + 1e-9) {
    return `O valor (${valor}) passa do que resta no ${periodo}º período: ${p.restante} de ${p.total} pontos.`;
  }
  return null;
}
