import { useEffect, useState } from "react";
import { registroApi, RegistroSalvo } from "../api/registroAula";
import { ANOS } from "../lib/formatarRegistro";
import { diarioApi, ErroAulaNoDiario } from "../api/diario";
import { ModalConflitoDiario } from "./Diario";

// Lista dos ultimos registros salvos
export default function Historico({ atualizar, onAbrir, onNova }: { atualizar: number; onAbrir: (r: RegistroSalvo) => void; onNova?: () => void }) {
  const [lista, setLista] = useState<RegistroSalvo[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);
  // Envio ao Diario escolar
  const [enviando, setEnviando] = useState<string | null>(null);
  const [msgDiario, setMsgDiario] = useState<{ id: string; texto: string; ok: boolean } | null>(null);
  const [conflito, setConflito] = useState<{ r: RegistroSalvo; atual: string } | null>(null);

  async function enviarDiario(r: RegistroSalvo, modo?: "substituir" | "juntar") {
    setEnviando(r._id);
    setMsgDiario(null);
    try {
      const res = await diarioApi.enviar(r._id, modo);
      setLista((l) => l.map((x) => (x._id === r._id ? { ...x, diarioEnviadoEm: res.enviadoEm } : x)));
      setMsgDiario({ id: r._id, ok: true, texto: "Enviada ao D.E.V." });
    } catch (e) {
      if (e instanceof ErroAulaNoDiario) setConflito({ r, atual: e.descricaoAtual });
      else setMsgDiario({ id: r._id, ok: false, texto: e instanceof Error ? e.message : "Erro ao enviar ao D.E.V" });
    } finally {
      setEnviando(null);
    }
  }

  useEffect(() => {
    registroApi.listar().then(setLista).catch(() => setLista([]));
  }, [atualizar]);

  async function copiar(r: RegistroSalvo) {
    await navigator.clipboard.writeText(r.textoFinal);
    setCopiado(r._id);
    setTimeout(() => setCopiado(null), 1500);
  }

  async function remover(id: string) {
    setMsgDiario(null);
    try {
      await registroApi.remover(id);
      setLista((l) => l.filter((r) => r._id !== id));
    } catch (e) {
      // aula que ainda esta no D.E.V: precisa excluir la primeiro
      setMsgDiario({ id, ok: false, texto: e instanceof Error ? e.message : "Não foi possível excluir" });
    }
  }

  if (!lista.length)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-4xl" aria-hidden>
          🗂️
        </p>
        <p className="mt-2 text-base font-semibold text-slate-800">Nenhuma aula salva ainda</p>
        <p className="mt-1 text-sm text-slate-500">As aulas que você gerar e aprovar aparecem aqui para copiar, editar ou enviar ao D.E.V.</p>
        {onNova && (
          <button onClick={onNova} className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            ✨ Gerar minha primeira aula
          </button>
        )}
      </div>
    );

  return (
    <>
    {conflito && (
      <ModalConflitoDiario
        data={conflito.r.data}
        atual={conflito.atual}
        enviando={enviando === conflito.r._id}
        onEscolher={async (modo) => {
          const alvo = conflito.r;
          if (modo) await enviarDiario(alvo, modo);
          setConflito(null);
        }}
      />
    )}
    <ul className="space-y-3">
      {lista.map((r) => {
        // Aula salva com palpite da I.A ainda nao conferido: pisca ate o professor abrir e conferir
        const aConferir = (r.itens ?? []).filter((i) => i.conferir && (i.habilidades?.length ?? 0) > 0).length;
        return (
        <li
          key={r._id}
          className={`rounded-xl border-2 bg-white p-3 transition sm:p-4 hover:shadow-sm ${
            aConferir ? "border-amber-400 motion-safe:animate-alerta" : "border-slate-200 hover:border-indigo-300"
          }`}
        >
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-slate-500">
            <span className="flex flex-wrap items-center gap-2">
              📅 {r.data.split("-").reverse().join("/")} · {ANOS.find((a) => a.valor === r.ano)?.nome ?? r.ano}
              {r.turma ? ` · Turma ${r.turma}` : ""}
              {r.diarioEnviadoEm && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700" title="Esta aula já está no D.E.V">
                  ✓ no D.E.V
                </span>
              )}
              {aConferir > 0 && (
                <button
                  onClick={() => onAbrir(r)}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
                >
                  {aConferir} palpite(s) para conferir
                </button>
              )}
            </span>
            <span className="flex gap-4 whitespace-nowrap sm:gap-3">
              <button onClick={() => onAbrir(r)} className="font-medium text-indigo-600 hover:underline">
                Abrir / editar
              </button>
              {r.diarioTurmaId && !r.diarioEnviadoEm && (
                <button
                  onClick={() => enviarDiario(r)}
                  disabled={enviando === r._id || aConferir > 0}
                  title={aConferir > 0 ? "Confira os palpites antes de enviar" : "Enviar esta aula para o D.E.V"}
                  className="font-medium text-emerald-700 hover:underline disabled:opacity-50"
                >
                  {enviando === r._id ? "Enviando…" : "📒 Enviar ao D.E.V"}
                </button>
              )}
              <button onClick={() => copiar(r)} className="font-medium text-indigo-600 hover:underline">
                {copiado === r._id ? "Copiado!" : "Copiar"}
              </button>
              <button onClick={() => remover(r._id)} className="hover:text-rose-600">
                Excluir
              </button>
            </span>
          </div>
          <button onClick={() => onAbrir(r)} className="block w-full text-left text-sm leading-relaxed text-slate-700 hover:text-indigo-700" title="Abrir para conferir/editar">
            {r.textoFinal}
          </button>
          {msgDiario?.id === r._id && (
            <p className={`mt-2 rounded-lg px-3 py-1.5 text-xs ${msgDiario.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{msgDiario.texto}</p>
          )}
        </li>
        );
      })}
    </ul>
    </>
  );
}
