// Interface do gateway de pagamento (Asaas hoje; trocar de gateway = novo adapter)
export interface DadosCartao {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}
export interface DadosTitular {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface CriarAssinatura {
  cliente: { nome: string; email: string; cpfCnpj: string; telefone?: string };
  valorCentavos: number;
  ciclo: "mensal" | "anual";
  metodo: "PIX" | "CREDIT_CARD";
  descricao: string;
  cartao?: DadosCartao;
  titular?: DadosTitular;
  ip?: string;
}

export interface ResultadoAssinatura {
  customerId: string;
  subscriptionId: string;
  status: "active" | "past_due";
  checkoutUrl: string | null;
  periodoFim: Date | null;
  cartaoFinal?: string | null;
  cartaoBandeira?: string | null;
}

export interface DadosPix {
  imagem: string; // PNG em base64 (QR Code)
  copiaECola: string; // codigo "copia e cola"
  expira: string | null;
  valorCentavos: number | null;
}

// Cobranca unica (creditos extras)
export interface CriarCobranca {
  cliente: { nome: string; email: string; cpfCnpj: string; telefone?: string };
  valorCentavos: number;
  metodo: "PIX" | "CREDIT_CARD";
  descricao: string;
  referencia: string; // id interno da compra
  cartao?: DadosCartao;
  titular?: DadosTitular;
  ip?: string;
}
export interface ResultadoCobranca {
  paymentId: string;
  pago: boolean;
  checkoutUrl: string | null;
}

export interface Gateway {
  criarCobranca(d: CriarCobranca): Promise<ResultadoCobranca>;
  pixCobranca?(paymentId: string): Promise<DadosPix | null>;
  cobrancaPaga(paymentId: string): Promise<boolean | null>; // null = cancelada/estornada
  pix?(subscriptionId: string): Promise<DadosPix | null>;
  criarAssinatura(d: CriarAssinatura): Promise<ResultadoAssinatura>;
  consultarStatus(subscriptionId: string): Promise<"active" | "past_due" | "canceled" | null>;
  cancelar(subscriptionId: string, fimEm: Date | null): Promise<void>;
  reativar(subscriptionId: string, proximoVencimento: Date): Promise<void>;
}
