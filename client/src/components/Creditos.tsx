import { useEffect, useRef, useState } from "react";
import { CompraCredito, creditosApi, DadosPix, reais, Situacao } from "../api/conta";
import { CaixaPix, CamposPagamento, corpoPagamento, dataBR, formVazio } from "./Pagamento";

const SUGESTOES = [1000, 2000, 5000]; // R$ 10, 20, 50

// Creditos extras de I.A: o professor digita quanto quer colocar (em reais) e paga uma vez.
// O saldo nao vence e so e usado quando o limite do plano no mes acaba.
export default function Creditos({ onSituacao, foco = false, assinante = true }: { onSituacao: (s: Situacao) => void; foco?: boolean; assinante?: boolean }) {
  const [info, setInfo] = useState<{ saldoCentavos: number; podeComprar?: boolean; minimoCentavos: number; maximoCentavos: number; compras: CompraCredito[] } | null>(null);
  const [valor, setValor] = useState("20");
  const [form, setForm] = useState(formVazio);
  const [abrir, setAbrir] = useState(true); // formulario sempre a mao
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pix, setPix] = useState<DadosPix | null>(null);
  const [pixErro, setPixErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = () => creditosApi.meus().then(setInfo).catch(() => {});
  const podeComprar = info?.podeComprar ?? assinante;
  useEffect(() => {
    carregar();
  }, []);
  useEffect(() => {
    if (foco) {
      setAbrir(true);
      setTimeout(() => caixa.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }
  }, [foco]);

  // compra PIX em aberto: busca o QR Code e confere sozinho se o pagamento caiu
  const pendente = info?.compras.find((c) => c.status === "pendente" && c.metodo === "PIX") ?? null;
  useEffect(() => {
    if (!pendente) {
      setPix(null);
      return;
    }
    let ativo = true;
    if (!pix)
      creditosApi
        .pix(pendente.id)
        .then((r) => {
          if (!ativo) return;
          if (r.pix) setPix(r.pix);
          else setPixErro(r.erro ?? null);
        })
        .catch(() => {});
    const t = setInterval(async () => {
      try {
        const r = await creditosApi.atualizar(pendente.id);
        if (r.compra.status !== "pendente") {
          onSituacao(r.situacao);
          if (r.compra.status === "pago") setOk(`Pagamento confirmado! ${reais(r.compra.valorCentavos)} em créditos adicionados.`);
          setPix(null);
          carregar();
        }
      } catch {
        /* tenta de novo */
      }
    }, 6000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendente?.id, pix]);

  const centavos = Math.round(Number(valor.replace(",", ".")) * 100) || 0;
  const valido = !!info && centavos >= info.minimoCentavos && centavos <= info.maximoCentavos;

  async function comprar() {
    setErro(null);
    setOk(null);
    setEnviando(true);
    try {
      const r = await creditosApi.comprar({ valorCentavos: centavos, ...corpoPagamento(form) });
      onSituacao(r.situacao);
      if (r.compra.status === "pago") {
        setOk(`Pronto! ${reais(r.compra.valorCentavos)} em créditos adicionados.`);
        setAbrir(false);
      } else {
        setPix(r.pix ?? null);
        setPixErro(r.pixErro ?? null);
      }
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao comprar créditos");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div ref={caixa} className="scroll-mt-24 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-tour="creditos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">⚡ Créditos extras de uso</p>
          <p className="text-xs text-slate-500">
            {podeComprar
              ? "Compre quando quiser. Não vencem e só são usados depois que o limite de I.A do mês acaba."
              : "Para quem tem um plano ativo: os créditos completam o limite de I.A do mês quando ele acaba."}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-400">Saldo</p>
          <p className="text-lg font-bold text-slate-800">{reais(info?.saldoCentavos ?? 0)}</p>
        </div>
      </div>

      {ok && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>}

      {pendente ? (
        <div className="mt-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 sm:p-4">
          <p className="text-sm font-semibold text-emerald-900">Pague com PIX para liberar {reais(pendente.valorCentavos)} em créditos</p>
          <CaixaPix pix={pix} erro={pixErro} passoFinal="Confirme o pagamento — os créditos entram sozinhos aqui." />
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-emerald-200 pt-2 text-xs">
            <span className="flex items-center gap-1.5 text-emerald-800">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              Aguardando pagamento…
            </span>
            {pendente.checkoutUrl && (
              <a href={pendente.checkoutUrl} target="_blank" rel="noreferrer" className="text-emerald-800 underline">
                Pagar por outra opção
              </a>
            )}
          </div>
        </div>
      ) : !podeComprar ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">🔒 Assine um dos planos acima para poder comprar créditos extras.</p>
      ) : !abrir ? (
        <button onClick={() => setAbrir(true)} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          + Comprar créditos
        </button>
      ) : (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Quanto você quer colocar?</p>
            <div className="flex flex-wrap items-center gap-2">
              {SUGESTOES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setValor(String(c / 100))}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${centavos === c ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 text-slate-600"}`}
                >
                  {reais(c)}
                </button>
              ))}
              <label className="flex items-center gap-1 text-sm text-slate-600">
                R$
                <input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
                  aria-label="Valor em reais"
                />
              </label>
            </div>
            {info && !valido && (
              <p className="mt-1 text-xs text-rose-600">
                Valor entre {reais(info.minimoCentavos)} e {reais(info.maximoCentavos)}.
              </p>
            )}
          </div>
          <CamposPagamento valor={form} onChange={setForm} />
          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={comprar}
              disabled={enviando || !valido}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {enviando ? "Processando..." : `${form.metodo === "PIX" ? "Gerar PIX" : "Pagar"} ${valido ? reais(centavos) : ""}`}
            </button>
          </div>
        </div>
      )}

      {info && info.compras.some((c) => c.status === "pago") && (
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">Compras anteriores</summary>
          <ul className="mt-1 space-y-0.5">
            {info.compras
              .filter((c) => c.status === "pago")
              .map((c) => (
                <li key={c.id}>
                  {dataBR(c.pagoEm)} — {reais(c.valorCentavos)} ({c.metodo === "PIX" ? "PIX" : "cartão"})
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
