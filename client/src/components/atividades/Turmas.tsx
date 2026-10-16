import { useEffect, useState } from "react";
import { Turma, turmasApi } from "../../api/atividades";
import { diarioApi, nomeTurmaDiario, SituacaoDiario, TurmaDiario } from "../../api/diario";
import { ANOS } from "../../lib/formatarRegistro";

const campo =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

// Turmas do I.A Prof: o professor cola a lista de alunos (um por linha). Quem usa o D.E.V nao precisa:
// os alunos das turmas do D.E.V vem de la.
export default function Turmas({ diario, onAbrirDiario }: { diario: SituacaoDiario | null; onAbrirDiario: () => void }) {
  return (
    <div className="space-y-8">
      {diario?.conectado && <TurmasDev />}
      <TurmasLocais diario={diario} onAbrirDiario={onAbrirDiario} />
    </div>
  );
}

// Turmas do D.E.V (professor conectado): so leitura — alunos vem do diario
function TurmasDev() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [turmas, setTurmas] = useState<TurmaDiario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [alunos, setAlunos] = useState<Record<string, Array<{ id: string; nome: string }> | "carregando" | { erro: string }>>({});

  useEffect(() => {
    setTurmas(null);
    setErro(null);
    diarioApi
      .turmas(String(ano))
      .then(setTurmas)
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível carregar as turmas do D.E.V"));
  }, [ano]);

  function abrir(id: string) {
    setAberta((a) => (a === id ? null : id));
    if (alunos[id] && alunos[id] !== "carregando" && !("erro" in (alunos[id] as object))) return;
    setAlunos((m) => ({ ...m, [id]: "carregando" }));
    diarioApi
      .alunos(id)
      .then((r) => setAlunos((m) => ({ ...m, [id]: r.alunos })))
      .catch((e) => setAlunos((m) => ({ ...m, [id]: { erro: e instanceof Error ? e.message : "Erro ao carregar os alunos" } })));
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-800">📒 Minhas turmas no D.E.V</p>
          <p className="text-sm text-slate-500">Vêm direto do D.E.V. Para mudar turma ou alunos, altere no D.E.V.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Ano letivo
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {[0, -1].map((d) => {
              const a = new Date().getFullYear() + d;
              return (
                <option key={a} value={a}>
                  {a}
                </option>
              );
            })}
          </select>
        </label>
      </div>
      {erro && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{erro}</p>}
      {!erro && turmas === null && <p className="text-sm text-slate-500">Carregando turmas do D.E.V…</p>}
      {turmas && !turmas.length && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhuma turma sua no D.E.V em {ano}.</p>
      )}
      {turmas && turmas.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {turmas.map((t) => {
            const lista = alunos[t.id];
            const on = aberta === t.id;
            return (
              <li key={t.id} className={`rounded-xl border bg-white p-3 ${on ? "border-indigo-300 sm:col-span-2" : "border-slate-200"}`}>
                <button onClick={() => abrir(t.id)} className="flex w-full items-start justify-between gap-2 text-left" aria-expanded={on}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {nomeTurmaDiario(t)}
                      {t.papel === "ED_FISICA" && <span className="ml-1.5 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">Ed. Física</span>}
                      {t.notas === false && (
                        <span title="No D.E.V esta turma usa conceitos: atividades e notas ficam só no I.A Prof" className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          Infantil · conceitos
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {t.escola}
                      {t.turno ? ` · ${t.turno}` : ""}
                      {Array.isArray(lista) ? ` · ${lista.length} alunos` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-medium text-indigo-600">{on ? "Fechar ▴" : "Ver alunos ▾"}</span>
                </button>
                {on && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {lista === "carregando" || lista === undefined ? (
                      <p className="text-sm text-slate-500">Carregando alunos…</p>
                    ) : "erro" in (lista as object) ? (
                      <p className="text-sm text-rose-600">{(lista as { erro: string }).erro}</p>
                    ) : (lista as Array<{ id: string; nome: string }>).length === 0 ? (
                      <p className="text-sm text-slate-500">Nenhum aluno nesta turma no D.E.V.</p>
                    ) : (
                      <ol className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
                        {(lista as Array<{ id: string; nome: string }>).map((a, i) => (
                          <li key={a.id} className="flex gap-2">
                            <span className="w-6 shrink-0 text-right text-xs text-slate-400">{i + 1}.</span>
                            <span className="min-w-0 truncate">{a.nome}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Turmas criadas no I.A Prof (lista colada)
function TurmasLocais({ diario, onAbrirDiario }: { diario: SituacaoDiario | null; onAbrirDiario: () => void }) {
  const [turmas, setTurmas] = useState<Turma[] | null>(null);
  const [form, setForm] = useState<{ _id?: string; nome: string; ano: string; alunosTexto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [apagar, setApagar] = useState<string | null>(null);

  const carregar = () => turmasApi.listar().then(setTurmas).catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  useEffect(() => {
    carregar();
  }, []);

  const qtd = form ? form.alunosTexto.split(/\r?\n|;/).filter((l) => l.replace(/^\s*\d+\s*[-.)º°:]?\s*/, "").trim().length >= 2).length : 0;

  async function salvar() {
    if (!form) return;
    setErro(null);
    setSalvando(true);
    try {
      await turmasApi.salvar({ _id: form._id, nome: form.nome, ano: form.ano || null, anoLetivo: new Date().getFullYear(), alunosTexto: form.alunosTexto });
      setForm(null);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-800">{diario?.conectado ? "👥 Outras turmas (fora do D.E.V)" : "👥 Turmas e alunos"}</p>
          <p className="text-sm text-slate-500">
            {diario?.conectado ? "Para turmas que não estão no D.E.V: cole a lista de alunos." : "A lista de alunos é usada na correção das atividades e na lista de notas."}
          </p>
        </div>
        {!form && (
          <button onClick={() => setForm({ nome: "", ano: "", alunosTexto: "" })} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            + Nova turma
          </button>
        )}
      </div>

      {diario && !diario.conectado && (
        <div className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {diario.conectado ? null : (
            <>
              📒 Sua escola usa o D.E.V?{" "}
              <button onClick={onAbrirDiario} className="font-semibold underline">
                Conecte sua conta
              </button>{" "}
              e as turmas e alunos vêm de lá — e as notas vão direto para o diário.
            </>
          )}
        </div>
      )}

      {form && (
        <div className="space-y-3 rounded-xl border-2 border-indigo-200 bg-white p-3 sm:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-500">
              Nome da turma
              <input className={campo} value={form.nome} placeholder="ex.: 4º ano A" onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </label>
            <label className="text-xs font-medium text-slate-500">
              Série
              <select className={campo} value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })}>
                <option value="">—</option>
                {ANOS.map((a) => (
                  <option key={a.valor} value={a.valor}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-slate-500">
            Alunos — cole a lista, um nome por linha ({qtd} {qtd === 1 ? "aluno" : "alunos"})
            <textarea
              rows={10}
              className={`${campo} font-mono text-[13px]`}
              placeholder={"Ana Clara Souza\nBruno Henrique Lima\nCarla Mendes\n..."}
              value={form.alunosTexto}
              onChange={(e) => setForm({ ...form, alunosTexto: e.target.value })}
            />
          </label>
          <p className="text-[11px] text-slate-400">Pode colar da chamada, de uma planilha ou do Word. Números na frente (1., 02 -) são ignorados.</p>
          {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando || !form.nome.trim() || !qtd} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar turma"}
            </button>
          </div>
        </div>
      )}

      {turmas === null ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : turmas.length === 0 && !form ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {diario?.conectado ? "Nenhuma turma fora do D.E.V." : "Nenhuma turma cadastrada no I.A Prof ainda."}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {turmas.map((t) => (
            <li key={t._id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{t.nome}</p>
                  <p className="text-xs text-slate-500">
                    {t.alunos.length} alunos{t.ano ? ` · ${ANOS.find((a) => a.valor === t.ano)?.nome ?? t.ano}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 text-xs">
                  <button
                    onClick={() => setForm({ _id: t._id, nome: t.nome, ano: t.ano ?? "", alunosTexto: t.alunos.map((a) => a.nome).join("\n") })}
                    className="rounded-lg px-2 py-1 font-medium text-indigo-600 hover:bg-indigo-50"
                  >
                    Editar
                  </button>
                  {apagar === t._id ? (
                    <button
                      onClick={() => turmasApi.remover(t._id).then(() => (setApagar(null), carregar()))}
                      className="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white"
                    >
                      Confirmar
                    </button>
                  ) : (
                    <button onClick={() => setApagar(t._id)} className="rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50">
                      Excluir
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-slate-500">{t.alunos.map((a) => a.nome).join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
