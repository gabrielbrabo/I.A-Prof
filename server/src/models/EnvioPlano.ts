import { Schema, model } from "mongoose";

// Cada envio de arquivo do plano de curso (deu certo ou foi recusado) — para o painel admin conferir
// se o professor enviou o plano do ano todo, um arquivo por periodo, ou um arquivo no periodo errado.
const envioPlanoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    ano: { type: String, required: true }, // serie escolhida na tela
    anoLetivo: { type: Number, default: null },
    turma: { type: String, default: null },
    tipoPeriodo: { type: String, required: true },
    modo: { type: String, enum: ["ano", "periodo"], required: true }, // ano = um arquivo com o ano todo; periodo = arquivo de um periodo
    periodoEscolhido: { type: Number, default: null }, // no modo periodo: em qual periodo o professor enviou
    arquivos: { type: [String], default: [] },
    periodosNoDocumento: { type: [Number], default: [] }, // periodos que o proprio documento indica ("2º TRIMESTRE")
    periodosLidos: { type: [Number], default: [] }, // periodos que receberam habilidades
    habilidades: { type: Number, default: 0 },
    resultado: { type: String, enum: ["ok", "recusado"], required: true },
    mensagem: { type: String, default: null }, // motivo da recusa ou aviso mostrado ao professor
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
envioPlanoSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2 * 365 * 86400 });

export const EnvioPlano = model("EnvioPlano", envioPlanoSchema);
