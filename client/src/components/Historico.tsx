import { useEffect, useState } from "react";
import { registroApi, RegistroSalvo } from "../api/registroAula";
import { ANOS } from "../lib/formatarRegistro";

// Lista dos ultimos registros salvos
export default function Historico({ atualizar, onAbrir }: { atualizar: number; onAbrir: (r: RegistroSalvo) => void }) {
  const [lista, setLista] = useState<RegistroSalvo[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    registroApi.listar().then(setLista).catch(() => setLista([]));
  }, [atualizar]);

  async function copiar(r: RegistroSalvo) {
    await navigator.clipboard.writeText(r.textoFinal);
    setCopiado(r._id);
    setTimeout(() => setCopiado(null), 1500);
  }

  async function remover(id: string) {
    await registroApi.remover(id);
    setLista((l) => l.filter((r) => r._id !== id));
  }

  if (!lista.length) return <p className="text-sm text-slate-400">Nenhuma aula salva ainda.</p>;

  return (
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
        </li>
        );
      })}
    </ul>
  );
}
