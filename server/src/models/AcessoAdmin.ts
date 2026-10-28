import { Schema, model } from "mongoose";

// Registro de cada vez que um admin abre os dados de um professor (rastro para a LGPD)
const acessoAdminSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Usuario", required: true },
    usuarioVisto: { type: Schema.Types.ObjectId, ref: "Usuario", default: null },
    rota: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
acessoAdminSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 86400 }); // guarda 1 ano

export const AcessoAdmin = model("AcessoAdmin", acessoAdminSchema);
