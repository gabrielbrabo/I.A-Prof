import { useEffect, useRef, useState } from "react";
import { diarioApi, PedidoConexao, SituacaoDiario } from "../api/diario";

const fmtTempo = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Aguardando o professor aprovar a conexao dentro do D.E.V (e-mails diferentes): contador de 5 minutos e passo a passo
function AguardandoAprovacao({
  pedido,
  nomeDev,
  onConectou,
  onRefazer,
  onCancelar,
}: {
  pedido: PedidoConexao;
  nomeDev?: string | null;
  onConectou: (nome: string | null, escolas: string[]) => void;
  onRefazer: () => void;
  onCancelar: () => void;
}) {
  const diferenca = useRef(new Date(pedido.agora).getTime() - Date.now());
  const [resta, setResta] = useState(() => new Date(pedido.expiraEm).getTime() - (Date.now() + diferenca.current));
  const [expirou, setExpirou] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // contador
  useEffect(() => {
    const t = window.setInterval(() => setResta(new Date(pedido.expiraEm).getTime() - (Date.now() + diferenca.current)), 1000);
    return () => window.clearInterval(t);
  }, [pedido.expiraEm]);

  // pergunta ao servidor a cada 3 s se o professor ja aprovou no D.E.V
  useEffect(() => {
    let vivo = true;
    const ver = async () => {
      try {
        const r = await diarioApi.pedido();
        if (!vivo) return;
        if (r.status === "conectado") onConectou(r.nome, r.escolas);
        else if (r.status !== "pendente") setExpirou(true);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Erro ao verificar a conexão");
      }
    };
    const t = window.setInterval(ver, 3000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [onConectou]);

  const acabou = expirou || resta <= 0;
  if (acabou) {
    return (
      <div className="mt-2 space-y-3">
        <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          ⏰ <b>O tempo para aprovar acabou.</b> Sem problema: peça de novo e aprove no D.E.V em até 5 minutos.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Fechar
          </button>
          <button onClick={onRefazer} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Pedir de novo
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-3">
      <p className="text-sm text-slate-700">
        <b>Falta só um passo!</b> O e-mail da sua conta do I.A Prof é diferente do e-mail cadastrado no D.E.V
        {pedido.emailDev ? (
          <>
            {" "}
            (<b>{pedido.emailDev}</b>)
          </>
        ) : null}
        . Por segurança, {nomeDev ? <b>{nomeDev}</b> : "você"} precisa aprovar a conexão dentro do D.E.V.
      </p>
      <div className="rounded-xl bg-indigo-50 px-4 py-3 text-center">
        <p className="text-xs text-indigo-800">Tempo para aprovar no D.E.V</p>
        <p className={`text-3xl font-extrabold tabular-nums ${resta <= 60000 ? "text-rose-600" : "text-indigo-700"}`}>{fmtTempo(resta)}</p>
      </div>
      <ol className="space-y-2 text-sm text-slate-700">
        {[
          <>Abra o <b>D.E.V</b> em outra aba do navegador ou no celular.</>,
          <>Entre com o seu <b>CPF</b> e <b>senha</b>, como faz todo dia.</>,
          <>Vai aparecer a janela <b>“Conectar o I.A Prof ao seu D.E.V?”</b>. Toque em <b>Aprovar conexão com o I.A Prof</b>.</>,
          <>Volte para esta tela: a conexão aparece sozinha em alguns segundos.</>,
        ].map((passo, i) => (
          <li key={i} className="flex gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
            <span className="pt-0.5">{passo}</span>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-slate-500">
        Já estava com o D.E.V aberto? Espere uns segundos ou atualize a página do D.E.V (tecla F5 no computador). Não feche esta tela.
      </p>
      <p className="flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 motion-safe:animate-pulse" /> Esperando a aprovação no D.E.V…
      </p>
      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
      <div className="flex justify-end">
        <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Cancelar pedido
        </button>
      </div>
    </div>
  );
}

const campo =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// Conectar / desconectar a conta do Diario escolar (CPF e senha do Diario; a senha nao fica guardada no I.A Prof)
export function ModalConectarDiario({
  situacao,
  onFechar,
  onMudou,
}: {
  situacao: SituacaoDiario;
  onFechar: () => void;
  onMudou: (s: SituacaoDiario) => void;
}) {
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // pedido de conexao aguardando aprovacao no D.E.V (tambem quando reabre a janela com um pedido em aberto)
  const [pedido, setPedido] = useState<PedidoConexao | null>(situacao.pedido ?? null);
  const [nomeDev, setNomeDev] = useState<string | null>(null);
  const [conectou, setConectou] = useState(false);

  const aoConectar = useRef((nome: string | null, escolas: string[]) => {
    setPedido(null);
    setConectou(true);
    onMudou({ ...situacao, conectado: true, nome, escolas, pedido: null });
  });

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await diarioApi.conectar(cpf, senha);
      setSenha("");
      // e-mail diferente do D.E.V: mostra AGORA o contador e o passo a passo (a janela nao fecha)
      if ("pendente" in r && r.pendente) {
        setPedido(r.pedido);
        setNomeDev(r.nomeDev);
        onMudou({ ...situacao, pedido: r.pedido });
        return;
      }
      onMudou({ ...situacao, ...r, conectado: true, pedido: null });
      onFechar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Não foi possível conectar");
    } finally {
      setEnviando(false);
    }
  }

  async function desconectar() {
    setEnviando(true);
    try {
      await diarioApi.desconectar();
      onMudou({ ...situacao, conectado: false, nome: null, escolas: [] });
      onFechar();
    } catch (e2) {
      setErro(e2 instanceof Error ? e2.message : "Erro ao desconectar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !enviando && !pedido && onFechar()}>
      <div className="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-800">📒 D.E.V</p>
        {conectou ? (
          <>
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              ✅ <b>Pronto! Seu D.E.V está conectado.</b> Agora suas turmas aparecem no I.A Prof e as aulas e notas podem ir direto para o diário.
            </p>
            <div className="mt-4 flex justify-end">
              <button onClick={onFechar} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                Fechar
              </button>
            </div>
          </>
        ) : pedido && !situacao.conectado ? (
          <AguardandoAprovacao
            pedido={pedido}
            nomeDev={nomeDev}
            onConectou={aoConectar.current}
            onRefazer={() => {
              setPedido(null);
              onMudou({ ...situacao, pedido: null });
            }}
            onCancelar={() => {
              void diarioApi.cancelarPedido().catch(() => {});
              setPedido(null);
              onMudou({ ...situacao, pedido: null });
              onFechar();
            }}
          />
        ) : !situacao.disponivel ? (
          <>
            <p className="mt-2 text-sm text-slate-700">A conexão com o D.E.V ainda não está disponível.</p>
            <p className="mt-1 text-xs text-slate-500">
              Configuração do servidor do I.A Prof: falta <code>DIARIO_API_URL</code> e/ou <code>DIARIO_CHAVE</code> (reinicie o servidor depois de configurar).
            </p>
            <div className="mt-4 flex justify-end">
              <button onClick={onFechar} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                Fechar
              </button>
            </div>
          </>
        ) : situacao.conectado ? (
          <>
            <p className="mt-2 text-sm text-slate-700">
              Conectado como <b>{situacao.nome}</b>
            </p>
            {situacao.escolas.length > 0 && <p className="text-xs text-slate-500">{situacao.escolas.join(" · ")}</p>}
            <p className="mt-3 text-xs text-slate-500">As aulas salvas com uma turma do D.E.V são enviadas para o seu diário de classe.</p>
            {erro && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
            <div className="mt-4 flex justify-between gap-2">
              <button onClick={desconectar} disabled={enviando} className="rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">
                Desconectar
              </button>
              <button onClick={onFechar} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                Fechar
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={conectar}>
            <p className="mt-1 text-xs text-slate-500">
              Entre com o mesmo CPF e senha que você usa no D.E.V. Assim o I.A Prof mostra suas turmas e envia a aula pronta para o diário.
            </p>
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              Se o e-mail da sua conta do I.A Prof for o mesmo cadastrado no D.E.V, conecta na hora. Se for diferente, você vai precisar aprovar a conexão
              dentro do D.E.V (leva 1 minuto; mostramos o passo a passo).
            </p>
            <label className="mt-3 block text-xs font-medium text-slate-500">
              CPF
              <input className={campo} inputMode="numeric" autoComplete="username" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
            </label>
            <label className="mt-2 block text-xs font-medium text-slate-500">
              Senha do D.E.V
              <input type="password" className={campo} autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </label>
            <p className="mt-2 text-[11px] text-slate-400">Sua senha do D.E.V não fica guardada no I.A Prof.</p>
            {erro && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onFechar} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button disabled={enviando} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {enviando ? "Conectando..." : "Conectar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Ja existe aula no D.E.V nesse dia: substituir, juntar ou nao enviar.
// Substituir/juntar mexem na aula que ja esta no D.E.V, entao pede confirmacao mostrando os riscos.
const RISCOS: Record<"substituir" | "juntar", { titulo: string; confirmar: string; riscos: string[] }> = {
  substituir: {
    titulo: "Tem certeza que quer substituir a aula no D.E.V?",
    confirmar: "Sim, substituir",
    riscos: [
      "O texto que está no D.E.V hoje será apagado e trocado pela aula nova.",
      "Não dá para desfazer pelo I.A Prof — se precisar do texto antigo, copie antes.",
      "Se essa aula foi lançada pelo outro regente da turma ou pela escola, ela também será trocada.",
    ],
  },
  juntar: {
    titulo: "Tem certeza que quer juntar com a aula do D.E.V?",
    confirmar: "Sim, juntar",
    riscos: [
      "A aula nova será acrescentada no final do texto que já está no D.E.V (fica um registro só).",
      "Se a mesma aula já tinha sido lançada, o conteúdo pode ficar repetido no diário.",
      "Para tirar depois, só editando o texto direto no D.E.V.",
    ],
  },
};

export function ModalConflitoDiario({
  data,
  atual,
  enviando,
  onEscolher,
}: {
  data: string;
  atual: string;
  enviando: boolean;
  onEscolher: (modo: "substituir" | "juntar" | null) => void;
}) {
  const [confirmando, setConfirmando] = useState<"substituir" | "juntar" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const dataBR = data.split("-").reverse().join("/");

  async function copiarAtual() {
    try {
      await navigator.clipboard.writeText(atual);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sem permissao: ignora */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        {confirmando ? (
          <>
            <p className="text-base font-semibold text-slate-800">⚠️ {RISCOS[confirmando].titulo}</p>
            <ul className="mt-3 space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {RISCOS[confirmando].riscos.map((r) => (
                <li key={r} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">Aula que está no D.E.V em {dataBR}:</p>
              <button onClick={copiarAtual} className="text-xs font-medium text-indigo-600 hover:underline">
                {copiado ? "✓ Copiado" : "Copiar texto atual"}
              </button>
            </div>
            <p className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">{atual}</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button disabled={enviando} onClick={() => setConfirmando(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                Voltar
              </button>
              <button
                disabled={enviando}
                onClick={() => onEscolher(confirmando)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                  confirmando === "substituir" ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {enviando ? "Enviando..." : RISCOS[confirmando].confirmar}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-slate-800">Já existe aula no D.E.V em {dataBR}</p>
            <p className="mt-1 text-xs text-slate-500">O que está no D.E.V agora:</p>
            <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">{atual}</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <button disabled={enviando} onClick={() => setConfirmando("substituir")} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
                <b>Substituir no D.E.V</b> <span className="text-xs text-slate-500">— a aula nova fica no lugar da que está lá</span>
              </button>
              <button disabled={enviando} onClick={() => setConfirmando("juntar")} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50">
                <b>Juntar</b> <span className="text-xs text-slate-500">— acrescenta a aula nova depois do texto que já está no D.E.V</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button disabled={enviando} onClick={() => onEscolher(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                Não enviar agora
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
