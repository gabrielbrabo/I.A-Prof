import { useEffect, useRef, useState } from "react";
import { contaApi } from "../api/conta";
import { salvarToken } from "../lib/sessao";
import InstalarApp from "./InstalarApp";

// Google Identity Services (botao oficial "Entrar com Google")
type Gis = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};
function carregarGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts?.id) return Promise.resolve(w.google);
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? ok(w.google) : falha(new Error("Google indisponível")));
    s.onerror = () => falha(new Error("Não foi possível carregar o login do Google"));
    document.head.appendChild(s);
  });
}

const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

// Tela de login e cadastro
export default function Entrar({ onEntrou }: { onEntrou: () => void }) {
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const botaoGoogle = useRef<HTMLDivElement>(null);
  const [temGoogle, setTemGoogle] = useState(false);
  const entrou = useRef(onEntrou);
  entrou.current = onEntrou;

  // Mostra o botao do Google se o servidor tiver GOOGLE_CLIENT_ID
  useEffect(() => {
    let ativo = true;
    // Servidor gratis (Render) pode estar "acordando": tenta de novo por ~2 min
    const buscarConfig = async (tentativa = 0): Promise<{ googleClientId: string | null }> => {
      try {
        return await contaApi.configAuth();
      } catch (e) {
        if (!ativo || tentativa >= 24) throw e;
        await new Promise((r) => setTimeout(r, 5000));
        return buscarConfig(tentativa + 1);
      }
    };
    buscarConfig()
      .then(async ({ googleClientId }) => {
        if (!googleClientId || !ativo) return;
        const g = await carregarGis();
        if (!ativo || !botaoGoogle.current) return;
        g.accounts.id.initialize({
          client_id: googleClientId,
          callback: async ({ credential }) => {
            setErro(null);
            setEnviando(true);
            try {
              const r = await contaApi.google(credential);
              salvarToken(r.token);
              entrou.current();
            } catch (e) {
              setErro(e instanceof Error ? e.message : "Não foi possível entrar com o Google");
            } finally {
              setEnviando(false);
            }
          },
        });
        g.accounts.id.renderButton(botaoGoogle.current, { theme: "outline", size: "large", width: Math.max(200, Math.min(300, botaoGoogle.current.clientWidth || 300)), text: "continue_with", locale: "pt-BR" });
        setTemGoogle(true);
      })
      .catch((e) => console.warn("Login com Google indisponível:", e));
    return () => {
      ativo = false;
    };
  }, []);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = modo === "login" ? await contaApi.login({ email, senha }) : await contaApi.cadastro({ nome, email, senha });
      salvarToken(r.token);
      onEntrou();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível entrar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-3 flex justify-center">
          <img src="/logo.svg" alt="I.A Prof" className="h-24 w-24 rounded-[22%] shadow-lg shadow-indigo-500/30" />
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">Registro de aulas com as habilidades do seu plano de curso.</p>
        <form onSubmit={enviar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {(["login", "cadastro"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModo(m);
                  setErro(null);
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium ${modo === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>
          {modo === "cadastro" && (
            <label className="block text-xs font-medium text-slate-500">
              Nome
              <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
            </label>
          )}
          <label className="block text-xs font-medium text-slate-500">
            E-mail
            <input type="email" className={campo} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Senha
            <input
              type="password"
              className={campo}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={modo === "login" ? "current-password" : "new-password"}
              minLength={modo === "cadastro" ? 6 : undefined}
              required
            />
          </label>
          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
          <button
            disabled={enviando}
            className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {enviando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta e testar grátis"}
          </button>
          {/* Entrar / criar conta com Google (a mesma conta serve para os dois) */}
          <div className={temGoogle ? "" : "hidden"}>
            <div className="my-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              ou
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <div ref={botaoGoogle} className="flex justify-center" />
          </div>
          {modo === "cadastro" && (
            <p className="text-center text-[11px] text-slate-500">Teste grátis por 30 dias ou 30 aulas, sem cartão.</p>
          )}
        </form>
        <InstalarApp variante="cartao" />
      </div>
    </div>
  );
}
