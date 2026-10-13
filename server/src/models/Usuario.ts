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
  },
  { timestamps: true }
);

export const Usuario = model("Usuario", usuarioSchema);
