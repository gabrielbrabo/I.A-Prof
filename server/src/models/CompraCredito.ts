import { Schema, model } from "mongoose";

// Compra avulsa de creditos de I.A (cobranca unica no Asaas)
const compraSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    valorCentavos: { type: Number, required: true }, // valor pago pelo professor
    creditoCentavos: { type: Number, required: true }, // custo real de I.A liberado (valor x fator)
    metodo: { type: String, enum: ["PIX", "CREDIT_CARD"], required: true },
    status: { type: String, enum: ["pendente", "pago", "cancelado"], default: "pendente" },
    providerPaymentId: { type: String, default: null, index: true },
    checkoutUrl: { type: String, default: null },
    pagoEm: { type: Date, default: null },
  },
  { timestamps: true }
);

export const CompraCredito = model("CompraCredito", compraSchema);
