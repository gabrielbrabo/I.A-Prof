import { Schema, model } from "mongoose";

// Correcao da atividade de um aluno (manual ou pela I.A com foto). A nota so vale depois de aprovada.
const respostaSchema = new Schema(
  {
    questao: { type: String, required: true }, // _id da questao
    resposta: { type: String, default: "" }, // o que o aluno marcou/escreveu (lido da foto ou digitado)
    itens: { type: [String], default: [] }, // V/F marcados pelo aluno, na ordem dos itens
    pontos: { type: Number, default: 0 },
    comentario: { type: String, default: "" },
    duvida: { type: Boolean, default: false }, // I.A nao conseguiu ler/teve duvida: professor confere
  },
  { _id: false }
);

const correcaoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    atividade: { type: Schema.Types.ObjectId, ref: "Atividade", required: true, index: true },
    alunoId: { type: String, required: true }, // id do aluno (turma do I.A Prof ou do D.E.V)
    alunoNome: { type: String, required: true },
    metodo: { type: String, enum: ["manual", "ia"], default: "manual" },
    respostas: { type: [respostaSchema], default: [] },
    nota: { type: Number, default: 0 },
    nomeLido: { type: String, default: null }, // nome escrito na folha (I.A)
    status: { type: String, enum: ["corrigida", "aprovada"], default: "corrigida" },
    aprovadaEm: { type: Date, default: null },
    enviadaDiarioEm: { type: Date, default: null },
  },
  { timestamps: true }
);
correcaoSchema.index({ atividade: 1, alunoId: 1 }, { unique: true });

export const Correcao = model("Correcao", correcaoSchema);
