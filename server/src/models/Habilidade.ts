import { Schema, model, InferSchemaType } from "mongoose";

// Habilidade curricular: BNCC (uf = null) ou curriculo estadual/municipal (uf = "MG", "SP"...)
// anos: "1".."9" (fundamental), "EI01"/"EI02"/"EI03" (infantil), "EM" (medio)
const habilidadeSchema = new Schema(
  {
    codigo: { type: String, required: true, unique: true, trim: true },
    fonte: { type: String, required: true, default: "BNCC" }, // BNCC, CRMG, CURRICULO-SP...
    uf: { type: String, default: null }, // null = vale para o Brasil todo
    etapa: { type: String, default: null },
    anos: { type: [String], required: true, index: true },
    componente: { type: String, required: true, index: true },
    habilidade: { type: String, required: true },
    unidadeTematica: { type: String, default: null },
    objetoConhecimento: { type: String, default: null },
  },
  { timestamps: true }
);

// Busca textual em portugues (usada para ranquear candidatas)
habilidadeSchema.index(
  { habilidade: "text", objetoConhecimento: "text", unidadeTematica: "text" },
  { default_language: "portuguese", weights: { objetoConhecimento: 3, unidadeTematica: 2, habilidade: 1 } }
);

export type HabilidadeDoc = InferSchemaType<typeof habilidadeSchema>;
export const Habilidade = model("Habilidade", habilidadeSchema);
