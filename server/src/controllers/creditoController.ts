import { Request, Response } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { CompraCredito } from "../models/CompraCredito";
import { Usuario } from "../models/Usuario";
import { gateway } from "../services/pagamentos";
import { situacaoDoUsuario } from "../services/uso";

// Creditos extras de I.A: o professor escolhe um valor em reais e paga uma vez (PIX ou cartao).
// O saldo nao vence e so e usado depois que o limite do plano no mes acaba.

// Libera os creditos de uma compra paga (uma vez so, mesmo se o webhook chegar repetido)
export async function creditarCompra(compraId: string) {
  const c = await CompraCredito.findOneAndUpdate({ _id: compraId, status: "pendente" }, { $set: { status: "pago", pagoEm: new Date() } }, { new: true });
  if (c) await Usuario.updateOne({ _id: c.usuario }, { $inc: { creditosCentavos: c.creditoCentavos } });
  return !!c;
}

const resumo = (c: { _id: unknown; valorCentavos: number; metodo: string; status: string; createdAt?: Date; pagoEm?: Date | null; checkoutUrl?: string | null }) => ({
  id: String(c._id),
  valorCentavos: c.valorCentavos,
  metodo: c.metodo,
  status: c.status,
  criadoEm: c.createdAt ? new Date(c.createdAt).toISOString() : null,
  pagoEm: c.pagoEm ? new Date(c.pagoEm).toISOString() : null,
  checkoutUrl: c.checkoutUrl ?? null,
});

// GET /api/creditos -> saldo, limites de valor e ultimas compras
export async function meus(req: Request, res: Response) {
  const [s, compras] = await Promise.all([
    situacaoDoUsuario(req.usuarioId!),
    CompraCredito.find({ usuario: req.usuarioId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);
  res.json({
    saldoCentavos: s.creditos.saldoCentavos,
    podeComprar: s.creditos.podeComprar,
    minimoCentavos: env.creditos.minimoCentavos,
    maximoCentavos: env.creditos.maximoCentavos,
    compras: compras.map(resumo),
  });
}

const comprarSchema = z.object({
  valorCentavos: z.number().int(),
  metodo: z.enum(["PIX", "CREDIT_CARD"]),
  cpfCnpj: z.string().min(11, "Informe o CPF ou CNPJ"),
  telefone: z.string().optional(),
  cartao: z.object({ holderName: z.string(), number: z.string(), expiryMonth: z.string(), expiryYear: z.string(), ccv: z.string() }).optional(),
  titular: z.object({ postalCode: z.string(), addressNumber: z.string(), phone: z.string() }).optional(),
});

// POST /api/creditos -> cria a cobranca unica
export async function comprar(req: Request, res: Response) {
  const p = comprarSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ message: p.error.issues[0]?.message ?? "Dados inválidos" });
  const { minimoCentavos, maximoCentavos, fator } = env.creditos;
  const real = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (p.data.valorCentavos < minimoCentavos || p.data.valorCentavos > maximoCentavos) {
    return res.status(400).json({ message: `Escolha um valor entre ${real(minimoCentavos)} e ${real(maximoCentavos)}.` });
  }
  const u = await Usuario.findById(req.usuarioId);
  if (!u) return res.status(401).json({ message: "Faça login de novo." });

  const compra = await CompraCredito.create({
    usuario: u._id,
    valorCentavos: p.data.valorCentavos,
    creditoCentavos: Math.round(p.data.valorCentavos * fator),
    metodo: p.data.metodo,
  });
  try {
    const r = await gateway().criarCobranca({
      cliente: { nome: u.nome, email: u.email, cpfCnpj: p.data.cpfCnpj, telefone: p.data.telefone },
      valorCentavos: p.data.valorCentavos,
      metodo: p.data.metodo,
      descricao: `I.A Prof — créditos extras de uso (${real(p.data.valorCentavos)})`,
      referencia: `credito:${compra._id}`,
      cartao: p.data.cartao,
      titular: p.data.titular ? { ...p.data.titular, name: p.data.cartao?.holderName ?? u.nome, email: u.email, cpfCnpj: p.data.cpfCnpj } : undefined,
      ip: req.ip,
    });
    compra.providerPaymentId = r.paymentId;
    compra.checkoutUrl = r.checkoutUrl;
    await compra.save();
    if (r.pago) await creditarCompra(String(compra._id));
    const pix = !r.pago && p.data.metodo === "PIX" ? await buscarPix(r.paymentId) : { pix: null, erro: null };
    const atual = await CompraCredito.findById(compra._id).lean();
    res.json({ compra: resumo(atual!), pix: pix.pix, pixErro: pix.erro, situacao: await situacaoDoUsuario(req.usuarioId!) });
  } catch (e) {
    compra.status = "cancelado";
    await compra.save();
    res.status(400).json({ message: e instanceof Error ? e.message : "Não foi possível criar a cobrança" });
  }
}

async function buscarPix(paymentId: string) {
  const g = gateway();
  if (!g.pixCobranca) return { pix: null, erro: null };
  let erro: string | null = null;
  for (let t = 0; t < 3; t++) {
    try {
      const pix = await g.pixCobranca(paymentId);
      if (pix) return { pix, erro: null };
      erro = "A cobrança PIX ainda está sendo gerada. Aguarde alguns segundos.";
    } catch (e) {
      erro = e instanceof Error ? e.message : "Não foi possível gerar o QR Code do PIX.";
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { pix: null, erro };
}

// GET /api/creditos/:id/pix -> QR Code da compra em aberto
export async function pix(req: Request, res: Response) {
  const c = await CompraCredito.findOne({ _id: req.params.id, usuario: req.usuarioId }).lean();
  if (!c || c.status !== "pendente" || !c.providerPaymentId) return res.json({ pix: null, erro: null });
  res.json(await buscarPix(c.providerPaymentId));
}

// POST /api/creditos/:id/atualizar -> pergunta ao gateway se o pagamento caiu
export async function atualizar(req: Request, res: Response) {
  const c = await CompraCredito.findOne({ _id: req.params.id, usuario: req.usuarioId });
  if (!c) return res.status(404).json({ message: "Compra não encontrada." });
  if (c.status === "pendente" && c.providerPaymentId) {
    const pago = await gateway().cobrancaPaga(c.providerPaymentId).catch(() => false);
    if (pago) await creditarCompra(String(c._id));
    else if (pago === null) {
      c.status = "cancelado";
      await c.save();
    }
  }
  const atual = await CompraCredito.findById(c._id).lean();
  res.json({ compra: resumo(atual!), situacao: await situacaoDoUsuario(req.usuarioId!) });
}
