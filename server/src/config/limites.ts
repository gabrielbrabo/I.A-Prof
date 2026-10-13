import "./env"; // garante que o .env ja foi carregado

// Limites de caracteres (configuraveis no .env)
// LIMITE_ENTRADA_CHARS: maximo que o professor pode digitar (controla custo de tokens)
// LIMITE_REGISTRO_CHARS: maximo do texto final do registro de aula (campo do diario). Padrao 2000; 0 = sem limite
export const limites = {
  entrada: Number(process.env.LIMITE_ENTRADA_CHARS || 1000),
  registro: Number(process.env.LIMITE_REGISTRO_CHARS ?? 2000),
};
