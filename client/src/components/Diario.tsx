import { useState } from "react";
import { diarioApi, SituacaoDiario } from "../api/diario";

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

  async function conectar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const r = await diarioApi.conectar(cpf, senha);
      onMudou({ ...situacao, ...r, conectado: true });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !enviando && onFechar()}>
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-semibold text-slate-800">📒 D.E.V</p>
        {!situacao.disponivel ? (
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
