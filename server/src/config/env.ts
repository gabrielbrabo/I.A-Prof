import dotenv from "dotenv";

dotenv.config();

// Configuracao central lida do .env
export const env = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/iaprof",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  // Modelo da etapa de ESCOLHA das habilidades (opcional; ex.: claude-opus-5-5 para mais precisao)
  anthropicModelEscolha: process.env.ANTHROPIC_MODEL_ESCOLHA || "",
  // Gerar/ajustar atividades: so OpenAI (GPT)
  openaiModeloAtividade: process.env.OPENAI_MODEL_ATIVIDADE || "gpt-6.1-sol",
  openaiRaciocinio: process.env.OPENAI_RACIOCINIO ?? "high", // low | medium | high ("" = sem): high = segue melhor o pedido
  // Correcao de atividades (ferramenta futura): objetivas/curtas no modelo barato, discursivas no Sonnet
  anthropicModelCorrecaoObjetiva: process.env.ANTHROPIC_MODEL_CORRECAO_OBJETIVA || "claude-haiku-4-5",
  anthropicModelCorrecaoDiscursiva: process.env.ANTHROPIC_MODEL_CORRECAO_DISCURSIVA || "",
  // Imagens das atividades (ilustracoes geradas). Vazio = sem gerar imagens (a atividade usa emojis/desenhos simples).
  openaiKey: process.env.OPENAI_API_KEY || "",
  imagemModelo: process.env.IMAGEM_MODELO || "gpt-image-2.5-flare",
  imagemQualidade: (process.env.IMAGEM_QUALIDADE || "medium") as "low" | "medium" | "high",
  imagemMax: Number(process.env.IMAGEM_MAX || 8), // por atividade
  imagemCustoUsd: Number(process.env.IMAGEM_CUSTO_USD || 0), // 0 = usa a tabela de precos
  // Transcricao de voz (Groq Whisper) para navegadores sem ditado proprio (Firefox, Brave, Opera...)
  groqKey: process.env.GROQ_API_KEY || "",
  groqModeloVoz: process.env.GROQ_MODELO_VOZ || "whisper-large-v3-turbo",
  // sem Groq, o ditado usa a OpenAI (mesma OPENAI_API_KEY das atividades)
  openaiModeloVoz: process.env.OPENAI_MODELO_VOZ || "gpt-4o-mini-transcribe",
  // Login (JWT)
  jwtSecret: process.env.JWT_SECRET || "troque-este-segredo-no-env",
  jwtExpira: process.env.JWT_EXPIRA || "30d",
  // Login com Google (ID do cliente OAuth "Aplicativo da Web" do Google Cloud)
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  // Custo da I.A em reais (para o limite de uso de cada plano)
  cotacaoDolar: Number(process.env.COTACAO_DOLAR || 5.3),
  // Creditos extras de I.A (compra avulsa): cada R$ 1 pago vira R$ FATOR de custo real de I.A.
  // 0.5 = metade do valor pago cobre a I.A; o resto cobre taxa, imposto e margem.
  creditos: {
    fator: Number(process.env.CREDITO_FATOR || 0.5),
    minimoCentavos: Number(process.env.CREDITO_MINIMO_CENTAVOS || 1000), // R$ 10
    maximoCentavos: Number(process.env.CREDITO_MAXIMO_CENTAVOS || 50000), // R$ 500
  },
  // Integracao com o Diario escolar (X Escolar): endereco da API do Diario e chave compartilhada
  diario: {
    url: (process.env.DIARIO_API_URL || "").replace(/\/+$/, ""),
    chave: process.env.DIARIO_CHAVE || "",
  },
  // Pagamentos (assinatura). Vazio = modo desenvolvimento: assinar libera na hora, nada e cobrado.
  payments: {
    provider: (process.env.PAYMENTS_PROVIDER || "").toLowerCase(), // "asaas" ou vazio
    asaasKey: process.env.ASAAS_API_KEY || "",
    asaasBaseUrl: process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3",
    webhookSecret: process.env.PAYMENTS_WEBHOOK_SECRET || "",
  },
};

export const pagamentosLigados = () => env.payments.provider === "asaas" && !!env.payments.asaasKey;

export const diarioLigado = () => !!env.diario.url && !!env.diario.chave;
