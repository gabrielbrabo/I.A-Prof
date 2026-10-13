import { Schema, model, InferSchemaType } from "mongoose";

// Plano de curso anual de uma turma, dividido em periodos (bimestre/trimestre/semestre)
const itemSchema = new Schema(
  {
    componente: { type: String, required: true },
    codigo: { type: String, default: null }, // pode faltar quando o plano so traz o conteudo
    habilidade: { type: String, default: null }, // descricao (do banco, ou transcrita do documento)
    conteudo: { type: String, default: null }, // objeto de conhecimento / conteudo previsto
    noBanco: { type: Boolean, default: false }, // codigo existe na base de habilidades
    recomposicao: { type: Boolean, default: false }, // habilidade de recomposicao
    conferir: { type: Boolean, default: false }, // entrou pela rede de seguranca da leitura
    origemTexto: { type: String, default: null },
    textoOficial: { type: String, default: null }, // sugestao de texto oficial (documento quase igual: erro de digitacao?) // "oficial" (BNCC/curriculo do estado) ou "documento" (lido do plano)
  },
  { _id: false }
);

const periodoSchema = new Schema(
  {
    numero: { type: Number, required: true }, // 1, 2, 3...
    inicio: { type: String, default: "" }, // YYYY-MM-DD ("" = nao cadastrada)
    fim: { type: String, default: "" }, // YYYY-MM-DD ("" = nao cadastrada)
    itens: { type: [itemSchema], default: [] },
  },
  { _id: false }
);

const planoCursoSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", index: true }, // dono (professor logado)
    professor: { type: String, default: null },
    turma: { type: String, default: null },
    ano: { type: String, required: true }, // serie: "4", "EI03", "EM"...
    uf: { type: String, default: null },
    anoLetivo: { type: Number, required: true },
    tipoPeriodo: { type: String, enum: ["bimestre", "trimestre", "semestre"], required: true },
    periodos: { type: [periodoSchema], default: [] },
    arquivos: { type: [String], default: [] }, // nomes dos arquivos de origem
  },
  { timestamps: true }
);

planoCursoSchema.index({ usuario: 1, ano: 1, anoLetivo: 1, turma: 1 });

export type PlanoCursoDoc = InferSchemaType<typeof planoCursoSchema>;
export const PlanoCurso = model("PlanoCurso", planoCursoSchema);
