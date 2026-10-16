import { AsyncLocalStorage } from "async_hooks";
import { env } from "../config/env";
import { planoPorId, TESTE } from "../config/planos";
import { Assinatura } from "../models/Assinatura";
import { Usuario } from "../models/Usuario";
import { UsoMensal } from "../models/UsoMensal";

// ---------- Medicao do custo da I.A por requisicao ----------
// Cada chamada a I.A (Claude ou OpenAI) soma os tokens aqui; o controller grava no fim.
interface Medicao {
  custoUsd: number;
  chamadas: number;
}
const medicao = new AsyncLocalStorage<Medicao>();

// Preco por milhao de tokens (USD) — entrada / saida
const PRECOS: Array<{ prefixo: string; entrada: number; saida: number }> = [
  { prefixo: "claude-haiku", entrada: 0.1, saida: 0.5 },
  { prefixo: "claude-opus", entrada: 5, saida: 25 },
  // OpenAI (USD por 1M) — conferir em developers.openai.com/api/docs/pricing
  { prefixo: "gpt-6-astra", entrada: 10, saida: 50 },
  { prefixo: "gpt-6.1-sol", entrada: 2, saida: 10 },
  { prefixo: "gpt-6-luna", entrada: 0.1, saida: 0.5 },
  { prefixo: "gpt-5.6-sol", entrada: 4, saida: 20 },
  { prefixo: "gpt-5.5", entrada: 5, saida: 30 },
  { prefixo: "gpt-5.4-mini", entrada: 0.75, saida: 4.5 },
  { prefixo: "gpt-5.4", entrada: 2.5, saida: 15 },
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

// ---------- Ciclo do limite de I.A ----------
// Assinante: renova todo mes no DIA em que assinou (no anual tambem, mes a mes).
// Teste gratis: um limite so para o teste inteiro (nao renova).
type AssinaturaCiclo = { status: string; periodoFim?: Date | null; inicioCiclo?: Date | null; createdAt?: Date } | null;
const BRT = 3 * 3600000; // horario de Brasilia
const diasNoMes = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export function cicloDeUso(a: AssinaturaCiclo, agora = Date.now()): { chave: string; inicio: string | null; renovaEm: string | null } {
  if (!a || !assinaturaValida(a)) return { chave: "teste", inicio: null, renovaEm: null };
  const ref = new Date(new Date(a.inicioCiclo ?? a.createdAt ?? agora).getTime() - BRT);
  const dia = ref.getUTCDate();
  const diaNo = (y: number, m: number) => Math.min(dia, diasNoMes(y, m)); // dia 31 em fevereiro = dia 28/29
  const h = new Date(agora - BRT);
  let y = h.getUTCFullYear();
  let m = h.getUTCMonth();
  if (h.getUTCDate() < diaNo(y, m)) {
    m -= 1;
    if (m < 0) (m = 11), (y -= 1);
  }
  const ny = m === 11 ? y + 1 : y;
  const nm = (m + 1) % 12;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  const inicio = iso(Date.UTC(y, m, diaNo(y, m)));
  return { chave: `c${inicio}`, inicio, renovaEm: iso(Date.UTC(ny, nm, diaNo(ny, nm))) };
}

// Ciclo atual e limite do professor (centavos de custo real): plano assinado ou teste
async function cicloELimite(usuarioId: string) {
  const a = await Assinatura.findOne({ usuario: usuarioId }).lean();
  const plano = assinaturaValida(a as never) && a ? planoPorId(a.planoId) : null;
  return { chave: cicloDeUso(a as never).chave, limite: plano ? plano.limiteIaCentavos : TESTE.limiteIaCentavos };
}

// Executa fn medindo o custo da I.A e grava no consumo do mes do professor.
// O que passar do limite do mes sai dos creditos extras (se houver).
export async function comMedicao<T>(usuarioId: string, fn: () => Promise<T>, opcoes: { aula?: boolean; atividade?: boolean; ajuste?: boolean; correcao?: boolean } = {}): Promise<T> {
  const m: Medicao = { custoUsd: 0, chamadas: 0 };
  try {
    return await medicao.run(m, fn);
  } finally {
    if (m.chamadas > 0 || m.custoUsd > 0) {
      const custoCentavos = m.custoUsd * env.cotacaoDolar * 100;
      try {
        const { chave, limite } = await cicloELimite(usuarioId);
        const doc = await UsoMensal.findOneAndUpdate(
          { usuario: usuarioId, mes: chave },
          {
            $inc: {
              custoCentavos,
              chamadas: m.chamadas,
              aulas: opcoes.aula ? 1 : 0,
              atividades: opcoes.atividade ? 1 : 0,
              correcoes: opcoes.correcao ? 1 : 0,
            },
          },
          { upsert: true, new: true }
        ).lean();
        const depois = doc?.custoCentavos ?? custoCentavos;
        const antes = depois - custoCentavos;
        const excesso = Math.max(0, depois - Math.max(limite, antes));
        if (excesso > 0) {
          await Usuario.updateOne({ _id: usuarioId }, [
            { $set: { creditosCentavos: { $max: [0, { $subtract: [{ $ifNull: ["$creditosCentavos", 0] }, excesso] }] } } },
          ]);
        }
      } catch (e) {
        console.error("[uso] falha ao gravar", e);
      }
      if (opcoes.aula) await Usuario.updateOne({ _id: usuarioId }, { $inc: { testeAulas: 1 } }).catch(() => {});
      // ajuste tambem gasta I.A: conta como uma atividade do teste gratis
      if (opcoes.atividade || opcoes.ajuste) await Usuario.updateOne({ _id: usuarioId }, { $inc: { testeAtividades: 1 } }).catch(() => {});
    }
  }
}

// ---------- Situacao de acesso do professor ----------
export interface Situacao {
  acesso: "teste" | "assinante" | "bloqueado";
  motivo: string | null; // por que esta bloqueado
  porLimite: boolean; // bloqueado so porque o limite do mes / as aulas do teste acabaram
  planoId: string | null;
  planoNome: string | null;
  teste: {
    ativo: boolean;
    ate: string;
    aulasUsadas: number;
    aulasLimite: number;
    atividadesUsadas: number;
    atividadesLimite: number;
    diasRestantes: number;
  };
  uso: { percentual: number; mes: string; renovaEm: string | null }; // % do limite de I.A do ciclo; mes = chave do ciclo
  creditos: { saldoCentavos: number; podeComprar: boolean }; // saldo em REAIS pagos (valor que o professor ve)
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
  const [u, a] = await Promise.all([Usuario.findById(usuarioId).lean(), Assinatura.findOne({ usuario: usuarioId }).lean()]);
  if (!u) throw new Error("Usuário não encontrado");
  const ciclo = cicloDeUso(a as never);
  const uso = await UsoMensal.findOne({ usuario: usuarioId, mes: ciclo.chave }).lean();
  const agora = Date.now();
  // Fim do teste: o que estiver salvo ou cadastro + TESTE.dias (contas antigas ganham o prazo novo)
  const criadoEm = new Date((u as { createdAt?: Date }).createdAt ?? u.testeAte).getTime();
  const testeAte = new Date(Math.max(new Date(u.testeAte).getTime(), criadoEm + TESTE.dias * 86400000));
  const diasRestantes = Math.max(0, Math.ceil((testeAte.getTime() - agora) / 86400000));
  // aulas e atividades do teste contam separado: o teste vale enquanto houver prazo e sobrar uma das duas
  const aulasOk = (u.testeAulas ?? 0) < TESTE.aulas;
  const atividadesOk = (u.testeAtividades ?? 0) < TESTE.atividades;
  const testeAtivo = testeAte.getTime() > agora && (aulasOk || atividadesOk);
  const assinante = assinaturaValida(a as never);
  const plano = assinante && a ? planoPorId(a.planoId) : null;
  const limite = plano ? plano.limiteIaCentavos : TESTE.limiteIaCentavos;
  const gasto = uso?.custoCentavos ?? 0;
  const creditos = Math.max(0, u.creditosCentavos ?? 0); // custo real de I.A ainda disponivel nos creditos
  const temCredito = creditos > 0.5;
  const percentual = Math.min(100, Math.round((gasto / limite) * 100));

  let acesso: Situacao["acesso"] = "bloqueado";
  let motivo: string | null = null;
  let porLimite = false;
  if (assinante) {
    acesso = "assinante";
    if (gasto >= limite && !temCredito) {
      acesso = "bloqueado";
      porLimite = true;
      motivo = `Você usou 100% do limite de I.A do plano ${plano?.nome} neste mês. O limite renova em ${ciclo.renovaEm ? ciclo.renovaEm.split("-").reverse().join("/") : "breve"} — ou compre créditos extras / mude para um plano maior.`;
    }
  } else if (testeAtivo) {
    acesso = "teste";
    if (gasto >= limite && !temCredito) {
      acesso = "bloqueado";
      porLimite = true;
      motivo = "O limite de uso do teste grátis acabou. Assine um plano para continuar.";
    }
  } else {
    // acabaram as aulas do teste, mas ainda esta no prazo: conta como limite (deixa terminar a tarefa aberta)
    porLimite = !(a && a.status === "past_due") && testeAte.getTime() > agora && !aulasOk && !atividadesOk;
    motivo =
      a && a.status === "past_due"
        ? "Aguardando o pagamento da assinatura. Assim que for confirmado, o acesso é liberado."
        : porLimite
          ? `Você usou as ${TESTE.aulas} aulas e as ${TESTE.atividades} atividades do teste grátis. Assine um plano para continuar.`
          : "Seu teste grátis terminou. Assine um plano para continuar gerando aulas.";
  }

  return {
    acesso,
    motivo,
    porLimite,
    planoId: plano?.id ?? null,
    planoNome: plano?.nome ?? null,
    teste: {
      ativo: testeAtivo,
      ate: testeAte.toISOString(),
      aulasUsadas: u.testeAulas ?? 0,
      aulasLimite: TESTE.aulas,
      atividadesUsadas: u.testeAtividades ?? 0,
      atividadesLimite: TESTE.atividades,
      diasRestantes,
    },
    uso: { percentual, mes: ciclo.chave, renovaEm: ciclo.renovaEm },
    creditos: { saldoCentavos: Math.floor(creditos / env.creditos.fator), podeComprar: assinante }, // creditos so para quem tem plano ativo (completam o limite do mes)
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

// Tarefas de I.A ("lotes"): uma aula ou a correcao de uma atividade de uma turma.
//  - abrir:     comeca uma tarefa nova. So passa se o professor ainda tem limite.
//  - continuar: mais um passo da MESMA tarefa (ex.: proximo aluno da correcao, formatar a aula gerada).
//               Passa mesmo se o limite acabou no meio, desde que a tarefa esteja aberta e dentro do prazo.
// Assim o limite nunca corta uma aula ou uma turma pela metade; so impede comecar outra.
export const LOTE = {
  aula: { prazoMin: 30 }, // gerar + formatar a mesma aula
  correcao: { prazoMin: 6 * 60 }, // corrigir todos os alunos de uma atividade
};
// Teto de seguranca: terminar a tarefa pode passar do limite, mas no maximo 25% (evita abuso)
const FOLGA_LOTE = 0.25;
const FOLGA_MINIMA = 500; // pelo menos R$ 5 de custo para terminar uma turma no plano menor

export interface OpcoesAcesso {
  abrirLote?: string; // ex.: "aula" ou "correcao:<idAtividade>"
  continuarLote?: string;
  recurso?: "aula" | "atividade"; // no teste gratis, cada um tem sua quantidade
}

const prazoDo = (chave: string) => (chave.startsWith("correcao") ? LOTE.correcao.prazoMin : LOTE.aula.prazoMin) * 60000;

export async function exigirAcesso(usuarioId: string, opcoes: OpcoesAcesso = {}): Promise<Situacao> {
  const s = await situacaoDoUsuario(usuarioId);
  if (s.acesso === "teste" && opcoes.recurso === "aula" && s.teste.aulasUsadas >= s.teste.aulasLimite) {
    throw new SemAcesso(`Você usou as ${s.teste.aulasLimite} aulas do teste grátis. Assine um plano para continuar gerando aulas.`);
  }
  if (s.acesso === "teste" && opcoes.recurso === "atividade" && s.teste.atividadesUsadas >= s.teste.atividadesLimite) {
    throw new SemAcesso(`Você usou as ${s.teste.atividadesLimite} atividades do teste grátis. Assine um plano para continuar gerando e ajustando atividades.`);
  }
  if (s.acesso !== "bloqueado") {
    if (opcoes.abrirLote) {
      // guarda o gasto de agora: se o limite/creditos acabarem no meio, a tarefa termina com uma folga a partir daqui
      const uso = await UsoMensal.findOne({ usuario: usuarioId, mes: s.uso.mes }).lean();
      await Usuario.updateOne(
        { _id: usuarioId },
        { $set: { loteIa: { chave: opcoes.abrirLote, ate: new Date(Date.now() + prazoDo(opcoes.abrirLote)), gasto: uso?.custoCentavos ?? 0 } } }
      ).catch(() => {});
    }
    return s;
  }
  if (opcoes.continuarLote && s.porLimite && (await podeTerminarLote(usuarioId, opcoes.continuarLote))) return s;
  throw new SemAcesso(
    opcoes.abrirLote?.startsWith("correcao") && s.porLimite
      ? `${s.motivo} A correção com foto de outra atividade fica bloqueada — você pode corrigir à mão.`
      : (s.motivo ?? "Assine um plano para continuar.")
  );
}

async function podeTerminarLote(usuarioId: string, chave: string) {
  const [u, a] = await Promise.all([
    Usuario.findById(usuarioId, { loteIa: 1, creditosCentavos: 1 }).lean(),
    Assinatura.findOne({ usuario: usuarioId }).lean(),
  ]);
  const uso = await UsoMensal.findOne({ usuario: usuarioId, mes: cicloDeUso(a as never).chave }).lean();
  const lote = u?.loteIa;
  if (!lote?.chave || lote.chave !== chave || !lote.ate || new Date(lote.ate).getTime() < Date.now()) return false;
  const plano = assinaturaValida(a as never) && a ? planoPorId(a.planoId) : null;
  const limite = plano ? plano.limiteIaCentavos : TESTE.limiteIaCentavos;
  const base = Math.max(limite, lote.gasto ?? 0); // onde a tarefa estava quando o limite (ou os creditos) acabou
  return (uso?.custoCentavos ?? 0) < base + Math.max(limite * FOLGA_LOTE, FOLGA_MINIMA);
}

// Fecha a tarefa (ex.: correcao da turma concluida)
export async function fecharLote(usuarioId: string, chave: string) {
  await Usuario.updateOne({ _id: usuarioId, "loteIa.chave": chave }, { $set: { loteIa: { chave: null, ate: null, gasto: 0 } } }).catch(() => {});
}

// Acoes SEM I.A (correcao manual, lancar notas, salvar): liberadas mesmo com o limite de I.A esgotado.
// So bloqueia quem nao tem plano/teste (teste vencido, pagamento pendente...).
export async function exigirConta(usuarioId: string): Promise<Situacao> {
  const s = await situacaoDoUsuario(usuarioId);
  if (s.acesso === "bloqueado" && !s.porLimite) throw new SemAcesso(s.motivo ?? "Assine um plano para continuar.");
  return s;
}

// Correcao com foto (I.A): so Profissional e Premium. Correcao a mao e lancar notas (sem I.A) valem em todos (e no teste).
export const PLANOS_FOTO = ["profissional", "premium"];
export async function exigirPlanoPago(usuarioId: string): Promise<Situacao> {
  const s = await situacaoDoUsuario(usuarioId);
  if (s.planoId && PLANOS_FOTO.includes(s.planoId)) return s;
  throw new SemAcesso(
    s.planoId
      ? "A correção com foto (I.A) é dos planos Profissional e Premium. No seu plano você pode corrigir à mão e lançar as notas — ou mude de plano."
      : s.acesso === "teste"
        ? "A correção com foto (I.A) é dos planos Profissional e Premium. No teste grátis você pode corrigir à mão e lançar as notas."
        : (s.motivo ?? "Assine um plano para corrigir atividades e lançar notas.")
  );
}
