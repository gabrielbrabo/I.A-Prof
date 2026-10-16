import { Schema, model } from "mongoose";

// Consumo de I.A do professor no mes (custo real da API, em centavos de real)
const usoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    mes: { type: String, required: true }, // ciclo: "c2026-10-20" (assinante, renova no dia da assinatura) ou "teste"
    custoCentavos: { type: Number, default: 0 },
    chamadas: { type: Number, default: 0 },
    aulas: { type: Number, default: 0 },
    atividades: { type: Number, default: 0 },
    correcoes: { type: Number, default: 0 },
  },
  { timestamps: true }
);
usoSchema.index({ usuario: 1, mes: 1 }, { unique: true });

export const UsoMensal = model("UsoMensal", usoSchema);
