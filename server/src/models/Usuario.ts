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
    testeAtividades: { type: Number, default: 0 }, // atividades geradas durante o teste
    // Creditos extras comprados (custo real de I.A em centavos). Usados so depois que o limite do mes acaba; nao vencem.
    creditosCentavos: { type: Number, default: 0 },
    // Tarefa de I.A em andamento (aula sendo gerada / correcao de uma turma). Se o limite acabar no meio,
    // a tarefa aberta pode terminar; tarefa nova fica bloqueada.
    loteIa: {
      chave: { type: String, default: null },
      ate: { type: Date, default: null },
      gasto: { type: Number, default: 0 }, // gasto do mes na ultima vez que a tarefa rodou com limite
    },
    // Conexao com o Diario escolar (a senha do Diario nunca e guardada; so o token de vinculo)
    diario: {
      token: { type: String, default: null },
      nome: { type: String, default: null },
      escolas: { type: [String], default: [] },
      conectadoEm: { type: Date, default: null },
    },
    // D.E.V desta conta (hash do CPF do professor no D.E.V). Fica gravado mesmo ao desconectar:
    // cada conta do I.A Prof so conecta o D.E.V do proprio professor, e cada D.E.V so uma conta do I.A Prof.
    diarioCpf: { type: String, default: undefined },
    // Pedido de conexao aguardando o professor aprovar dentro do D.E.V (e-mail da conta diferente do D.E.V)
    diarioPedido: {
      id: { type: String, default: null },
      expiraEm: { type: Date, default: null },
      cpfHash: { type: String, default: null },
      emailDev: { type: String, default: null }, // e-mail do D.E.V mascarado (para as instrucoes)
    },
  },
  { timestamps: true }
);

usuarioSchema.index({ diarioCpf: 1 }, { unique: true, sparse: true });

export const Usuario = model("Usuario", usuarioSchema);
