import { Schema, model } from "mongoose";

// Turma do professor no I.A Prof (para quem nao usa o D.E.V): nome e lista de alunos colada
const alunoSchema = new Schema({ nome: { type: String, required: true, trim: true } });

const turmaSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    nome: { type: String, required: true, trim: true },
    ano: { type: String, default: null }, // serie
    anoLetivo: { type: Number, default: null },
    alunos: { type: [alunoSchema], default: [] },
  },
  { timestamps: true }
);

export const Turma = model("Turma", turmaSchema);
