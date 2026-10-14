import { Schema, model } from "mongoose";

// Professor (conta de acesso)
const usuarioSchema = new Schema(
  {
    nome: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    senhaHash: { type: String, default: null }, // null = conta criada so com Google
    googleId: { type: String, default: null, index: true }, // "sub" da conta Google
    foto: { type: String, default: null },
    testeAte: { type: Date, required: true }, // fim do teste gratis
    testeAulas: { type: Number, default: 0 }, // aulas geradas durante o teste
    // Conexao com o Diario escolar (a senha do Diario nunca e guardada; so o token de vinculo)
    diario: {
      token: { type: String, default: null },
      nome: { type: String, default: null },
      escolas: { type: [String], default: [] },
      conectadoEm: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export const Usuario = model("Usuario", usuarioSchema);
