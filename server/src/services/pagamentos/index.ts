import { pagamentosLigados } from "../../config/env";
import { gatewayAsaas } from "./asaas";
import { Gateway } from "./tipos";

// Modo desenvolvimento (sem PAYMENTS_PROVIDER): assinatura ativa na hora, nada e cobrado
const gatewayDev: Gateway = {
  async criarAssinatura(d) {
    const fim = new Date();
    if (d.ciclo === "anual") fim.setFullYear(fim.getFullYear() + 1);
    else fim.setMonth(fim.getMonth() + 1);
    return { customerId: "dev", subscriptionId: `dev-${Date.now()}`, status: "active", checkoutUrl: null, periodoFim: fim, cartaoFinal: d.cartao?.number.slice(-4) ?? null };
  },
  async consultarStatus() {
    return "active";
  },
  async criarCobranca() {
    return { paymentId: `dev-pay-${Date.now()}`, pago: true, checkoutUrl: null };
  },
  async cobrancaPaga() {
    return true;
  },
  async cancelar() {},
  async reativar() {},
};

export const gateway = (): Gateway => (pagamentosLigados() ? gatewayAsaas : gatewayDev);
