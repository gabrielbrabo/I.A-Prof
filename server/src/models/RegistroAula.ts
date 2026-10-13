import { Schema, model } from "mongoose";

// Registro de aula gerado/revisado pelo professor
const itemSchema = new Schema(
  {
    componente: { type: String, required: true },
    conteudo: { type: String, required: true },
    habilidades: {
      type: [{ codigo: { type: String, required: true }, habilidade: { type: String, default: null }, _id: false }],
      default: [],
    },
    conferir: { type: Boolean, default: false }, // palpite da IA ainda nao conferido pelo professor
  },
  { _id: false }
);

const registroAulaSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", index: true }, // dono (professor logado)
    professor: { type: String, default: null },
    turma: { type: String, default: null },
    ano: { type: String, required: true },
    uf: { type: String, default: null },
    data: { type: String, required: true }, // YYYY-MM-DD
    anoLetivo: { type: Number, default: null },
    periodo: { type: Number, default: null }, // periodo do plano de curso usado
    entrada: { type: String, required: true }, // texto curto digitado pelo professor
    abertura: { type: [String], default: [] }, // momentos sem componente: "Acolhida.", "Rotina diária."...
    itens: { type: [itemSchema], default: [] },
    textoFinal: { type: String, required: true },
    textoEditado: { type: Boolean, default: false }, // professor editou o texto final a mao
  },
  { timestamps: true }
);

export const RegistroAula = model("RegistroAula", registroAulaSchema);
