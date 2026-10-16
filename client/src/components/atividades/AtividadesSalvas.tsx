import { useEffect, useState } from "react";
import { Atividade, atividadesApi, fmtNum } from "../../api/atividades";
import { htmlDaAtividade, imprimirAtividade, imprimirGabarito } from "./impressao";
import { PreviaAtividade } from "./AjusteAtividade";

// Lista das atividades salvas: corrigir, editar, imprimir, excluir
export default function AtividadesSalvas({
  atualizar,
  professorNome,
  onCorrigir,
  onEditar,
  onNova,
  onExterna,
  podeCorrigir = true,
  teste = false,
  onAssinar,
  destaque,
  onDestaqueVisto,
}: {
  atualizar: number;
  professorNome?: string;
  onCorrigir: (a: Atividade) => void;
  onEditar: (a: Atividade) => void;
  onNova: () => void;
  onExterna?: () => void; // atividade feita fora do I.A Prof: so o gabarito para corrigir
  podeCorrigir?: boolean;
  teste?: boolean; // teste gratis: correcao com foto so nos planos
  onAssinar?: () => void;
  destaque?: string | null; // atividade que acabou de ser salva
  onDestaqueVisto?: () => void;
}) {
  const [lista, setLista] = useState<Atividade[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [apagar, setApagar] = useState<string | null>(null);
  const [vendo, setVendo] = useState<Atividade | null>(null);

  const carregar = () =>
    atividadesApi
      .listar()
      .then(setLista)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  useEffect(() => {
    carregar();
  }, [atualizar]);
  // o destaque de "acabou de salvar" some quando o professor sai da lista
  const [salvaAgora] = useState(destaque ?? null);
  useEffect(() => {
    if (destaque) onDestaqueVisto?.();
    if (salvaAgora) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // a lista vem sem as imagens: busca a atividade completa para editar/imprimir
  const completa = (a: Atividade) => atividadesApi.obter(a._id!).catch(() => a);
  const filtradas = (lista ?? []).filter((a) => `${a.titulo} ${a.componente} ${a.turma ?? ""}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-slate-800">📝 Atividades e correção</p>
          <p className="text-sm text-slate-500">{podeCorrigir ? "Suas atividades salvas: veja, edite, imprima ou corrija e lance as notas." : "Suas atividades salvas para ver, editar e imprimir."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onExterna && (
            <button onClick={onExterna} className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50" title="Corrigir uma atividade que não foi gerada aqui">
              📥 Corrigir atividade de fora
            </button>
          )}
          <button onClick={onNova} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            ✨ Nova atividade
          </button>
        </div>
      </div>
      {salvaAgora && (
        <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          ✓ Atividade salva! {podeCorrigir ? "Ela está aqui na lista: imprima e, depois, corrija os alunos." : "Ela está aqui na lista para ver e imprimir."}
        </p>
      )}
      {teste && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <span>🎁 No teste grátis você gera, imprime, corrige à mão e lança as notas. A correção com foto (I.A) é dos planos Profissional e Premium.</span>
          {onAssinar && (
            <button onClick={onAssinar} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
              Ver planos
            </button>
          )}
        </div>
      )}
      {lista && lista.length > 3 && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, matéria ou turma"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      )}
      {erro && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{erro}</p>}
      {lista === null ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !lista.length ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Nenhuma atividade salva ainda.{" "}
          <button onClick={onNova} className="font-semibold text-indigo-600 underline">
            Gerar a primeira
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtradas.map((a) => (
            <li key={a._id} className={`rounded-xl border bg-white p-3 sm:p-4 ${a._id === salvaAgora ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {a.titulo}
                    {a.origem === "externa" && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">feita fora</span>}
                    {a._id === salvaAgora && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">nova</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.componente} · {a.turma || "sem turma"} · {a.periodo}º período · {a.questoes.length} questões · vale {fmtNum(a.valorTotal)}
                    {a.createdAt ? ` · ${new Date(a.createdAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                    {(a.corrigidas ?? 0) > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                        {a.corrigidas} corrigida(s) · {a.aprovadas} aprovada(s)
                      </span>
                    )}
                    {a.diario?.enviadoEm && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">✓ notas no D.E.V</span>}
                  </div>
                </div>
                <div className="flex w-full flex-wrap gap-1 sm:w-auto">
                  {podeCorrigir && (
                    <button onClick={() => onCorrigir(a)} className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 sm:flex-none">
                      ✅ Corrigir
                    </button>
                  )}
                  {a.origem !== "externa" && <button onClick={() => completa(a).then(setVendo)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                    👁️ Ver atividade
                  </button>}
                  <button onClick={() => completa(a).then(onEditar)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                    ✏️ Editar
                  </button>
                  {a.origem !== "externa" && <button onClick={() => completa(a).then((c) => imprimirAtividade(c, { professor: professorNome }))} className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                    🖨️ Imprimir
                  </button>}
                  <button onClick={() => completa(a).then(imprimirGabarito)} className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
                    🔑 Gabarito
                  </button>
                  {apagar === a._id ? (
                    <button
                      onClick={() => atividadesApi.remover(a._id!).then(() => (setApagar(null), carregar()))}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Confirmar exclusão
                    </button>
                  ) : (
                    <button onClick={() => setApagar(a._id!)} className="rounded-lg px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
              {apagar === a._id && a.diario?.enviadoEm && (
                <p className="mt-2 text-xs text-amber-800">As notas já lançadas no D.E.V continuam lá (apague pelo D.E.V se precisar).</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {vendo && (
        <PreviaAtividade
          html={htmlDaAtividade(vendo, { professor: professorNome })}
          onFechar={() => setVendo(null)}
          onImprimir={() => imprimirAtividade(vendo, { professor: professorNome })}
        />
      )}
    </div>
  );
}
