import { useEffect, useState } from "react";
import { assinaturaApi, DadosPix, PlanoVenda, reais, Situacao } from "../api/conta";

const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

// Aba "Minha assinatura": situacao (teste/plano/uso), planos e pagamento (PIX ou cartao)
export default function Assinatura({ situacao, onSituacao }: { situacao: Situacao | null; onSituacao: (s: Situacao) => void }) {
  const [planos, setPlanos] = useState<PlanoVenda[]>([]);
  const [pagamentosLigados, setPagamentosLigados] = useState(false);
  const [escolhido, setEscolhido] = useState<PlanoVenda["id"] | null>(null);
  const [ciclo, setCiclo] = useState<"mensal" | "anual">("mensal");
  const [metodo, setMetodo] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [cpf, setCpf] = useState("");
  const [tel, setTel] = useState("");
  const [cartao, setCartao] = useState({ nome: "", numero: "", validade: "", cvv: "", cep: "", numeroEnd: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarCancel, setConfirmarCancel] = useState(false);
  const [pix, setPix] = useState<DadosPix | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [pixErro, setPixErro] = useState<string | null>(null);

  useEffect(() => {
    assinaturaApi
      .planos()
      .then((r) => {
        setPlanos(r.planos);
        setPagamentosLigados(r.pagamentosLigados);
      })
      .catch(() => {});
  }, []);

  // PIX aguardando: confere sozinho a cada 6s se o pagamento caiu
  const aguardando = situacao?.assinatura?.status === "past_due";
  // Busca o QR Code do PIX em aberto (ao abrir a tela ou depois de assinar)
  useEffect(() => {
    if (!aguardando) {
      setPix(null);
      return;
    }
    if (pix) return;
    // Busca agora e repete a cada 8s ate o QR Code ficar pronto (tudo dentro do app, sem abrir o Asaas)
    let ativo = true;
    const buscar = () =>
      assinaturaApi
        .pix()
        .then((r) => {
          if (!ativo) return;
          if (r.pix) {
            setPix(r.pix);
            setPixErro(null);
          } else setPixErro(r.erro ?? null);
        })
        .catch(() => {});
    buscar();
    const t = setInterval(buscar, 8000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aguardando, pix]);

  async function copiarPix() {
    if (!pix) return;
    try {
      await navigator.clipboard.writeText(pix.copiaECola);
    } catch {
      /* navegador sem permissao: o professor copia do campo */
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(() => assinaturaApi.atualizar().then(onSituacao).catch(() => {}), 6000);
    return () => clearInterval(t);
  }, [aguardando, onSituacao]);

  async function assinar() {
    if (!escolhido) return;
    setErro(null);
    setEnviando(true);
    try {
      const [mm, aa] = cartao.validade.split("/").map((x) => x.trim());
      const r = await assinaturaApi.assinar({
        planoId: escolhido,
        ciclo,
        metodo,
        cpfCnpj: cpf,
        telefone: tel,
        ...(metodo === "CREDIT_CARD"
          ? {
              cartao: {
                holderName: cartao.nome,
                number: cartao.numero.replace(/\s/g, ""),
                expiryMonth: mm ?? "",
                expiryYear: aa && aa.length === 2 ? `20${aa}` : aa ?? "",
                ccv: cartao.cvv,
              },
              titular: { postalCode: cartao.cep, addressNumber: cartao.numeroEnd, phone: tel },
            }
          : {}),
      });
      onSituacao(r.situacao);
      setEscolhido(null);
      // PIX: QR Code e copia-e-cola aparecem aqui mesmo (nunca abre outra tela)
      setPix(r.pix ?? null);
      setPixErro(r.pixErro ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao assinar");
    } finally {
      setEnviando(false);
    }
  }

  async function acao(fn: () => Promise<Situacao>) {
    setErro(null);
    try {
      onSituacao(await fn());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  const s = situacao;
  const a = s?.assinatura;
  const assinante = a?.status === "active";
  const corUso = (s?.uso.percentual ?? 0) >= 90 ? "bg-rose-500" : (s?.uso.percentual ?? 0) >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-5">
      {/* Situacao atual */}
      {s && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {assinante ? `Plano ${s.planoNome ?? ""}` : s.teste.ativo ? "Teste grátis" : "Sem plano ativo"}
              </p>
              {assinante && a && (
                <p className="text-xs text-slate-500">
                  {a.ciclo === "anual" ? "Anual" : "Mensal"} · {a.metodo === "CREDIT_CARD" ? a.cartao ?? "Cartão" : "PIX"} ·{" "}
                  {a.cancelarNoFim ? `acesso até ${dataBR(a.periodoFim)}` : `próxima cobrança em ${dataBR(a.periodoFim)}`}
                </p>
              )}
              {!assinante && s.teste.ativo && (
                <p className="text-xs text-slate-500">
                  {s.teste.diasRestantes} dia(s) restante(s) · {s.teste.aulasUsadas} de {s.teste.aulasLimite} aulas usadas
                </p>
              )}
            </div>
            <div className="w-full sm:w-56">
              <p className="mb-1 text-xs text-slate-500">Uso de I.A neste mês: {s.uso.percentual}%</p>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${corUso}`} style={{ width: `${s.uso.percentual}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">Renova todo dia 1º.</p>
            </div>
          </div>
          {s.motivo && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{s.motivo}</p>}
          {aguardando && (
            <div className="mt-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 sm:p-4">
              <p className="text-sm font-semibold text-emerald-900">Pague com PIX para liberar seu plano</p>
              <p className="text-xs text-emerald-800">Assim que o pagamento cair, o acesso é liberado sozinho nesta tela.</p>
              {pix ? (
                <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                  <img src={`data:image/png;base64,${pix.imagem}`} alt="QR Code PIX" className="order-2 h-40 w-40 rounded-lg bg-white p-2 ring-1 ring-emerald-200 sm:order-none sm:h-48 sm:w-48" />
                  <div className="order-1 w-full min-w-0 flex-1 space-y-2 sm:order-none">
                    {pix.valorCentavos != null && (
                      <p className="text-sm text-slate-700">
                        Valor: <b>{reais(pix.valorCentavos)}</b>
                      </p>
                    )}
                    <ol className="list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                      <li>Abra o app do seu banco e escolha pagar com PIX.</li>
                      <li>Aponte a câmera para o QR Code ou use o código copia e cola.</li>
                      <li>Confirme o pagamento — pronto, o plano libera aqui.</li>
                    </ol>
                    <label className="block text-xs font-medium text-slate-500">
                      PIX copia e cola
                      <textarea
                        readOnly
                        rows={3}
                        value={pix.copiaECola}
                        onFocus={(e) => e.target.select()}
                        className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-700"
                      />
                    </label>
                    <button onClick={copiarPix} className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm sm:w-auto sm:py-2 font-semibold text-white hover:bg-emerald-700">
                      {copiado ? "✓ Código copiado!" : "Copiar código PIX"}
                    </button>
                    {pix.expira && <p className="text-[11px] text-slate-500">Válido até {dataBR(pix.expira)}.</p>}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-600">
                  {pixErro ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                      {pixErro} Tentando de novo automaticamente…
                    </p>
                  ) : (
                    <p>Gerando o QR Code do PIX…</p>
                  )}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-emerald-200 pt-2 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-800">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                  Aguardando pagamento…
                </span>
                <button onClick={() => acao(assinaturaApi.atualizar)} className="font-semibold text-emerald-800 underline">
                  Já paguei — atualizar
                </button>
                {a?.checkoutUrl && (
                  <a href={a.checkoutUrl} target="_blank" rel="noreferrer" className="text-emerald-800 underline">
                    Pagar por boleto ou outra opção
                  </a>
                )}
              </div>
            </div>
          )}
          {assinante && a && !a.cancelarNoFim && (
            <div className="mt-3 text-right">
              {confirmarCancel ? (
                <span className="text-sm text-slate-600">
                  Cancelar a renovação? Você mantém o acesso até {dataBR(a.periodoFim)}.{" "}
                  <button onClick={() => acao(assinaturaApi.cancelar).then(() => setConfirmarCancel(false))} className="font-semibold text-rose-600 underline">
                    Sim, cancelar
                  </button>{" "}
                  <button onClick={() => setConfirmarCancel(false)} className="underline">
                    Não
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmarCancel(true)} className="text-xs text-slate-400 hover:text-rose-600">
                  Cancelar assinatura
                </button>
              )}
            </div>
          )}
          {assinante && a?.cancelarNoFim && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Assinatura cancelada: sem novas cobranças, acesso até {dataBR(a.periodoFim)}.{" "}
              <button onClick={() => acao(assinaturaApi.reativar)} className="font-semibold underline">
                Reativar assinatura
              </button>
            </p>
          )}
        </div>
      )}

      {/* Planos */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">{assinante ? "Mudar de plano" : "Escolha seu plano"}</p>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(["mensal", "anual"] as const).map((c) => (
              <button key={c} onClick={() => setCiclo(c)} className={`rounded-md px-3 py-1 ${ciclo === c ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-500"}`}>
                {c === "mensal" ? "Mensal" : "Anual (2 meses grátis)"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {planos.map((p) => {
            const atual = assinante && s?.planoId === p.id;
            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-xl border-2 bg-white p-4 ${p.destaque ? "border-indigo-500" : "border-slate-200"} ${escolhido === p.id ? "ring-2 ring-indigo-300" : ""}`}
              >
                {p.destaque && (
                  <span className="absolute -top-2.5 left-4 rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-semibold text-white">Mais escolhido</span>
                )}
                <p className="text-base font-bold text-slate-800">{p.nome}</p>
                <p className="mt-1 text-2xl font-bold text-slate-800">
                  {reais(ciclo === "anual" ? p.precoAnual : p.precoMensal)}
                  <span className="text-sm font-normal text-slate-500">/{ciclo === "anual" ? "ano" : "mês"}</span>
                </p>
                {ciclo === "anual" && <p className="text-xs text-emerald-700">equivale a {reais(Math.round(p.precoAnual / 12))}/mês</p>}
                <ul className="mt-3 flex-1 space-y-1 text-xs text-slate-600">
                  {p.recursos.map((r) => (
                    <li key={r}>✓ {r}</li>
                  ))}
                </ul>
                <button
                  disabled={atual}
                  onClick={() => setEscolhido(p.id)}
                  className={`mt-4 rounded-lg py-2 text-sm font-semibold ${
                    atual ? "bg-slate-100 text-slate-400" : p.destaque ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-800 text-white hover:bg-slate-900"
                  }`}
                >
                  {atual ? "Seu plano atual" : "Assinar"}
                </button>
              </div>
            );
          })}
        </div>
        {!pagamentosLigados && (
          <p className="mt-2 text-xs text-slate-400">Modo de testes: a assinatura é liberada na hora, sem cobrança.</p>
        )}
      </div>

      {/* Pagamento */}
      {escolhido && (
        <div className="rounded-xl border border-indigo-200 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-slate-700">
            Pagamento — plano {planos.find((p) => p.id === escolhido)?.nome} ({ciclo})
          </p>
          <div className="mb-3 flex gap-2">
            {(["PIX", "CREDIT_CARD"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetodo(m)}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm sm:flex-none ${metodo === m ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-300 text-slate-600"}`}
              >
                {m === "PIX" ? "PIX" : "Cartão de crédito"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">
              CPF ou CNPJ
              <input className={campo} inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Celular
              <input className={campo} type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="(00) 00000-0000" />
            </label>
            {metodo === "CREDIT_CARD" && (
              <>
                <label className="text-xs font-medium text-slate-500 sm:col-span-2">
                  Nome impresso no cartão
                  <input className={campo} value={cartao.nome} onChange={(e) => setCartao({ ...cartao, nome: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-500 sm:col-span-2">
                  Número do cartão
                  <input className={campo} inputMode="numeric" value={cartao.numero} onChange={(e) => setCartao({ ...cartao, numero: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Validade (MM/AA)
                  <input className={campo} value={cartao.validade} onChange={(e) => setCartao({ ...cartao, validade: e.target.value })} placeholder="08/29" />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  CVV
                  <input className={campo} inputMode="numeric" value={cartao.cvv} onChange={(e) => setCartao({ ...cartao, cvv: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  CEP
                  <input className={campo} value={cartao.cep} onChange={(e) => setCartao({ ...cartao, cep: e.target.value })} />
                </label>
                <label className="text-xs font-medium text-slate-500">
                  Nº do endereço
                  <input className={campo} value={cartao.numeroEnd} onChange={(e) => setCartao({ ...cartao, numeroEnd: e.target.value })} />
                </label>
                <p className="text-[11px] text-slate-400 sm:col-span-2">CEP, número e celular são exigência antifraude da operadora do cartão.</p>
              </>
            )}
          </div>
          {erro && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEscolhido(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Voltar
            </button>
            <button onClick={assinar} disabled={enviando} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {enviando ? "Processando..." : metodo === "PIX" ? "Gerar PIX" : "Pagar com cartão"}
            </button>
          </div>
        </div>
      )}
      {erro && !escolhido && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
    </div>
  );
}
