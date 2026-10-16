import { diario } from "./diario";
import { tokenDo } from "../controllers/diarioController";

// Trava do D.E.V: o que JA esta no D.E.V nao pode ser alterado no I.A Prof com o periodo fechado la
// (senao a copia do I.A Prof fica diferente do diario oficial). Devolve { status, message } ou null (pode alterar).
export type Trava = { status: number; message: string } | null;

const FECHADO = /fechad/i;

// Aula enviada ao D.E.V
export async function travaAula(usuarioId: string, r: { diarioEnviadoEm?: Date | null; diarioTurmaId?: string | null; data: string }): Promise<Trava> {
  if (!r.diarioEnviadoEm || !r.diarioTurmaId) return null;
  const token = await tokenDo(usuarioId);
  if (!token) return { status: 409, message: "Esta aula está no D.E.V. Conecte sua conta do D.E.V para conferir se o período está aberto antes de alterar." };
  try {
    const v = await diario.verificarAula(token, r.diarioTurmaId, r.data);
    if (!v.podeRegistrar && FECHADO.test(v.motivo ?? "")) {
      return { status: 423, message: `${v.motivo} Esta aula já está no D.E.V e não pode ser alterada aqui enquanto o período estiver fechado.` };
    }
    return null;
  } catch {
    return { status: 503, message: "Não deu para falar com o D.E.V agora para conferir o período. Tente de novo em instantes." };
  }
}

// Atividade com notas lancadas no D.E.V
export async function travaAtividade(
  usuarioId: string,
  a: { diario?: { atividadeId?: string | null } | null; diarioTurmaId?: unknown; diarioMateriaId?: unknown; periodo: number }
): Promise<Trava> {
  if (!a.diario?.atividadeId || !a.diarioTurmaId || !a.diarioMateriaId) return null;
  const token = await tokenDo(usuarioId);
  if (!token) return { status: 409, message: "Esta atividade tem notas no D.E.V. Conecte sua conta do D.E.V para conferir se o período está aberto antes de alterar." };
  try {
    const p = await diario.pontos(token, {
      id_turma: String(a.diarioTurmaId),
      bimestre: `${a.periodo}º BIMESTRE`,
      id_matter: String(a.diarioMateriaId),
      excluir: a.diario.atividadeId,
    });
    if (!p.aberto) {
      return {
        status: 423,
        message: `O ${a.periodo}º período desta turma está fechado no D.E.V. As notas desta atividade já estão lá e não podem ser alteradas aqui. Peça para a escola reabrir.`,
      };
    }
    return null;
  } catch {
    return { status: 503, message: "Não deu para falar com o D.E.V agora para conferir o período. Tente de novo em instantes." };
  }
}
