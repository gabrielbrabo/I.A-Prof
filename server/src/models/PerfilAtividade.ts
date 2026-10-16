import { Schema, model } from "mongoose";

// O que a I.A aprendeu do jeito do professor fazer atividades (a partir do que ele salva e dos ajustes que pede)
const perfilAtividadeSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, unique: true },
    salvas: { type: Number, default: 0 },
    // contagem das escolhas nas atividades salvas: "fonte:grande" -> 3, "layout:compacto" -> 2, "tipo:multipla" -> 12...
    contagens: { type: Map, of: Number, default: {} },
    camposCabecalho: { type: [String], default: [] },
    escola: { type: String, default: "" },
    mediaQuestoes: { type: Number, default: 0 },
    ajustes: { type: [String], default: [] }, // ultimos pedidos de ajuste (mais recente primeiro)
  },
  { timestamps: true }
);

export const PerfilAtividade = model("PerfilAtividade", perfilAtividadeSchema);
