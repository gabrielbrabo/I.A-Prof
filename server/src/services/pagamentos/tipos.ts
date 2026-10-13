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

export interface Gateway {
  pix?(subscriptionId: string): Promise<DadosPix | null>;
  criarAssinatura(d: CriarAssinatura): Promise<ResultadoAssinatura>;
  consultarStatus(subscriptionId: string): Promise<"active" | "past_due" | "canceled" | null>;
  cancelar(subscriptionId: string, fimEm: Date | null): Promise<void>;
  reativar(subscriptionId: string, proximoVencimento: Date): Promise<void>;
}
