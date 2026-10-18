import { Schema, model } from "mongoose";

// Atividade gerada pela I.A (e editada/aprovada pelo professor) com o gabarito.
// Tipos de questao:
//  multipla   -> alternativas + resposta (letra)
//  vf         -> itens [{ texto, resposta: "V"|"F" }] (pontos divididos entre os itens)
//  discursiva -> resposta esperada + criterios (correcao com pontos parciais)
//  completar  -> resposta esperada (lacunas / respostas curtas)
const itemVfSchema = new Schema({ texto: { type: String, default: "" }, resposta: { type: String, enum: ["V", "F"], default: "V" } }, { _id: false });

const questaoSchema = new Schema({
  tipo: { type: String, enum: ["multipla", "vf", "discursiva", "completar"], required: true },
  enunciado: { type: String, default: "" },
  alternativas: { type: [String], default: [] },
  itens: { type: [itemVfSchema], default: [] },
  resposta: { type: String, default: "" },
  criterios: { type: String, default: "" },
  valor: { type: Number, default: 1, min: 0 },
  imagem: { type: String, default: "" }, // id de uma imagem do professor (lista "imagens")
  linhas: { type: Number, default: 0 }, // linhas para resposta (0 = automatico)
  quadro: { type: String, default: "" }, // caca-palavras, colunas para ligar, tabela (largura fixa)
  figura: {
    tipo: { type: String, enum: ["", "emoji", "svg"], default: "" }, // ilustracao feita pela I.A
    conteudo: { type: String, default: "" },
  },
});

const atividadeSchema = new Schema(
  {
    usuario: { type: Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
    ano: { type: String, required: true }, // serie
    uf: { type: String, default: null },
    anoLetivo: { type: Number, required: true },
    periodo: { type: Number, default: 0 }, // 1..4 (0 = sem periodo)
    componente: { type: String, required: true },
    turma: { type: String, default: null }, // nome exibido
    turmaId: { type: Schema.Types.ObjectId, ref: "Turma", default: null }, // turma do I.A Prof
    diarioTurmaId: { type: String, default: null }, // turma do D.E.V
    diarioMateriaId: { type: String, default: null }, // materia do D.E.V
    tipoDev: { type: String, enum: ["Normal", "Prova", "Trabalho", "Outra Atividade"], default: "Normal" },
    detalhes: { type: String, default: "" }, // o que o professor pediu
    origem: { type: String, enum: ["ia", "externa"], default: "ia" },
    semNota: { type: Boolean, default: false }, // so exercicio: sem nota (correcao conta acertos; nao vai para o D.E.V) // externa = atividade feita fora (so gabarito para corrigir)
    titulo: { type: String, required: true },
    instrucoes: { type: String, default: "" },
    questoes: { type: [questaoSchema], default: [] },
    habilidades: { type: [{ codigo: String, habilidade: String, _id: false }], default: [] },
    valorTotal: { type: Number, default: 10 },
    // Imagens enviadas pelo professor (logo da escola, figuras) — data URL ja reduzida no app
    imagens: { type: [{ id: String, nome: String, dataUrl: String, _id: false }], default: [] },
    cabecalho: {
      escola: { type: String, default: "" },
      logo: { type: String, default: "" }, // id da imagem usada como logo
      campos: { type: [String], default: ["escola", "professor", "turma", "aluno", "data", "nota"] },
    },
    estilo: {
      fonte: { type: String, enum: ["normal", "grande", "extra"], default: "normal" },
      colorido: { type: Boolean, default: false },
      caixaAlta: { type: Boolean, default: false }, // letra bastao
      layout: { type: String, enum: ["compacto", "normal", "amplo"], default: "normal" },
      imagem: { type: String, enum: ["pequena", "media", "grande"], default: "media" },
      colunas: { type: Boolean, default: false },
      paginas: { type: Number, default: 0 }, // 1 = tudo em uma folha
    },
    // Texto de apoio (leitura e interpretacao)
    texto: {
      titulo: { type: String, default: "" },
      conteudo: { type: String, default: "" },
      imagem: { type: String, default: "" },
      posicao: { type: String, enum: ["topo", "direita", "esquerda"], default: "topo" }, // onde fica a imagem do texto
    },
    diario: {
      atividadeId: { type: String, default: null }, // id da atividade no D.E.V depois do primeiro envio
      enviadoEm: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export const Atividade = model("Atividade", atividadeSchema);
