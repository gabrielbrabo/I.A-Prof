import { useEffect, useMemo, useRef, useState } from "react";
import { AlunosAtividade, Atividade, atividadesApi, Correcao, fmtNum, letra, pontuar, Questao, reduzirFoto, RespostaAluno, turmasApi } from "../../api/atividades";
import { SituacaoDiario } from "../../api/diario";
import { SeletorTurma, useTurmas } from "./GerarAtividade";
import { ErroApi } from "../../lib/sessao";
import { imprimirNotas } from "./impressao";

const respostaVazia = (q: Questao): RespostaAluno => ({ questao: q._id!, resposta: "", itens: q.itens.map(() => ""), pontos: 0, comentario: "", duvida: false });

// Respostas alinhadas com as questoes (correcao salva ou vazia)
function alinhar(questoes: Questao[], c?: Correcao | null): RespostaAluno[] {
  const porId = new Map((c?.respostas ?? []).map((r) => [r.questao, r]));
  return questoes.map((q) => {
    const r = porId.get(q._id!);
    return r ? { ...respostaVazia(q), ...r, itens: q.itens.map((_, i) => r.itens[i] ?? "") } : respostaVazia(q);
  });
}

// Tela de correcao de uma atividade: lista de alunos, correcao de cada um (manual ou foto) e lancamento das notas
export default function CorrigirAtividade({
  atividade: inicial,
  diario,
  fotoLiberada = true,
  onAssinar,
  onVoltar,
  onEditar,
  onUsouIA,
  onAbrirDiario,
}: {
  atividade: Atividade;
  diario: SituacaoDiario | null;
  fotoLiberada?: boolean; // teste gratis: so correcao a mao
  onAssinar?: () => void;
  onVoltar: () => void;
  onEditar: (a: Atividade) => void;
  onUsouIA: () => void;
  onAbrirDiario: () => void;
}) {
  const [atividade, setAtividade] = useState(inicial);
  const [dados, setDados] = useState<AlunosAtividade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [lancando, setLancando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [pontos, setPontos] = useState<{ total: number; usado: number; restante: number | null; aberto: boolean } | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "corrigidas" | "aprovadas">("todos");
  const [perguntarDev, setPerguntarDev] = useState(false); // fim da correcao: lancar no D.E.V?
  const [novoAluno, setNovoAluno] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const painel = useRef<HTMLDivElement>(null);

  const carregar = () =>
    atividadesApi
      .alunos(atividade._id!)
      .then((d) => {
        setDados(d);
        setErro(null);
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar os alunos"));
  useEffect(() => {
    atividadesApi.obter(inicial._id!).then(setAtividade).catch(() => {});
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial._id]);
  useEffect(() => {
    if (atividade.diarioTurmaId && atividade.diarioMateriaId) atividadesApi.pontos(atividade._id!).then(setPontos).catch(() => setPontos(null));
  }, [atividade.diarioTurmaId, atividade.diarioMateriaId, atividade._id, dados]);

  const porAluno = useMemo(() => new Map((dados?.correcoes ?? []).map((c) => [c.alunoId, c])), [dados]);
  const alunos = dados?.alunos ?? [];
  const aprovadas = (dados?.correcoes ?? []).filter((c) => c.status === "aprovada");
  const corrigidas = (dados?.correcoes ?? []).length;
  const visiveis = alunos.filter((a) => {
    const c = porAluno.get(a.id);
    if (filtro === "pendentes") return !c;
    if (filtro === "corrigidas") return c?.status === "corrigida";
    if (filtro === "aprovadas") return c?.status === "aprovada";
    return true;
  });
  const alunoSel = alunos.find((a) => a.id === sel) ?? null;
  // turma do D.E.V que recebe notas (Educacao Infantil usa conceitos: notas ficam so no I.A Prof)
  const infantilDev = dados?.fonte === "dev" && dados.dev?.notas === false;
  // atividade SEM NOTA fica so no I.A Prof (lista de acertos)
  const ehDev = dados?.fonte === "dev" && !infantilDev && !atividade.semNota;
  const valorDev = atividade.questoes.reduce((s, q) => s + (Number(q.valor) || 0), 0);
  const passaTeto = ehDev && pontos?.restante != null && valorDev > pontos.restante + 1e-9;

  function abrir(id: string | null) {
    setSel(id);
    setResultado(null);
    if (id) setTimeout(() => painel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // proximo aluno sem correcao aprovada (depois do atual)
  function proximo(depoisDe: string) {
    const i = alunos.findIndex((a) => a.id === depoisDe);
    const resto = [...alunos.slice(i + 1), ...alunos.slice(0, i)];
    return resto.find((a) => porAluno.get(a.id)?.status !== "aprovada" && a.id !== depoisDe)?.id ?? null;
  }

  // Quem nao usa o D.E.V: vai cadastrando os alunos enquanto corrige
  async function adicionarAluno() {
    const nome = novoAluno.trim();
    if (nome.length < 2) return;
    setAdicionando(true);
    setErro(null);
    try {
      const r = await atividadesApi.adicionarAluno(atividade._id!, nome);
      setNovoAluno("");
      const d = await atividadesApi.alunos(atividade._id!);
      setDados(d);
      atividadesApi.obter(atividade._id!).then(setAtividade).catch(() => {});
      abrir(r.aluno.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao adicionar o aluno");
    } finally {
      setAdicionando(false);
    }
  }

  async function escolherMateria(id: string) {
    try {
      const salva = await atividadesApi.salvar({ ...atividade, diarioMateriaId: id || null });
      setAtividade(salva);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a matéria");
    }
  }

  async function lancar() {
    setErro(null);
    setResultado(null);
    setLancando(true);
    try {
      const r = await atividadesApi.lancar(atividade._id!);
      setResultado(
        r.destino === "dev"
          ? `✓ ${r.lancadas} nota(s) lançada(s) no D.E.V${r.atualizadas ? ` (${r.atualizadas} atualizada(s))` : ""}.`
          : `✓ Lista de notas salva no I.A Prof (${r.lancadas} aluno(s)). Use "Imprimir notas" para ter a lista em papel ou PDF.`
      );
      atividadesApi.obter(atividade._id!).then(setAtividade).catch(() => {});
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao lançar as notas");
    } finally {
      setLancando(false);
    }
  }

  const notasLista = alunos.map((a) => {
    const c = porAluno.get(a.id);
    return { nome: a.nome, nota: c ? c.nota : null, status: !c ? "Sem correção" : c.status === "aprovada" ? (c.enviadaDiarioEm ? "Aprovada · no D.E.V" : "Aprovada") : "Corrigida (falta aprovar)" };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button onClick={onVoltar} className="mb-1 text-xs font-medium text-indigo-600 hover:underline">
            ← Atividades
          </button>
          <p className="text-base font-semibold text-slate-800">{atividade.titulo}</p>
          <p className="text-xs text-slate-500">
            {[atividade.componente, atividade.turma || "", atividade.periodo ? `${atividade.periodo}º período` : ""].filter(Boolean).join(" · ")}
            {atividade.semNota ? " · sem nota (conta acertos)" : ` · vale ${fmtNum(atividade.valorTotal)}`}
            {ehDev ? " · 📒 turma do D.E.V" : infantilDev ? " · 📒 turma do D.E.V (Infantil)" : ""}
          </p>
        </div>
        <button onClick={() => onEditar(atividade)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
          ✏️ Editar gabarito / valores
        </button>
      </div>

      {erro && (
        <div className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
          {erro}
          {/conect/i.test(erro) && (
            <button onClick={onAbrirDiario} className="ml-2 font-semibold underline">
              Conectar ao D.E.V
            </button>
          )}
        </div>
      )}

      {/* Sem D.E.V: cadastra o aluno e ja corrige (um por um) */}
      {dados && dados.fonte !== "dev" && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-end" data-tour="corr-novo-aluno">
          <label className="flex-1 text-xs font-medium text-slate-500">
            {alunos.length ? "Adicionar aluno e corrigir" : "Comece agora: digite o nome do aluno e corrija"}
            <input
              value={novoAluno}
              onChange={(e) => setNovoAluno(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adicionando && adicionarAluno()}
              placeholder="Nome do aluno"
              maxLength={120}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </label>
          <button onClick={adicionarAluno} disabled={adicionando || novoAluno.trim().length < 2} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {adicionando ? "Adicionando…" : "+ Adicionar e corrigir"}
          </button>
        </div>
      )}

      {dados?.fonte === "nenhuma" && (
        <ConfigurarTurma
          atividade={atividade}
          diario={diario}
          onLigada={(a) => {
            setAtividade(a);
            setDados(null);
            atividadesApi.alunos(a._id!).then(setDados).catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar os alunos"));
          }}
        />
      )}

      {/* Lista de alunos */}
      {dados && alunos.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-700">
              Alunos ({alunos.length}) · {corrigidas} corrigido(s) · {aprovadas.length} aprovado(s)
            </p>
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-xs">
              {(["todos", "pendentes", "corrigidas", "aprovadas"] as const).map((f) => (
                <button key={f} onClick={() => setFiltro(f)} className={`whitespace-nowrap rounded-md px-2 py-1 ${filtro === f ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-500"}`}>
                  {f === "todos" ? "Todos" : f === "pendentes" ? "Sem correção" : f === "corrigidas" ? "Falta aprovar" : "Aprovados"}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${alunos.length ? (aprovadas.length / alunos.length) * 100 : 0}%` }} />
          </div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {visiveis.map((a) => {
              const c = porAluno.get(a.id);
              const duvida = c?.respostas.some((r) => r.duvida) && c.status !== "aprovada";
              return (
                <li key={a.id}>
                  <button
                    onClick={() => abrir(a.id === sel ? null : a.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${a.id === sel ? "bg-indigo-600 text-white" : "hover:bg-slate-50"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                    {c ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          a.id === sel ? "bg-white/20 text-white" : c.status === "aprovada" ? "bg-emerald-50 text-emerald-700" : duvida ? "bg-amber-100 text-amber-800" : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {c.status === "aprovada" ? "✓ " : duvida ? "⚠ " : ""}
                        {fmtNum(c.nota)}
                      </span>
                    ) : (
                      <span className={`shrink-0 text-[11px] ${a.id === sel ? "text-white/80" : "text-slate-400"}`}>corrigir</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {alunoSel && (
        <div ref={painel} className="scroll-mt-28">
          <CorrecaoAluno
            key={alunoSel.id}
            atividade={atividade}
            aluno={alunoSel}
            correcao={porAluno.get(alunoSel.id) ?? null}
            fotoLiberada={fotoLiberada}
            onAssinar={onAssinar}
            onUsouIA={onUsouIA}
            onFechar={() => abrir(null)}
            onSalvo={(c, irProximo) => {
              setDados((d) => (d ? { ...d, correcoes: [...d.correcoes.filter((x) => x.alunoId !== c.alunoId), c] } : d));
              if (irProximo) {
                const prox = proximo(alunoSel.id);
                abrir(prox);
                // ultimo aluno aprovado numa turma do D.E.V: pergunta se ja lanca as notas
                if (!prox && c.status === "aprovada" && ehDev) setPerguntarDev(true);
              }
            }}
          />
        </div>
      )}

      {perguntarDev && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setPerguntarDev(false)} role="dialog" aria-modal="true" aria-labelledby="titulo-lancar-dev">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl">📒</div>
            <p id="titulo-lancar-dev" className="text-lg font-bold text-slate-800">
              Correção concluída! Lançar as notas no D.E.V?
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {aprovadas.length} aluno(s) com correção aprovada. As notas vão para o diário da turma {atividade.turma ? <b>{atividade.turma}</b> : ""} no D.E.V.
            </p>
            {passaTeto && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">O valor da atividade passa dos pontos que restam no período. Ajuste antes de lançar.</p>}
            <div className="mt-4 grid gap-2">
              <button
                onClick={() => {
                  setPerguntarDev(false);
                  void lancar();
                }}
                disabled={lancando || passaTeto || (ehDev && !atividade.diarioMateriaId)}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Sim, lançar no D.E.V
              </button>
              <button onClick={() => setPerguntarDev(false)} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lancar notas */}
      {dados && alunos.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
          <p className="text-sm font-semibold text-slate-700">{ehDev ? "📒 Lançar notas no D.E.V" : atividade.semNota ? "📋 Lista de acertos" : "📋 Lista de notas"}</p>
          {infantilDev && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
              🧸 Educação Infantil: no D.E.V esta turma usa conceitos, então as notas desta atividade ficam só aqui no I.A Prof.
            </p>
          )}
          {ehDev && !atividade.diarioMateriaId && dados.dev && (
            <label className="block text-xs font-medium text-slate-500">
              Matéria no D.E.V
              <select className="mt-1 w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm" value="" onChange={(e) => escolherMateria(e.target.value)}>
                <option value="">Selecione…</option>
                {dados.dev.materias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {ehDev && pontos && (
            <p className={`text-xs ${passaTeto || !pontos.aberto ? "text-rose-700" : "text-slate-500"}`}>
              {!pontos.aberto
                ? `O ${atividade.periodo}º período está fechado no D.E.V para esta turma. Peça para a escola reabrir.`
                : pontos.restante == null
                  ? `Esta atividade vale ${fmtNum(valorDev)} pontos.`
                  : `Esta atividade vale ${fmtNum(valorDev)}. No ${atividade.periodo}º período restam ${fmtNum(pontos.restante)} de ${fmtNum(pontos.total)} pontos nesta matéria.${passaTeto ? " Diminua o valor da atividade para lançar." : ""}`}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {ehDev
              ? "Só as correções aprovadas são lançadas. Pode lançar agora e lançar de novo depois: quem já tem nota no D.E.V é atualizado, sem duplicar."
              : "As notas aprovadas ficam salvas aqui no I.A Prof. Imprima ou salve em PDF quando precisar."}
            {aprovadas.length < alunos.length ? ` Faltam ${alunos.length - aprovadas.length} aluno(s) sem correção aprovada.` : ""}
          </p>
          {resultado && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{resultado}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => imprimirNotas(atividade, notasLista)} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              🖨️ Imprimir notas
            </button>
            <button
              onClick={lancar}
              disabled={lancando || !aprovadas.length || (ehDev && (!atividade.diarioMateriaId || passaTeto || pontos?.aberto === false))}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {lancando ? "Lançando..." : ehDev ? `Lançar ${aprovadas.length} nota(s) no D.E.V` : `Salvar lista de notas (${aprovadas.length})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Primeira correcao sem lista de alunos: escolher ou criar a turma ali mesmo ----------
function ConfigurarTurma({ atividade, diario, onLigada }: { atividade: Atividade; diario: SituacaoDiario | null; onLigada: (a: Atividade) => void }) {
  const { dev, locais, erroDev } = useTurmas(diario, atividade.anoLetivo);
  const [chave, setChave] = useState("");
  const [nomeEscolhido, setNomeEscolhido] = useState<string | null>(null);
  const [nome, setNome] = useState(atividade.turma ?? "");
  const [alunosTexto, setAlunosTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const temLista = !!(dev?.length || locais.length);
  const qtd = alunosTexto.split(/\r?\n|;/).filter((l) => l.replace(/^\s*\d+\s*[-.)º°:]?\s*/, "").trim().length >= 2).length;

  async function ligar(turma: { turmaId?: string | null; diarioTurmaId?: string | null; nome: string | null }) {
    setErro(null);
    setSalvando(true);
    try {
      const a = await atividadesApi.salvar({
        ...atividade,
        turma: turma.nome,
        turmaId: turma.turmaId ?? null,
        diarioTurmaId: turma.diarioTurmaId ?? null,
        diarioMateriaId: turma.diarioTurmaId ? atividade.diarioMateriaId : null,
      });
      onLigada(a);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a turma");
    } finally {
      setSalvando(false);
    }
  }

  async function criar() {
    setErro(null);
    setSalvando(true);
    try {
      const t = await turmasApi.salvar({ nome: nome.trim(), ano: atividade.ano, anoLetivo: atividade.anoLetivo, alunosTexto });
      await ligar({ turmaId: t._id, nome: t.nome });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar a turma");
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border-2 border-amber-300 bg-white p-3 sm:p-4" data-tour="ativ-turma-correcao">
      <div>
        <p className="text-sm font-semibold text-slate-800">👥 Para corrigir, adicione a turma e os alunos</p>
        <p className="text-xs text-slate-500">Fica salvo: nas próximas atividades é só escolher a turma.</p>
      </div>
      {temLista && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <SeletorTurma
              valor={chave}
              onChange={(v, n) => {
                setChave(v);
                setNomeEscolhido(n);
              }}
              dev={dev}
              locais={locais}
              erroDev={erroDev}
            />
          </div>
          <button
            disabled={!chave || salvando}
            onClick={() => ligar(chave.startsWith("dev:") ? { diarioTurmaId: chave.slice(4), nome: nomeEscolhido } : { turmaId: chave.slice(2), nome: nomeEscolhido })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Usar esta turma
          </button>
        </div>
      )}
      <div className={temLista ? "border-t border-slate-100 pt-3" : ""}>
        {temLista && <p className="mb-2 text-xs font-semibold text-slate-600">Ou crie uma turma agora</p>}
        <label className="block text-xs font-medium text-slate-500">
          Nome da turma
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={nome} placeholder="ex.: 4º ano A" onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="mt-2 block text-xs font-medium text-slate-500">
          Alunos — cole a lista, um nome por linha ({qtd} {qtd === 1 ? "aluno" : "alunos"})
          <textarea
            rows={6}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px]"
            placeholder={"Ana Clara Souza\nBruno Henrique Lima\n..."}
            value={alunosTexto}
            onChange={(e) => setAlunosTexto(e.target.value)}
          />
        </label>
        <div className="mt-2 flex justify-end">
          <button
            disabled={salvando || !nome.trim() || !qtd}
            onClick={criar}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Criar turma e corrigir"}
          </button>
        </div>
      </div>
      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
    </div>
  );
}

// ---------- Correcao de um aluno ----------
function CorrecaoAluno({
  atividade,
  aluno,
  correcao,
  onSalvo,
  onFechar,
  onUsouIA,
  fotoLiberada = true,
  onAssinar,
}: {
  atividade: Atividade;
  aluno: { id: string; nome: string };
  fotoLiberada?: boolean;
  onAssinar?: () => void;
  correcao: Correcao | null;
  onSalvo: (c: Correcao, irProximo: boolean) => void;
  onFechar: () => void;
  onUsouIA: () => void;
}) {
  const qs = atividade.questoes;
  const [respostas, setRespostas] = useState<RespostaAluno[]>(() => alinhar(qs, correcao));
  const [modo, setModo] = useState<"escolher" | "foto" | "form">(correcao || !fotoLiberada ? "form" : "escolher");
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [semIA, setSemIA] = useState(false);
  const [nomeLido, setNomeLido] = useState<string | null>(correcao?.nomeLido ?? null);
  const [metodo, setMetodo] = useState<"manual" | "ia">(correcao?.metodo ?? "manual");
  const entrada = useRef<HTMLInputElement>(null);

  const pontosDe = (i: number) => pontuar(qs[i], respostas[i]);
  const nota = Math.round(respostas.reduce((s, _, i) => s + pontosDe(i), 0) * 100) / 100;
  const setR = (i: number, x: Partial<RespostaAluno>) => setRespostas((l) => l.map((r, j) => (j === i ? { ...r, ...x, duvida: x.duvida ?? false } : r)));
  const duvidas = respostas.filter((r) => r.duvida).length;
  const nomeDiferente =
    nomeLido &&
    !aluno.nome
      .toLowerCase()
      .split(/\s+/)
      .some((p) => p.length > 2 && nomeLido.toLowerCase().includes(p));

  async function corrigirFoto() {
    if (!fotos.length) return;
    setErro(null);
    setEnviando(true);
    try {
      const blobs = await Promise.all(fotos.map((f) => reduzirFoto(f)));
      const c = await atividadesApi.corrigirFoto(atividade._id!, aluno.id, aluno.nome, blobs);
      setRespostas(alinhar(qs, c));
      setNomeLido(c.nomeLido);
      setMetodo("ia");
      setModo("form");
      onSalvo(c, false);
      onUsouIA();
    } catch (e) {
      if (e instanceof ErroApi && e.semAcesso) setSemIA(true);
      setErro(e instanceof Error ? e.message : "Erro ao corrigir pela foto");
    } finally {
      setEnviando(false);
    }
  }

  async function salvar(aprovar: boolean, irProximo = false) {
    setErro(null);
    setSalvando(true);
    try {
      const c = await atividadesApi.salvarCorrecao(atividade._id!, aluno.id, { alunoNome: aluno.nome, respostas, aprovar, metodo });
      onSalvo(c, irProximo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a correção");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-indigo-300 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-800">{aluno.nome}</p>
          {correcao && (
            <p className="text-xs text-slate-500">
              {correcao.status === "aprovada" ? "✓ Correção aprovada" : "Corrigida — falta aprovar"} · {correcao.metodo === "ia" ? "pela I.A (foto)" : "à mão"}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {modo === "form" && (
            <span className="rounded-lg bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-800">
              {atividade.semNota ? "Acertos" : "Nota"}: {fmtNum(nota)} / {fmtNum(atividade.valorTotal)}
            </span>
          )}
          <button onClick={onFechar} className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            ×
          </button>
        </div>
      </div>

      {modo === "escolher" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button onClick={() => setModo("foto")} className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 text-left hover:bg-indigo-100">
            <span className="block text-2xl">📷</span>
            <span className="block text-sm font-semibold text-indigo-900">Corrigir com foto (I.A)</span>
            <span className="block text-xs text-indigo-800">Tire foto da folha do aluno. A I.A corrige pelo gabarito e você confere.</span>
            <span className="mt-1 block text-[11px] font-medium text-amber-700">⚡ Usa I.A: consome do seu limite do mês (ou dos créditos).</span>
          </button>
          <button onClick={() => setModo("form")} className="rounded-xl border-2 border-slate-200 p-4 text-left hover:bg-slate-50">
            <span className="block text-2xl">✍️</span>
            <span className="block text-sm font-semibold text-slate-800">Corrigir à mão</span>
            <span className="block text-xs text-slate-500">Marque as respostas do aluno; as objetivas são somadas sozinhas. Não usa I.A.</span>
          </button>
        </div>
      )}

      {modo === "foto" && (
        <div className="space-y-3">
          <input
            ref={entrada}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const novos = Array.from(e.target.files ?? []);
              setFotos((f) => [...f, ...novos].slice(0, 4));
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(f)} alt={`Página ${i + 1}`} className="h-28 w-20 rounded-lg object-cover ring-1 ring-slate-200" />
                <button
                  onClick={() => setFotos((l) => l.filter((_, j) => j !== i))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
                  aria-label="Remover foto"
                >
                  ×
                </button>
              </div>
            ))}
            {fotos.length < 4 && (
              <button
                onClick={() => entrada.current?.click()}
                className="flex h-28 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-indigo-300 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <span className="text-2xl">📷</span>
                {fotos.length ? "+ página" : "Tirar foto"}
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">Dica: folha inteira na foto, bem iluminada e reta. Até 4 páginas por aluno. ⚡ Cada correção com foto consome do seu limite do mês (ou dos créditos).</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setModo("escolher")} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
              Voltar
            </button>
            <button onClick={corrigirFoto} disabled={!fotos.length || enviando} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {enviando ? "A I.A está corrigindo..." : "✨ Corrigir com I.A"}
            </button>
          </div>
        </div>
      )}

      {erro && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {erro}
          {semIA && (
            <button onClick={() => (setModo("form"), setErro(null))} className="ml-2 font-semibold underline">
              Corrigir à mão
            </button>
          )}
        </div>
      )}

      {modo === "form" && (
        <>
          {nomeDiferente && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ O nome escrito na folha parece ser <b>{nomeLido}</b>. Confira se a foto é mesmo de {aluno.nome}.
            </p>
          )}
          {duvidas > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              ⚠️ {duvidas} questão(ões) em amarelo: a I.A teve dúvida. Confira antes de aprovar.
            </p>
          )}
          <ol className="space-y-2">
            {qs.map((q, i) => {
              const r = respostas[i];
              const p = pontosDe(i);
              return (
                <li key={q._id} className={`rounded-lg border p-3 ${r.duvida ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm text-slate-700">
                      <b>{i + 1}.</b> {q.enunciado.length > 160 ? `${q.enunciado.slice(0, 160)}…` : q.enunciado}
                    </p>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${p >= q.valor ? "bg-emerald-50 text-emerald-700" : p > 0 ? "bg-amber-50 text-amber-800" : "bg-rose-50 text-rose-700"}`}>
                      {fmtNum(p)}/{fmtNum(q.valor)}
                    </span>
                  </div>

                  {q.tipo === "multipla" && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-slate-500">Aluno marcou:</span>
                      {q.alternativas.map((_, j) => {
                        const l = letra(j);
                        const marcada = r.resposta === l;
                        return (
                          <button
                            key={l}
                            onClick={() => setR(i, { resposta: marcada ? "" : l })}
                            className={`h-8 w-8 rounded-full text-sm font-bold ${
                              marcada ? (l === q.resposta ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                            aria-pressed={marcada}
                          >
                            {l}
                          </button>
                        );
                      })}
                      <span className="text-[11px] text-emerald-700">gabarito: {q.resposta}</span>
                    </div>
                  )}

                  {q.tipo === "vf" && (
                    <div className="mt-2 space-y-1">
                      {q.itens.map((it, j) => {
                        const m = r.itens[j] || "";
                        return (
                          <div key={j} className="flex items-center gap-2 text-xs">
                            <div className="flex shrink-0 overflow-hidden rounded-md ring-1 ring-slate-300">
                              {(["V", "F"] as const).map((vf) => (
                                <button
                                  key={vf}
                                  onClick={() => setR(i, { itens: r.itens.map((x, k) => (k === j ? (x === vf ? "" : vf) : x)) })}
                                  className={`w-7 py-1 font-bold ${m === vf ? (vf === it.resposta ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "bg-white text-slate-500"}`}
                                  aria-pressed={m === vf}
                                >
                                  {vf}
                                </button>
                              ))}
                            </div>
                            <span className="min-w-0 flex-1 text-slate-600">{it.texto}</span>
                            <span className="shrink-0 text-emerald-700">({it.resposta})</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(q.tipo === "discursiva" || q.tipo === "completar") && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[11px] text-emerald-700">Esperado: {q.resposta}</p>
                      {(metodo === "ia" || r.resposta) && (
                        <p className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">
                          <span className="text-slate-400">Aluno escreveu: </span>
                          {r.resposta || <i className="text-slate-400">(em branco ou não lido)</i>}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">Pontos:</span>
                        {[0, q.valor / 2, q.valor].map((v, k) => (
                          <button
                            key={k}
                            onClick={() => setR(i, { pontos: Math.round(v * 100) / 100 })}
                            className={`rounded-md px-2 py-1 text-xs font-semibold ${Math.abs(r.pontos - v) < 0.01 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                          >
                            {k === 0 ? "Errou (0)" : k === 1 ? `Metade (${fmtNum(v)})` : `Certo (${fmtNum(v)})`}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={0}
                          max={q.valor}
                          step={0.1}
                          value={r.pontos}
                          onChange={(e) => setR(i, { pontos: Math.min(q.valor, Math.max(0, Number(e.target.value) || 0)) })}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                          aria-label="Pontos da questão"
                        />
                      </div>
                    </div>
                  )}
                  {r.comentario && <p className="mt-1 text-[11px] italic text-slate-500">I.A: {r.comentario}</p>}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
            {!fotoLiberada ? (
              <span className="text-xs text-slate-500">
                📷 Correção com foto (I.A) nos planos Profissional e Premium.{" "}
                {onAssinar && (
                  <button onClick={onAssinar} className="font-medium text-indigo-600 hover:underline">
                    Ver planos
                  </button>
                )}
              </span>
            ) : metodo === "manual" && !correcao ? (
              <button onClick={() => setModo("foto")} className="text-xs font-medium text-indigo-600 hover:underline">
                📷 Corrigir com foto
              </button>
            ) : (
              <button onClick={() => (setFotos([]), setModo("foto"))} className="text-xs font-medium text-indigo-600 hover:underline">
                📷 Enviar outra foto
              </button>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => salvar(false)} disabled={salvando} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                Salvar sem aprovar
              </button>
              <button onClick={() => salvar(true)} disabled={salvando} className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
                ✓ Aprovar
              </button>
              <button onClick={() => salvar(true, true)} disabled={salvando} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                {salvando ? "Salvando..." : "✓ Aprovar e próximo →"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
