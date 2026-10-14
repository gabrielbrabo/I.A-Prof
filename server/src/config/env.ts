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
  // Transcricao de voz (Groq Whisper) para navegadores sem ditado proprio (Firefox, Brave, Opera...)
  groqKey: process.env.GROQ_API_KEY || "",
  groqModeloVoz: process.env.GROQ_MODELO_VOZ || "whisper-large-v3-turbo",
  // Login (JWT)
  jwtSecret: process.env.JWT_SECRET || "troque-este-segredo-no-env",
  jwtExpira: process.env.JWT_EXPIRA || "30d",
  // Login com Google (ID do cliente OAuth "Aplicativo da Web" do Google Cloud)
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  // Custo da I.A em reais (para o limite de uso de cada plano)
  cotacaoDolar: Number(process.env.COTACAO_DOLAR || 5.3),
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
