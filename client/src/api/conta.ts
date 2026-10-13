import { api } from "./client";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export interface Situacao {
  acesso: "teste" | "assinante" | "bloqueado";
  motivo: string | null;
  planoId: string | null;
  planoNome: string | null;
  teste: { ativo: boolean; ate: string; aulasUsadas: number; aulasLimite: number; diasRestantes: number };
  uso: { percentual: number; mes: string };
  assinatura: {
    status: "none" | "active" | "past_due" | "canceled";
    ciclo: "mensal" | "anual" | null;
    metodo: "PIX" | "CREDIT_CARD" | null;
    periodoFim: string | null;
    cancelarNoFim: boolean;
    checkoutUrl: string | null;
    cartao: string | null;
  } | null;
}

export interface PlanoVenda {
  id: "essencial" | "profissional" | "premium";
  nome: string;
  precoMensal: number; // centavos
  precoAnual: number;
  destaque: boolean;
  recursos: string[];
}

export interface DadosPix {
  imagem: string; // PNG base64
  copiaECola: string;
  expira: string | null;
  valorCentavos: number | null;
}

export const contaApi = {
  cadastro: (b: { nome: string; email: string; senha: string }) =>
    api<{ token: string; usuario: Usuario }>("/auth/cadastro", { method: "POST", body: JSON.stringify(b) }),
  login: (b: { email: string; senha: string }) => api<{ token: string; usuario: Usuario }>("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  eu: () => api<{ usuario: Usuario; situacao: Situacao }>("/auth/eu"),
  google: (credential: string) => api<{ token: string; usuario: Usuario }>("/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  configAuth: () => api<{ googleClientId: string | null }>("/auth/config"),
};

export const assinaturaApi = {
  planos: () => api<{ pagamentosLigados: boolean; planos: PlanoVenda[] }>("/assinatura/planos"),
  minha: () => api<Situacao>("/assinatura"),
  assinar: (b: {
    planoId: PlanoVenda["id"];
    ciclo: "mensal" | "anual";
    metodo: "PIX" | "CREDIT_CARD";
    cpfCnpj: string;
    telefone?: string;
    cartao?: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
    titular?: { postalCode: string; addressNumber: string; phone: string };
  }) => api<{ checkoutUrl: string | null; pix: DadosPix | null; pixErro?: string | null; situacao: Situacao }>("/assinatura", { method: "POST", body: JSON.stringify(b) }),
  pix: () => api<{ pix: DadosPix | null; erro?: string | null }>("/assinatura/pix"),
  atualizar: () => api<Situacao>("/assinatura/atualizar", { method: "POST" }),
  cancelar: () => api<Situacao>("/assinatura/cancelar", { method: "POST" }),
  reativar: () => api<Situacao>("/assinatura/reativar", { method: "POST" }),
};

export const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
