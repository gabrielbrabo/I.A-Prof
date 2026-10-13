import { Schema, model } from "mongoose";

// Assinatura do professor (uma por usuario)
const assinaturaSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, unique: true },
    planoId: { type: String, required: true },
    ciclo: { type: String, enum: ["mensal", "anual"], default: "mensal" },
    metodo: { type: String, enum: ["PIX", "CREDIT_CARD"], default: "PIX" },
    status: { type: String, enum: ["none", "active", "past_due", "canceled"], default: "none" },
    providerCustomerId: { type: String, default: null },
    providerSubscriptionId: { type: String, default: null },
    checkoutUrl: { type: String, default: null }, // fatura do Asaas (PIX)
    periodoFim: { type: Date, default: null },
    cancelarNoFim: { type: Boolean, default: false },
    cartaoFinal: { type: String, default: null },
    cartaoBandeira: { type: String, default: null },
    ultimoEvento: { type: String, default: null }, // idempotencia do webhook
  },
  { timestamps: true }
);

export const Assinatura = model("Assinatura", assinaturaSchema);
