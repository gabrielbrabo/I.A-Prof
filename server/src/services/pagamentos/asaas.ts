import { env } from "../../config/env";
import { CriarAssinatura, CriarCobranca, DadosPix, Gateway, ResultadoAssinatura, ResultadoCobranca } from "./tipos";

// Adapter do Asaas (https://docs.asaas.com). Valores em REAIS na API.
async function asaas<T>(caminho: string, opcoes: { method?: string; body?: unknown } = {}): Promise<T> {
  const resp = await fetch(`${env.payments.asaasBaseUrl}${caminho}`, {
    method: opcoes.method ?? "GET",
    headers: { "Content-Type": "application/json", access_token: env.payments.asaasKey, "User-Agent": "iaprof" },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const dados = (await resp.json().catch(() => ({}))) as { errors?: Array<{ description?: string }> } & T;
  if (!resp.ok) {
    const msg = dados.errors?.map((e) => e.description).filter(Boolean).join(" ") || `Erro ${resp.status} no Asaas`;
    throw new Error(msg);
  }
  return dados;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const somarCiclo = (d: Date, ciclo: "mensal" | "anual") => {
  const n = new Date(d);
  if (ciclo === "anual") n.setFullYear(n.getFullYear() + 1);
  else n.setMonth(n.getMonth() + 1);
  return n;
};

const PAGO = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"];

// Cliente: reaproveita pelo CPF/CNPJ
async function clienteAsaas(c: CriarAssinatura["cliente"]) {
  const doc = c.cpfCnpj.replace(/\D/g, "");
  const busca = await asaas<{ data: Array<{ id: string }> }>(`/customers?cpfCnpj=${doc}`);
  return (
    busca.data?.[0]?.id ??
    (
      await asaas<{ id: string }>("/customers", {
        method: "POST",
        body: { name: c.nome, email: c.email, cpfCnpj: doc, mobilePhone: c.telefone?.replace(/\D/g, "") || undefined },
      })
    ).id
  );
}

function dadosCartao(d: Pick<CriarAssinatura, "cartao" | "titular" | "ip">) {
  if (!d.cartao || !d.titular) throw new Error("Informe os dados do cartão.");
  return {
    creditCard: d.cartao,
    creditCardHolderInfo: { ...d.titular, cpfCnpj: d.titular.cpfCnpj.replace(/\D/g, ""), postalCode: d.titular.postalCode.replace(/\D/g, ""), phone: d.titular.phone.replace(/\D/g, "") },
    remoteIp: d.ip,
  };
}

export const gatewayAsaas: Gateway = {
  // Cobranca unica (creditos extras)
  async criarCobranca(d: CriarCobranca): Promise<ResultadoCobranca> {
    const customerId = await clienteAsaas(d.cliente);
    const body: Record<string, unknown> = {
      customer: customerId,
      billingType: d.metodo,
      value: d.valorCentavos / 100,
      dueDate: hoje(),
      description: d.descricao,
      externalReference: d.referencia,
      ...(d.metodo === "CREDIT_CARD" ? dadosCartao(d) : {}),
    };
    const pg = await asaas<{ id: string; status: string; invoiceUrl?: string }>("/payments", { method: "POST", body });
    return { paymentId: pg.id, pago: PAGO.includes(pg.status), checkoutUrl: pg.invoiceUrl ?? null };
  },

  async pixCobranca(paymentId): Promise<DadosPix | null> {
    const pg = await asaas<{ status: string; value: number }>(`/payments/${paymentId}`);
    if (!["PENDING", "OVERDUE"].includes(pg.status)) return null;
    const qr = await asaas<{ encodedImage: string; payload: string; expirationDate?: string }>(`/payments/${paymentId}/pixQrCode`);
    return { imagem: qr.encodedImage, copiaECola: qr.payload, expira: qr.expirationDate ?? null, valorCentavos: Math.round((pg.value ?? 0) * 100) };
  },

  async cobrancaPaga(paymentId) {
    const pg = await asaas<{ status: string; deleted?: boolean }>(`/payments/${paymentId}`);
    if (pg.deleted || ["REFUNDED", "REFUND_REQUESTED", "CHARGEBACK_REQUESTED"].includes(pg.status)) return null;
    return PAGO.includes(pg.status);
  },

  async criarAssinatura(d: CriarAssinatura): Promise<ResultadoAssinatura> {
    const customerId = await clienteAsaas(d.cliente);

    const body: Record<string, unknown> = {
      customer: customerId,
      billingType: d.metodo,
      value: d.valorCentavos / 100,
      nextDueDate: hoje(),
      cycle: d.ciclo === "anual" ? "YEARLY" : "MONTHLY",
      description: d.descricao,
    };
    if (d.metodo === "CREDIT_CARD") Object.assign(body, dadosCartao(d));
    const sub = await asaas<{ id: string; status: string; creditCard?: { creditCardNumber?: string; creditCardBrand?: string } }>("/subscriptions", {
      method: "POST",
      body,
    });

    // Primeira cobranca: link da fatura (PIX) e se ja foi paga (cartao)
    const cobr = await asaas<{ data: Array<{ status: string; invoiceUrl: string }> }>(`/subscriptions/${sub.id}/payments`).catch(() => ({ data: [] }));
    const primeira = cobr.data?.[0];
    const pago = ["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(primeira?.status ?? "");
    return {
      customerId,
      subscriptionId: sub.id,
      status: pago ? "active" : "past_due",
      checkoutUrl: primeira?.invoiceUrl ?? null,
      periodoFim: somarCiclo(new Date(), d.ciclo),
      cartaoFinal: sub.creditCard?.creditCardNumber ?? (d.cartao ? d.cartao.number.slice(-4) : null),
      cartaoBandeira: sub.creditCard?.creditCardBrand ?? null,
    };
  },

  // QR Code PIX da cobranca em aberto da assinatura (para pagar direto na tela do app)
  async pix(subscriptionId): Promise<DadosPix | null> {
    const cobr = await asaas<{ data: Array<{ id: string; status: string; value: number }> }>(`/subscriptions/${subscriptionId}/payments`);
    const aberta = cobr.data?.find((c) => ["PENDING", "OVERDUE"].includes(c.status));
    if (!aberta) return null;
    const qr = await asaas<{ encodedImage: string; payload: string; expirationDate?: string }>(`/payments/${aberta.id}/pixQrCode`);
    return { imagem: qr.encodedImage, copiaECola: qr.payload, expira: qr.expirationDate ?? null, valorCentavos: Math.round((aberta.value ?? 0) * 100) };
  },

  async consultarStatus(subscriptionId) {
    const sub = await asaas<{ status: string; deleted?: boolean }>(`/subscriptions/${subscriptionId}`);
    if (sub.deleted || sub.status === "INACTIVE" || sub.status === "EXPIRED") return "canceled";
    const cobr = await asaas<{ data: Array<{ status: string }> }>(`/subscriptions/${subscriptionId}/payments`);
    const ultima = cobr.data?.[0]?.status ?? "";
    if (["CONFIRMED", "RECEIVED", "RECEIVED_IN_CASH"].includes(ultima)) return "active";
    if (["PENDING", "OVERDUE"].includes(ultima)) return "past_due";
    return null;
  },

  async cancelar(subscriptionId, fimEm) {
    // Para de renovar mas mantem o periodo ja pago
    if (fimEm) await asaas(`/subscriptions/${subscriptionId}`, { method: "PUT", body: { endDate: fimEm.toISOString().slice(0, 10), updatePendingPayments: false } });
    else await asaas(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
  },

  async reativar(subscriptionId, proximoVencimento) {
    await asaas(`/subscriptions/${subscriptionId}`, {
      method: "PUT",
      body: { status: "ACTIVE", nextDueDate: proximoVencimento.toISOString().slice(0, 10), endDate: null },
    });
  },
};
