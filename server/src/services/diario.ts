import { env, diarioLigado } from "../config/env";

// Cliente da API do Diario escolar (X Escolar). Servidor -> servidor: a chave fica so aqui no backend.
export class ErroDiario extends Error {
  constructor(message: string, public status: number, public dados: Record<string, unknown> = {}) {
    super(message);
  }
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown, token?: string): Promise<T> {
  if (!diarioLigado()) throw new ErroDiario("Integração com o D.E.V não configurada no servidor.", 503);
  let resp: Response | null = null;
  // O D.E.V pode estar "acordando" ou oscilar: tenta de novo uma vez antes de dar erro
  const tentar = () =>
    fetch(`${env.diario.url}/integracao/iaprof${caminho}`, {
      method: metodo,
      headers: {
        "Content-Type": "application/json",
        "x-iaprof-chave": env.diario.chave,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(45000),
    });
  try {
    try {
      resp = await tentar();
      if ([502, 503, 504].includes(resp.status)) throw Object.assign(new Error("gateway"), { cause: { code: `HTTP_${resp.status}` } });
    } catch (primeiro) {
      // so repete em falha de rede / servidor fora; erros de regra (4xx) nao.
      // POST so repete quando o pedido certamente nao chegou ao D.E.V (evita gravar duas vezes).
      const cod = (primeiro as { cause?: { code?: string } }).cause?.code ?? (primeiro as Error).name ?? "";
      const naoChegou = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "HTTP_502", "HTTP_503"].includes(cod);
      if (metodo === "POST" && !naoChegou) throw primeiro;
      console.warn(`[diario] nova tentativa ${caminho.split("?")[0]}:`, (primeiro as { cause?: { code?: string } }).cause?.code ?? (primeiro as Error).name);
      await new Promise((r) => setTimeout(r, 2500));
      resp = await tentar();
    }
  } catch (e) {
    // Mostra o motivo real (sem expor a chave) para facilitar achar o problema de configuracao
    const err = e as { name?: string; cause?: { code?: string; message?: string }; message?: string };
    const codigo = err.cause?.code || err.name || "";
    console.error(`[diario] falha ao chamar ${env.diario.url}/integracao/iaprof${caminho.split("?")[0]}:`, codigo, err.cause?.message || err.message);
    const motivo =
      codigo === "TimeoutError" || codigo === "AbortError"
        ? "o D.E.V demorou demais para responder (pode estar iniciando)."
        : codigo === "ENOTFOUND" || codigo === "EAI_AGAIN"
          ? "o endereço do D.E.V (DIARIO_API_URL) não foi encontrado."
          : codigo === "ECONNREFUSED"
            ? "o servidor do D.E.V recusou a conexão (está desligado ou o endereço/porta está errado)."
            : codigo.startsWith("ERR_TLS") || codigo.includes("CERT")
              ? "problema de certificado (https) no endereço do D.E.V."
              : `erro de conexão (${codigo || "desconhecido"}).`;
    throw new ErroDiario(`Não foi possível falar com o D.E.V: ${motivo}`, 502);
  }
  if (!resp) throw new ErroDiario("Não foi possível falar com o D.E.V agora. Tente de novo.", 502);
  const dados = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (resp.status === 404 && !dados.msg) {
    // rota nao existe: D.E.V sem a atualizacao da integracao ou DIARIO_API_URL apontando para o lugar errado
    throw new ErroDiario("O D.E.V respondeu, mas não tem a integração com o I.A Prof (atualize o servidor do D.E.V ou confira o DIARIO_API_URL).", 502);
  }
  if (!resp.ok) throw new ErroDiario(String(dados.msg || `Erro no D.E.V (${resp.status})`), resp.status, dados);
  return dados as T;
}

export interface TurmaDiario {
  id: string;
  nome: string;
  serie: string;
  ano: string;
  turno?: string;
  escola: string;
  papel: "REGENTE" | "ED_FISICA";
  nivel?: string;
  notas?: boolean; // false = escola com conceitos (Educacao Infantil): atividades nao vao para o D.E.V
}

export interface AlunosDiario {
  papel: "REGENTE" | "ED_FISICA";
  alunos: Array<{ id: string; nome: string }>;
  materias: Array<{ id: string; nome: string }>;
  periodos: Array<{ label: string; aberto: boolean; totalPontos: number }>;
  notas?: boolean;
  nivel?: string;
}

// Pedido de conexao (aprovado pelo professor dentro do D.E.V em ate 5 minutos)
export interface PedidoDiario {
  id: string;
  status: "pendente" | "aprovado" | "entregue" | "cancelado" | "expirado";
  expiraEm: string;
  agora: string; // relogio do D.E.V
}
export type VinculoDiario =
  | { token: string; nome: string; escolas: string[]; pendente?: undefined }
  | { pendente: true; pedido: PedidoDiario; emailDev: string; nome: string; token?: undefined };

export const diario = {
  // e-mail da conta do I.A Prof igual ao do D.E.V: devolve o token; diferente: devolve um pedido para aprovar no D.E.V
  vincular: (cpf: string, senha: string, conta?: { email: string; nome: string }) =>
    chamar<VinculoDiario>("POST", "/vincular", { cpf, senha, email: conta?.email, nome: conta?.nome }),
  pedido: (id: string) => chamar<PedidoDiario & { token?: string; nome?: string; escolas?: string[] }>("GET", `/pedidos/${encodeURIComponent(id)}`),
  cancelarPedido: (id: string) => chamar<{ ok: boolean }>("POST", `/pedidos/${encodeURIComponent(id)}/cancelar`),
  turmas: (token: string, ano?: string) => chamar<{ nome: string; turmas: TurmaDiario[] }>("GET", `/turmas${ano ? `?ano=${encodeURIComponent(ano)}` : ""}`, undefined, token),
  verificarAula: (token: string, idTurma: string, data: string) =>
    chamar<{ podeRegistrar: boolean; motivo?: string; existe: boolean; id: string | null; descricao: string | null }>(
      "GET",
      `/aulas/verificar?id_turma=${encodeURIComponent(idTurma)}&data=${encodeURIComponent(data)}`,
      undefined,
      token
    ),
  registrarAula: (token: string, corpo: { id_turma: string; data: string; descricao: string; modo?: "substituir" | "juntar" }) =>
    chamar<{ ok: boolean; id: string; acao: "criada" | "substituida" | "juntada" }>("POST", "/aulas", corpo, token),
  alunos: (token: string, idTurma: string) => chamar<AlunosDiario>("GET", `/turmas/${encodeURIComponent(idTurma)}/alunos`, undefined, token),
  pontos: (token: string, q: { id_turma: string; bimestre: string; id_matter: string; excluir?: string | null }) =>
    chamar<{ total: number; usado: number; restante: number | null; aberto: boolean }>(
      "GET",
      `/atividades/pontos?${new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString()}`,
      undefined,
      token
    ),
  registrarAtividade: (
    token: string,
    corpo: {
      id_turma: string;
      bimestre: string;
      id_matter: string;
      descricao: string;
      tipo: string;
      valor: number;
      idAtividade?: string | null;
      notas: Array<{ id_student: string; nota: number }>;
    }
  ) => chamar<{ ok: boolean; idAtividade: string; criadas: number; atualizadas: number }>("POST", "/atividades", corpo, token),
};
