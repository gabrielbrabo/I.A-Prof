import { AsyncLocalStorage } from "async_hooks";
import { env } from "../config/env";
import { planoPorId, TESTE } from "../config/planos";
import { Assinatura } from "../models/Assinatura";
import { Usuario } from "../models/Usuario";
import { UsoMensal } from "../models/UsoMensal";

// ---------- Medicao do custo da I.A por requisicao ----------
// Cada chamada ao Claude soma os tokens aqui; o controller grava no fim.
interface Medicao {
  custoUsd: number;
  chamadas: number;
}
const medicao = new AsyncLocalStorage<Medicao>();

// Preco por milhao de tokens (USD) — entrada / saida
const PRECOS: Array<{ prefixo: string; entrada: number; saida: number }> = [
  { prefixo: "claude-haiku", entrada: 0.1, saida: 0.5 },
  { prefixo: "claude-opus", entrada: 5, saida: 25 },
  { prefixo: "claude-sonnet", entrada: 2, saida: 10 },
];

export function somarUso(modelo: string, entrada: number, saida: number, cacheLeitura = 0) {
  const m = medicao.getStore();
  if (!m) return;
  const p = PRECOS.find((x) => modelo.startsWith(x.prefixo)) ?? PRECOS[PRECOS.length - 1];
  m.custoUsd += (entrada * p.entrada + saida * p.saida + cacheLeitura * p.entrada * 0.1) / 1_000_000;
  m.chamadas += 1;
}

// Custo extra fora do Claude (ex.: transcricao de voz), em USD
export function somarCustoUsd(usd: number) {
  const m = medicao.getStore();
  if (m) m.custoUsd += usd;
}

const mesAtual = () => new Date().toISOString().slice(0, 7);

// Executa fn medindo o custo da I.A e grava no consumo do mes do professor
export async function comMedicao<T>(usuarioId: string, fn: () => Promise<T>, opcoes: { aula?: boolean } = {}): Promise<T> {
  const m: Medicao = { custoUsd: 0, chamadas: 0 };
  try {
    return await medicao.run(m, fn);
  } finally {
    if (m.chamadas > 0 || m.custoUsd > 0) {
      const custoCentavos = m.custoUsd * env.cotacaoDolar * 100;
      await UsoMensal.updateOne(
        { usuario: usuarioId, mes: mesAtual() },
        { $inc: { custoCentavos, chamadas: m.chamadas, aulas: opcoes.aula ? 1 : 0 } },
        { upsert: true }
      ).catch((e) => console.error("[uso] falha ao gravar", e));
      if (opcoes.aula) await Usuario.updateOne({ _id: usuarioId }, { $inc: { testeAulas: 1 } }).catch(() => {});
    }
  }
}

// ---------- Situacao de acesso do professor ----------
export interface Situacao {
  acesso: "teste" | "assinante" | "bloqueado";
  motivo: string | null; // por que esta bloqueado
  planoId: string | null;
  planoNome: string | null;
  teste: { ativo: boolean; ate: string; aulasUsadas: number; aulasLimite: number; diasRestantes: number };
  uso: { percentual: number; mes: string }; // % do limite de I.A do mes
  assinatura: {
    status: string;
    ciclo: string | null;
    metodo: string | null;
    periodoFim: string | null;
    cancelarNoFim: boolean;
    checkoutUrl: string | null;
    cartao: string | null;
  } | null;
}

export const assinaturaValida = (a: { status: string; periodoFim?: Date | null } | null) =>
  !!a && a.status === "active" && (!a.periodoFim || a.periodoFim.getTime() > Date.now() - 3 * 86400000); // 3 dias de tolerancia

export async function situacaoDoUsuario(usuarioId: string): Promise<Situacao> {
  const [u, a, uso] = await Promise.all([
    Usuario.findById(usuarioId).lean(),
    Assinatura.findOne({ usuario: usuarioId }).lean(),
    UsoMensal.findOne({ usuario: usuarioId, mes: mesAtual() }).lean(),
  ]);
  if (!u) throw new Error("Usuário não encontrado");
  const agora = Date.now();
  // Fim do teste: o que estiver salvo ou cadastro + TESTE.dias (contas antigas ganham o prazo novo)
  const criadoEm = new Date((u as { createdAt?: Date }).createdAt ?? u.testeAte).getTime();
  const testeAte = new Date(Math.max(new Date(u.testeAte).getTime(), criadoEm + TESTE.dias * 86400000));
  const diasRestantes = Math.max(0, Math.ceil((testeAte.getTime() - agora) / 86400000));
  const testeAtivo = testeAte.getTime() > agora && (u.testeAulas ?? 0) < TESTE.aulas;
  const assinante = assinaturaValida(a as never);
  const plano = assinante && a ? planoPorId(a.planoId) : null;
  const limite = plano ? plano.limiteIaCentavos : TESTE.limiteIaCentavos;
  const gasto = uso?.custoCentavos ?? 0;
  const percentual = Math.min(100, Math.round((gasto / limite) * 100));

  let acesso: Situacao["acesso"] = "bloqueado";
  let motivo: string | null = null;
  if (assinante) {
    acesso = "assinante";
    if (gasto >= limite) {
      acesso = "bloqueado";
      motivo = `Você usou 100% do limite de I.A do plano ${plano?.nome} neste mês. O limite renova no dia 1º — ou mude para um plano maior.`;
    }
  } else if (testeAtivo) {
    acesso = "teste";
    if (gasto >= limite) {
      acesso = "bloqueado";
      motivo = "O limite de uso do teste grátis acabou. Assine um plano para continuar.";
    }
  } else {
    motivo =
      a && a.status === "past_due"
        ? "Aguardando o pagamento da assinatura. Assim que for confirmado, o acesso é liberado."
        : (u.testeAulas ?? 0) >= TESTE.aulas
          ? `Você usou as ${TESTE.aulas} aulas do teste grátis. Assine um plano para continuar gerando aulas.`
          : "Seu teste grátis terminou. Assine um plano para continuar gerando aulas.";
  }

  return {
    acesso,
    motivo,
    planoId: plano?.id ?? null,
    planoNome: plano?.nome ?? null,
    teste: { ativo: testeAtivo, ate: testeAte.toISOString(), aulasUsadas: u.testeAulas ?? 0, aulasLimite: TESTE.aulas, diasRestantes },
    uso: { percentual, mes: mesAtual() },
    assinatura: a
      ? {
          status: a.status,
          ciclo: a.ciclo ?? null,
          metodo: a.metodo ?? null,
          periodoFim: a.periodoFim ? new Date(a.periodoFim).toISOString() : null,
          cancelarNoFim: !!a.cancelarNoFim,
          checkoutUrl: a.checkoutUrl ?? null,
          cartao: a.cartaoFinal ? `${a.cartaoBandeira ?? "Cartão"} •••• ${a.cartaoFinal}` : null,
        }
      : null,
  };
}

// Erro de acesso (402): teste acabou, sem assinatura ou limite do mes atingido
export class SemAcesso extends Error {}

export async function exigirAcesso(usuarioId: string): Promise<Situacao> {
  const s = await situacaoDoUsuario(usuarioId);
  if (s.acesso === "bloqueado") throw new SemAcesso(s.motivo ?? "Assine um plano para continuar.");
  return s;
}
