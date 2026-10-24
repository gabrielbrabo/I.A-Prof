import { Schema, model } from "mongoose";

// Plano de curso OFICIAL de um estado (ex.: Plano de Curso da SEE-MG), por serie e periodo.
// Usado quando o professor nao cadastrou o proprio plano de curso. Importado por scripts/importPlanoBase.ts.
const itemSchema = new Schema(
  {
    componente: { type: String, required: true },
    codigo: { type: String, required: true },
    habilidade: { type: String, required: true },
    conteudo: { type: String, default: null }, // objeto de conhecimento
  },
  { _id: false }
);
const periodoSchema = new Schema({ numero: { type: Number, required: true }, itens: { type: [itemSchema], default: [] } }, { _id: false });

const planoBaseSchema = new Schema(
  {
    uf: { type: String, required: true, uppercase: true }, // "MG"
    ano: { type: String, required: true }, // serie: "1".."9"
    anoLetivo: { type: Number, required: true }, // ano do documento oficial (usa o mais recente ate o ano pedido)
    fonte: { type: String, required: true }, // ex.: "Plano de Curso SEE-MG 2026"
    tipoPeriodo: { type: String, enum: ["bimestre", "trimestre", "semestre"], default: "bimestre" },
    periodos: { type: [periodoSchema], default: [] },
  },
  { timestamps: true }
);
planoBaseSchema.index({ uf: 1, ano: 1, anoLetivo: -1 }, { unique: true });

export const PlanoBase = model("PlanoBase", planoBaseSchema);
