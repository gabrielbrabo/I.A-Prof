import { Request, Response } from "express";
import { z } from "zod";
import { pagamentosLigados, env } from "../config/env";
import { PLANOS, planoPorId, precoDoCiclo } from "../config/planos";
import { Assinatura } from "../models/Assinatura";
import { Usuario } from "../models/Usuario";
import { gateway } from "../services/pagamentos";
import { CompraCredito } from "../models/CompraCredito";
import { creditarCompra } from "./creditoController";
import { assinaturaValida, situacaoDoUsuario } from "../services/uso";

// GET /api/assinatura/planos -> planos (precos em centavos) — o limite de I.A nao e exibido
export async function planos(_req: Request, res: Response) {
  res.json({
    pagamentosLigados: pagamentosLigados(),
    planos: PLANOS.map((p) => ({ id: p.id, nome: p.nome, precoMensal: p.precoMensal, precoAnual: precoDoCiclo(p, "anual"), destaque: !!p.destaque, recursos: p.recursos })),
  });
}

// GET /api/assinatura -> situacao do professor
export async function minha(req: Request, res: Response) {
  res.json(await situacaoDoUsuario(req.usuarioId!));
}

const assinarSchema = z.object({
  planoId: z.enum(["essencial", "profissional", "premium"]),
  ciclo: z.enum(["mensal", "anual"]),
  metodo: z.enum(["PIX", "CREDIT_CARD"]),
  cpfCnpj: z.string().min(11, "Informe o CPF ou CNPJ"),
  telefone: z.string().optional(),
  cartao: z
    .object({ holderName: z.string(), number: z.string(), expiryMonth: z.string(), expiryYear: z.string(), ccv: z.string() })
    .optional(),
  titular: z.object({ postalCode: z.string(), addressNumber: z.string(), phone: z.string() }).optional(),
});

// POST /api/assinatura -> assina (ou troca de plano)
export async function assinar(req: Request, res: Response) {
  const p = assinarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const plano = planoPorId(p.data.planoId)!;
  const u = await Usuario.findById(req.usuarioId);
  if (!u) return res.status(401).json({ message: "Faça login de novo." });
  const atual = await Assinatura.findOne({ usuario: u._id });
  // Ja paga o mesmo plano: nao cobra de novo
  if (atual && assinaturaValida(atual) && atual.planoId === plano.id && !atual.cancelarNoFim) {
    return res.status(409).json({ message: `Você já assina o plano ${plano.nome}.` });
  }
  try {
    // Troca de plano: encerra a assinatura anterior no gateway antes de criar a nova
    if (atual?.providerSubscriptionId && atual.status !== "canceled") {
      await gateway().cancelar(atual.providerSubscriptionId, null).catch(() => {});
    }
    const r = await gateway().criarAssinatura({
      cliente: { nome: u.nome, email: u.email, cpfCnpj: p.data.cpfCnpj, telefone: p.data.telefone },
      valorCentavos: precoDoCiclo(plano, p.data.ciclo),
      ciclo: p.data.ciclo,
      metodo: p.data.metodo,
      descricao: `I.A Prof — plano ${plano.nome} (${p.data.ciclo})`,
      cartao: p.data.cartao,
      titular: p.data.titular ? { ...p.data.titular, name: p.data.cartao?.holderName ?? u.nome, email: u.email, cpfCnpj: p.data.cpfCnpj } : undefined,
      ip: req.ip,
    });
    const doc = await Assinatura.findOneAndUpdate(
      { usuario: u._id },
      {
        usuario: u._id,
        planoId: plano.id,
        ciclo: p.data.ciclo,
        metodo: p.data.metodo,
        status: r.status,
        providerCustomerId: r.customerId,
        providerSubscriptionId: r.subscriptionId,
        checkoutUrl: r.checkoutUrl,
        periodoFim: r.periodoFim,
        inicioCiclo: r.status === "active" ? new Date() : null, // PIX: comeca quando o pagamento confirmar
        cancelarNoFim: false,
        cartaoFinal: r.cartaoFinal ?? null,
        cartaoBandeira: r.cartaoBandeira ?? null,
      },
      { upsert: true, new: true }
    );
    // PIX: ja devolve o QR Code e o copia-e-cola para pagar na propria tela
    const r2 =
      doc.status === "past_due" && doc.metodo === "PIX" && doc.providerSubscriptionId ? await buscarPix(doc.providerSubscriptionId) : { pix: null, erro: null };
    res.json({ checkoutUrl: doc.checkoutUrl, pix: r2.pix, pixErro: r2.erro, situacao: await situacaoDoUsuario(String(u._id)) });
  } catch (e) {
    res.status(400).json({ message: e instanceof Error ? e.message : "Não foi possível criar a assinatura" });
  }
}

// QR Code do PIX em aberto. Logo apos criar a assinatura o Asaas pode levar alguns segundos para gerar a cobranca:
// tenta algumas vezes antes de desistir. Devolve o motivo quando nao consegue (ex.: conta sem chave PIX).
async function buscarPix(subscriptionId: string): Promise<{ pix: Awaited<ReturnType<NonNullable<ReturnType<typeof gateway>["pix"]>>>; erro: string | null }> {
  const g = gateway();
  if (!g.pix) return { pix: null, erro: null };
  let erro: string | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const pix = await g.pix(subscriptionId);
      if (pix) return { pix, erro: null };
      erro = "A cobrança PIX ainda está sendo gerada. Aguarde alguns segundos.";
    } catch (e) {
      erro = e instanceof Error ? e.message : "Não foi possível gerar o QR Code do PIX.";
      console.error("[assinatura/pix]", erro);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { pix: null, erro };
}

// GET /api/assinatura/pix -> QR Code PIX da cobranca em aberto
export async function pix(req: Request, res: Response) {
  const a = await Assinatura.findOne({ usuario: req.usuarioId });
  if (!a || a.status !== "past_due" || !a.providerSubscriptionId) return res.json({ pix: null, erro: null });
  res.json(await buscarPix(a.providerSubscriptionId));
}

// POST /api/assinatura/atualizar -> pergunta ao gateway se o pagamento caiu (PIX sem webhook)
export async function atualizar(req: Request, res: Response) {
  const a = await Assinatura.findOne({ usuario: req.usuarioId });
  if (a?.providerSubscriptionId && a.status !== "canceled") {
    const st = await gateway().consultarStatus(a.providerSubscriptionId).catch(() => null);
    if (st && st !== a.status && !(st === "canceled" && a.cancelarNoFim)) {
      a.status = st;
      await a.save();
    }
  }
  res.json(await situacaoDoUsuario(req.usuarioId!));
}

// POST /api/assinatura/cancelar -> para de renovar; acesso continua ate o fim do periodo pago
export async function cancelar(req: Request, res: Response) {
  const a = await Assinatura.findOne({ usuario: req.usuarioId });
  if (!a || a.status === "canceled") return res.status(400).json({ message: "Não há assinatura ativa." });
  if (a.providerSubscriptionId) await gateway().cancelar(a.providerSubscriptionId, a.periodoFim ?? null).catch(() => {});
  if (a.status === "active" && a.periodoFim && a.periodoFim.getTime() > Date.now()) a.cancelarNoFim = true;
  else a.status = "canceled";
  await a.save();
  res.json(await situacaoDoUsuario(req.usuarioId!));
}

// POST /api/assinatura/reativar -> desfaz o cancelamento (sem cobrar de novo)
export async function reativar(req: Request, res: Response) {
  const a = await Assinatura.findOne({ usuario: req.usuarioId });
  if (!a || !a.cancelarNoFim || !assinaturaValida(a)) return res.status(400).json({ message: "Não há cancelamento para desfazer." });
  if (a.providerSubscriptionId && a.periodoFim) await gateway().reativar(a.providerSubscriptionId, a.periodoFim);
  a.cancelarNoFim = false;
  await a.save();
  res.json(await situacaoDoUsuario(req.usuarioId!));
}

// POST /api/webhooks/pagamentos -> eventos do Asaas (pagamento confirmado/atrasado/assinatura apagada)
export async function webhook(req: Request, res: Response) {
  if (env.payments.webhookSecret && req.headers["asaas-access-token"] !== env.payments.webhookSecret) {
    return res.status(401).json({ message: "token inválido" });
  }
  const ev = req.body as { id?: string; event?: string; payment?: { id?: string; subscription?: string; dueDate?: string }; subscription?: { id?: string } };
  const subId = ev.payment?.subscription ?? ev.subscription?.id;
  if (!subId) {
    // cobranca avulsa: compra de creditos extras
    if (ev.payment?.id && (ev.event === "PAYMENT_CONFIRMED" || ev.event === "PAYMENT_RECEIVED")) {
      const c = await CompraCredito.findOne({ providerPaymentId: ev.payment.id }).lean();
      if (c) await creditarCompra(String(c._id));
    }
    return res.json({ ok: true });
  }
  const a = await Assinatura.findOne({ providerSubscriptionId: subId });
  if (!a || (ev.id && a.ultimoEvento === ev.id)) return res.json({ ok: true });
  if (ev.event === "PAYMENT_CONFIRMED" || ev.event === "PAYMENT_RECEIVED") {
    a.status = "active";
    const base = ev.payment?.dueDate ? new Date(ev.payment.dueDate) : new Date();
    const fim = new Date(base);
    if (a.ciclo === "anual") fim.setFullYear(fim.getFullYear() + 1);
    else fim.setMonth(fim.getMonth() + 1);
    a.periodoFim = fim;
  } else if (ev.event === "PAYMENT_OVERDUE") {
    a.status = "past_due";
  } else if (ev.event === "SUBSCRIPTION_DELETED" || ev.event === "SUBSCRIPTION_INACTIVATED") {
    if (!a.cancelarNoFim) a.status = "canceled";
  }
  a.ultimoEvento = ev.id ?? null;
  await a.save();
  res.json({ ok: true });
}
