import { useEffect, useMemo, useState } from "react";
import { ErroExtracao, EXTENSOES, ItemPlano, ModoErrado, PeriodoPlano, periodosPadrao, planoApi, TipoPeriodo } from "../api/planoCurso";
import { habilidadeApi, Opcao } from "../api/registroAula";
import { ANOS, UFS } from "../lib/formatarRegistro";
import { gravarPref, lerPref, ufParaApi } from "../lib/prefs";

const NOME_PERIODO: Record<TipoPeriodo, string> = { bimestre: "Bimestre", trimestre: "Trimestre", semestre: "Semestre" };
const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
const SEGUNDOS_CONFERIR = 15; // tempo do aviso "confira antes de salvar" apos ler um arquivo
// Assinatura de um periodo: muda quando datas ou habilidades mudam (para saber se esta salvo)
const assinatura = (p: PeriodoPlano) =>
  JSON.stringify([p.inicio, p.fim, p.itens.map((i) => [i.componente, i.codigo, i.habilidade, i.recomposicao ?? false])]);
// Palavras do texto A que nao aparecem no B (para destacar a diferenca entre PDF e texto oficial)
const semAcento = (w: string) => w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
function destacarDiferenca(a: string, b: string) {
  const emB = new Set(b.split(/\s+/).map(semAcento));
  return a.split(/(\s+)/).map((w, k) =>
    /\S/.test(w) && semAcento(w).length >= 3 && !emB.has(semAcento(w)) ? (
      <mark key={k} className="rounded bg-amber-200 px-0.5 text-amber-900">
        {w}
      </mark>
    ) : (
      <span key={k}>{w}</span>
    )
  );
}

const chaveItem = (i: ItemPlano) => i.codigo ?? `${i.componente}|${i.habilidade ?? i.conteudo}`;

export default function PlanoCurso({ onMudou }: { onMudou?: () => void }) {
  // Cabecalho
  // Serie e UF comecam vazias ate o professor escolher a primeira vez
  const [ano, setAno] = useState(() => lerPref("ano", ""));
  const [uf, setUf] = useState(() => lerPref("uf", ""));
  // Turma desativada ate integrar com o Diario: o plano vale para a serie no ano letivo
  const turma = "";
  const [anoLetivo, setAnoLetivo] = useState(() => Number(lerPref("anoLetivo", String(new Date().getFullYear()))));
  // Divisao do ano: comeca vazia — o professor precisa escolher antes de enviar documentos
  const [tipo, setTipo] = useState<TipoPeriodo | "">("");

  // Plano em edicao
  const [planoId, setPlanoId] = useState<string | undefined>();
  const [salvos, setSalvos] = useState<Record<number, string>>({}); // assinatura de cada periodo como esta salvo
  const [periodos, setPeriodos] = useState<PeriodoPlano[]>([]);
  const [arquivosOrigem, setArquivosOrigem] = useState<string[]>([]);
  const [aba, setAba] = useState(1);

  // Upload
  const [modo, setModo] = useState<"todos" | "periodo">("todos");
  const [periodoUpload, setPeriodoUpload] = useState(0); // 0 = ainda nao escolhido
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0); // recria o input de arquivo para limpar a selecao

  const [carregando, setCarregando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [trava, setTrava] = useState(0); // segundos restantes do aviso de conferencia (salvar travado)
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [textoExcluir, setTextoExcluir] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [conferencia, setConferencia] = useState<{
    habilidades: number;
    recomposicao: number;
    fora: string[];
    semPeriodo: string[];
    citadosFora: string[];
    recuperados: string[];
    avisoPeriodo: string | null;
    versao: string | null;
  } | null>(null);

  // Grava a preferencia e avisa o App (o aviso da aba "Plano de curso" depende da serie/ano letivo)
  const pref = (k: string, v: string) => {
    gravarPref(k, v);
    onMudou?.();
  };

  // Carrega o plano salvo da serie/ano letivo. Se existir, ja define a divisao do ano dele.
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    setAviso(null);
    setTipo("");
    setPeriodos([]);
    setPlanoId(undefined);
    setSalvos({});
    setArquivosOrigem([]);
    setPeriodoUpload(0);
    if (!ano) {
      setCarregando(false);
      return;
    }
    planoApi
      .obter(ano, anoLetivo, turma || undefined)
      .then((p) => {
        if (!ativo || !p) return;
        setPlanoId(p._id);
        setTipo(p.tipoPeriodo);
        setPeriodos(p.periodos);
        setSalvos(Object.fromEntries(p.periodos.map((x) => [x.numero, assinatura(x)])));
        setArquivosOrigem(p.arquivos ?? []);
        setAba(1);
        setAlterado(false);
      })
      .catch(() => ativo && setErro("Não consegui falar com o servidor. Confira se o server está rodando (npm run dev)."))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [ano, anoLetivo, turma]);

  // Troca da divisao do ano: recria os periodos (as habilidades ja lidas sao descartadas)
  function mudarTipo(novo: TipoPeriodo | "") {
    const tinhaItens = periodos.some((p) => p.itens.length);
    setTipo(novo);
    setPeriodos(novo ? periodosPadrao(novo, anoLetivo) : []);
    setPeriodoUpload(0);
    setAba(1);
    setAlterado(!!planoId || tinhaItens);
    setAviso(tinhaItens ? "Divisão do ano alterada: as habilidades foram limpas. Envie o plano novamente." : null);
  }

  const totalItens = useMemo(() => periodos.reduce((s, p) => s + p.itens.length, 0), [periodos]);
  const periodoAtual = periodos.find((p) => p.numero === aba);

  function atualizarPeriodo(numero: number, mudar: (p: PeriodoPlano) => PeriodoPlano) {
    setPeriodos((ps) => ps.map((p) => (p.numero === numero ? mudar(p) : p)));
    setAlterado(true);
  }

  // Le o arquivo assim que e escolhido, SEMPRE sem I.A (custo zero), nos dois modos.
  // Arquivo enviado na opcao errada (ano inteiro x um arquivo de cada periodo): aviso por 7 segundos
  const [modoAviso, setModoAviso] = useState<ModoErrado | null>(null);
  useEffect(() => {
    if (!modoAviso) return;
    const t = window.setTimeout(() => setModoAviso(null), 7000);
    return () => window.clearTimeout(t);
  }, [modoAviso]);

  async function lerArquivos(lista: File[]) {
    if (!tipo || !lista.length || lendo) return;
    if (modo === "periodo" && !periodoUpload) return;
    setConferencia(null);
    setErro(null);
    setAviso(null);
    setModoAviso(null);
    setLendo(true);
    try {
      const r = await planoApi.extrair({
        arquivos: lista,
        ano,
        uf: ufParaApi(uf) ?? undefined,
        tipoPeriodo: tipo,
        periodo: modo === "todos" ? "todos" : periodoUpload,
        anoLetivo,
        turma: turma || null,
      });
      if (r.modoErrado) setModoAviso(r.modoErrado);
      // Ano todo: substitui todos os periodos. Por periodo: substitui so o escolhido.
      setPeriodos((ps) =>
        ps.map((p) => {
          const novo = r.periodos.find((x) => x.numero === p.numero);
          if (modo === "todos") return { ...p, itens: novo?.itens ?? [] };
          return p.numero === periodoUpload ? { ...p, itens: novo?.itens ?? [] } : p;
        })
      );
      setArquivosOrigem((a) => [...new Set([...a, ...r.arquivos])]);
      setAlterado(true);
      setTrava(SEGUNDOS_CONFERIR); // aviso de conferencia: salvar fica travado por alguns segundos
      setArquivos([]);
      setInputKey((k) => k + 1);
      setAba(modo === "todos" ? 1 : periodoUpload);
      // Leva o professor direto para a revisao (onde estao os botoes de salvar)
      setTimeout(() => document.getElementById("revisao-plano")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      const todos = r.periodos.flatMap((p) => p.itens);
      const qtdRec = todos.filter((i) => i.recomposicao).length;
      const foraBase = todos.filter((i) => i.codigo && !i.noBanco).length;
      const semDescricao = todos.filter((i) => !i.habilidade).length;
      const sugestoes = todos.filter((i) => i.textoOficial).length;
      const fora = r.foraDaLeitura ?? [];
      // Conferencia: quantos codigos o documento tem x quantos entraram no plano
      setConferencia(
        r.metodo === "sem-ia"
          ? {
              habilidades: todos.length - qtdRec,
              recomposicao: qtdRec,
              fora,
              semPeriodo: r.semPeriodo ?? [],
              citadosFora: r.citadosFora ?? [],
              recuperados: r.recuperados ?? [],
              avisoPeriodo: r.avisoPeriodo ?? null,
              versao: r.versaoLeitura ?? null,
            }
          : null
      );
      setAviso(
        `${todos.length - qtdRec} habilidades` +
          (qtdRec ? ` + ${qtdRec} de recomposição` : "") +
          (modo === "periodo" ? ` no ${periodoUpload}º ${tipo}` : "") +
          " (lidas direto do documento, sem I.A)." +
          (r.naoIdentificados ? ` ${r.naoIdentificados} sem período indicado no documento não entraram (veja abaixo).` : "") +
          (foraBase ? ` ${foraBase} código(s) não estão na base: serão cadastrados ao salvar.` : "") +
          (semDescricao ? ` ${semDescricao} sem descrição: confira.` : "") +
          (sugestoes ? ` ${sugestoes} com possível erro de digitação no PDF (destacadas em amarelo): escolha entre o texto oficial e o do PDF.` : "") +
          " Revise e clique em Salvar plano."
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao ler o plano");
      if (e instanceof ErroExtracao && e.modoErrado) setModoAviso(e.modoErrado);
      setArquivos([]);
      setInputKey((k) => k + 1);
    } finally {
      setLendo(false);
    }
  }

  // Contagem regressiva do aviso de conferencia
  useEffect(() => {
    if (trava <= 0) return;
    const t = setTimeout(() => setTrava((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [trava]);

  async function salvar() {
    if (!tipo || trava > 0) return;
    // Datas sao opcionais; so nao deixa salvar com inicio depois do fim
    setErro(null);
    setSalvando(true);
    try {
      const r = await planoApi.salvar({
        turma: turma || null,
        ano,
        uf: ufParaApi(uf),
        anoLetivo,
        tipoPeriodo: tipo,
        periodos,
        arquivos: arquivosOrigem,
      });
      setPlanoId(r.plano._id);
      onMudou?.();
      setSalvos(Object.fromEntries(periodos.map((x) => [x.numero, assinatura(x)])));
      setAlterado(false);
      setAviso(`Plano salvo! ${r.codigosCadastrados ? `${r.codigosCadastrados} código(s) novo(s) cadastrado(s) na base.` : ""}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!planoId || textoExcluir.trim().toUpperCase() !== "EXCLUIR") return;
    setExcluindo(true);
    try {
      await planoApi.remover(planoId);
      setPlanoId(undefined);
      setSalvos({});
      setPeriodos(tipo ? periodosPadrao(tipo, anoLetivo) : []);
      setArquivosOrigem([]);
      setConfirmarExcluir(false);
      setTextoExcluir("");
      setAlterado(false);
      setAviso("Plano excluído.");
      onMudou?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setExcluindo(false);
    }
  }

  // Datas dos periodos: comecam zeradas e precisam ser cadastradas pelo professor

  // Periodo salvo = igual ao que esta gravado no servidor
  const periodoSalvo = (p: PeriodoPlano) => !!planoId && salvos[p.numero] === assinatura(p);
  const tudoSalvo = !!planoId && periodos.length > 0 && periodos.every(periodoSalvo);
  // Todos os periodos com habilidades e salvos: o envio de arquivos some (da para reabrir se precisar substituir)
  const planoCompleto = tudoSalvo && periodos.every((p) => p.itens.length > 0);
  const [mostrarEnvio, setMostrarEnvio] = useState(false);
  useEffect(() => {
    if (!planoCompleto) setMostrarEnvio(false);
  }, [planoCompleto]);

  // Botao de salvar usado no topo e no final da revisao
  const botaoSalvar = (
    <button
      data-tour="pc-salvar"
      onClick={salvar}
      disabled={salvando || !totalItens || !tipo || trava > 0 || tudoSalvo}
      className={
        tudoSalvo
          ? "rounded-lg bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-300"
          : "rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      }
    >
      {salvando ? "Salvando..." : tudoSalvo ? "✓ Plano salvo" : trava > 0 ? `Confira o plano… (${trava})` : "Salvar plano"}
    </button>
  );

  const nomeTipo = tipo ? NOME_PERIODO[tipo] : "";

  return (
    <div className="space-y-5">
      {/* Cabecalho */}
      <div data-tour="pc-cabecalho" className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:grid-cols-4">
        <div data-tour="pc-serie">
          <label className="text-xs font-medium text-slate-500">Série</label>
          <select
            className={`${campo} ${!ano ? "border-amber-400 bg-amber-50" : ""}`}
            value={ano}
            onChange={(e) => (setAno(e.target.value), pref("ano", e.target.value))}
          >
            <option value="">Selecione…</option>
            {ANOS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <div data-tour="pc-uf">
          <label className="text-xs font-medium text-slate-500">UF</label>
          <select
            className={`${campo} ${!uf ? "border-amber-400 bg-amber-50" : ""}`}
            value={uf}
            onChange={(e) => (setUf(e.target.value), pref("uf", e.target.value))}
          >
            <option value="">Selecione…</option>
            <option value="BNCC">BNCC</option>
            {UFS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div data-tour="pc-ano">
          <label className="text-xs font-medium text-slate-500">Ano letivo</label>
          <input
            type="number"
            className={campo}
            value={anoLetivo}
            onChange={(e) => (setAnoLetivo(Number(e.target.value)), pref("anoLetivo", e.target.value))}
          />
        </div>
        <div data-tour="pc-divisao">
          <label className="text-xs font-medium text-slate-500">Divisão do ano *</label>
          <select
            className={`${campo} ${!tipo && ano && uf ? "border-amber-400 bg-amber-50" : ""}`}
            value={tipo}
            disabled={!ano || !uf}
            onChange={(e) => mudarTipo(e.target.value as TipoPeriodo | "")}
          >
            <option value="">Selecione…</option>
            <option value="bimestre">Bimestres (4)</option>
            <option value="trimestre">Trimestres (3)</option>
            <option value="semestre">Semestres (2)</option>
          </select>
        </div>
      </div>

      {(!ano || !uf) && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Selecione a <b>série</b> e a <b>UF</b> para cadastrar o plano de curso.
        </div>
      )}
      {ano && uf && !tipo && !carregando && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Selecione a <b>divisão do ano</b> (bimestres, trimestres ou semestres) para cadastrar o plano de curso.
        </div>
      )}

      {tipo && ano && uf && planoCompleto && !mostrarEnvio && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>
            ✓ <b>Plano completo:</b> {periodos.length === 1 ? "o período está salvo" : `todos os ${periodos.length} ${tipo === "semestre" ? "semestres" : `${tipo}s`} estão salvos`}.
          </span>
          <button type="button" onClick={() => setMostrarEnvio(true)} className="text-xs font-medium text-emerald-700 underline hover:text-emerald-900">
            Enviar outro arquivo (substituir)
          </button>
        </div>
      )}

      {tipo && ano && uf && (!planoCompleto || mostrarEnvio) && (
        <>
          {/* Upload */}
          <div data-tour="pc-envio" className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-700">Enviar plano de curso</p>
            <p className="mb-3 text-xs text-slate-500">PDF com texto, Word (.docx), Excel (.xlsx), CSV ou TXT. As habilidades são lidas direto do documento, sem custo.</p>
            {modoAviso && (
              <div role="alert" className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <p>
                  ⚠️ <b>Confira a opção de envio:</b> {modoAviso.mensagem}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setModo(modoAviso.sugerido);
                    setModoAviso(null);
                  }}
                  className="mt-1.5 rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600"
                >
                  {modoAviso.sugerido === "todos" ? "Mudar para: um arquivo com o plano do ano inteiro" : "Mudar para: um arquivo com o plano de cada período"}
                </button>
              </div>
            )}
            <div data-tour="pc-modo" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={modo === "todos"} onChange={() => setModo("todos")} /> Um arquivo com o plano do ano inteiro
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={modo === "periodo"} onChange={() => setModo("periodo")} /> Um arquivo com o plano de cada período
              </label>
              {modo === "periodo" && (
                <select
                  className={`rounded-lg border px-2 py-1 text-sm ${periodoUpload ? "border-slate-300" : "border-amber-400 bg-amber-50"}`}
                  value={periodoUpload}
                  onChange={(e) => setPeriodoUpload(Number(e.target.value))}
                >
                  <option value={0}>Selecione o {tipo}…</option>
                  {periodos.map((p) => (
                    <option key={p.numero} value={p.numero}>
                      {p.numero}º {nomeTipo}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {/* Exemplo pequeno de onde vai cada arquivo */}
            <div data-tour="pc-exemplo" className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <p className="mb-1 font-semibold text-slate-700">Exemplo:</p>
              {modo === "todos" ? (
                <div className="space-y-0.5">
                  <p>
                    📄 <b>plano-{(ANOS.find((x) => x.valor === ano)?.nome ?? ano).toLowerCase().replace(/\s+/g, "-")}-{anoLetivo}.pdf</b> <span className="text-slate-400">(um arquivo só, com todos os períodos dentro)</span>
                  </p>
                  {periodos.map((p) => (
                    <p key={p.numero} className="pl-5 font-mono text-[11px] text-slate-500">
                      {p.numero}º {nomeTipo.toUpperCase()} → habilidades do {p.numero}º {tipo}
                    </p>
                  ))}
                  <p className="pt-0.5">Envie uma vez só: o sistema separa as habilidades em cada {tipo}.</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {periodos.map((p) => (
                    <p key={p.numero}>
                      📄 <b>plano-{p.numero}º-{tipo}.pdf</b> → escolha <b>“{p.numero}º {nomeTipo}”</b> e envie
                    </p>
                  ))}
                  <p className="pt-0.5">Um arquivo para cada {tipo}: escolha o {tipo} na lista e depois o arquivo dele.</p>
                </div>
              )}
            </div>
            {/* Area para escolher (ou arrastar) o arquivo: mais clara que o botao padrao do navegador */}
            <label
              data-tour="pc-arquivo"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (lendo || (modo === "periodo" && !periodoUpload)) return;
                const lista = Array.from(e.dataTransfer.files ?? []);
                if (!lista.length) return;
                setArquivos(lista);
                lerArquivos(lista);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
                lendo || (modo === "periodo" && !periodoUpload)
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                  : "border-indigo-300 bg-indigo-50/40 hover:bg-indigo-50"
              }`}
            >
              <input
                key={inputKey}
                type="file"
                multiple
                accept={EXTENSOES}
                disabled={lendo || (modo === "periodo" && !periodoUpload)}
                onChange={(e) => {
                  const lista = Array.from(e.target.files ?? []);
                  setArquivos(lista);
                  lerArquivos(lista); // sem botao: le na hora, sem I.A
                }}
                className="sr-only"
              />
              <span className="text-3xl" aria-hidden>
                {lendo ? "⏳" : "📎"}
              </span>
              <span className="text-sm font-semibold text-indigo-800">
                {lendo ? "Lendo o arquivo..." : modo === "periodo" && !periodoUpload ? `Escolha o ${tipo} acima primeiro` : "Toque para escolher o arquivo"}
              </span>
              {!lendo && <span className="text-xs text-slate-500">ou arraste aqui · PDF, Word, Excel, CSV ou TXT</span>}
              {arquivos.length > 0 && !lendo && <span className="mt-1 text-xs text-slate-600">📄 {arquivos.map((a) => a.name).join(", ")}</span>}
            </label>
            {modo === "todos" ? (
              <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                💡 O arquivo precisa ter títulos como <b>"1º {nomeTipo}"</b>, <b>"2º {nomeTipo}"</b>… antes das habilidades. Se não tiver, escolha{" "}
                <b>"Um arquivo com o plano de cada período"</b>.
                {totalItens > 0 && <span className="block pt-1">Enviar um novo arquivo substitui as habilidades de todos os períodos.</span>}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {periodoUpload
                  ? `Ao escolher o arquivo, as habilidades são lidas na hora (sem I.A) e vão para o ${periodoUpload}º ${tipo}, substituindo as que já estão nele. Depois é só conferir e salvar.`
                  : `Escolha o ${tipo} antes de selecionar o arquivo.`}
              </p>
            )}

          </div>
        </>
      )}

      {erro && <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{erro}</div>}
      {aviso && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{aviso}</div>}
      {conferencia && (
        <div className={`rounded-lg px-4 py-3 text-sm ${conferencia.fora.length || conferencia.semPeriodo.length ? "bg-rose-50 text-rose-700" : conferencia.avisoPeriodo || conferencia.recuperados.length ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
          <b>Conferência da leitura:</b> {conferencia.habilidades + conferencia.recomposicao} códigos encontrados no documento ({conferencia.habilidades}{" "}
          habilidades + {conferencia.recomposicao} de recomposição).{" "}
          {conferencia.fora.length
            ? `Atenção: ${conferencia.fora.length} código(s) aparecem no documento mas não entraram: ${conferencia.fora.join(", ")}. Adicione manualmente.`
            : "✓ Todos os códigos do documento entraram no plano."}
          {conferencia.semPeriodo.length > 0 && (
            <span className="mt-1 block text-rose-700">
              {conferencia.semPeriodo.length} código(s) sem período indicado no documento NÃO entraram: {conferencia.semPeriodo.join(", ")}. Adicione manualmente no período certo.
            </span>
          )}
          {conferencia.recuperados.length > 0 && (
            <span className="mt-1 block font-medium text-amber-800">
              {conferencia.recuperados.length} habilidade(s) estavam fora da posição esperada na tabela e foram incluídas mesmo assim — confira se
              estão certas: {conferencia.recuperados.join(", ")} (marcadas como "conferir" na lista).
            </span>
          )}
          {conferencia.citadosFora.length > 0 && (
            <span className="mt-1 block text-slate-500">
              Obs.: {conferencia.citadosFora.join(", ")} aparece(m) só em outras colunas do documento (ex.: orientações pedagógicas), como
              referência — não está(ão) na coluna de habilidades deste período, por isso não entra(m).
            </span>
          )}
          {conferencia.avisoPeriodo && <span className="mt-1 block font-medium text-amber-800">{conferencia.avisoPeriodo}</span>}
          <span className="mt-1 block text-[11px] opacity-60">Leitura do documento: versão {conferencia.versao ?? "antiga — reinicie o servidor"}</span>
        </div>
      )}

      {/* Revisao por periodo */}
      {tipo && (
      <div id="revisao-plano" className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        {/* Topo da revisao: resumo + salvar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-sm font-semibold text-slate-700">Revisar plano de curso</p>
            <p className="text-xs text-slate-500">
              {carregando ? "Carregando..." : `${totalItens} habilidades no plano`}
              {alterado && <span className="ml-2 text-amber-700">· alterações não salvas</span>}
            </p>
          </div>
          {botaoSalvar}
        </div>

        {trava > 0 && (
          <div className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 motion-safe:animate-alerta">
            <b>Confira antes de salvar:</b> veja se as habilidades estão corretas em cada {nomeTipo.toLowerCase()} (use as abas abaixo). Se faltar
            alguma, adicione manualmente no período certo. O botão de salvar libera em <b>{trava}s</b>.
          </div>
        )}

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div data-tour="pc-periodos" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:pb-0">
            {periodos.map((p) => (
              <button
                key={p.numero}
                onClick={() => setAba(p.numero)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${aba === p.numero ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {periodoSalvo(p) && p.itens.length > 0 && (
                  <span className={`mr-1 ${aba === p.numero ? "text-white" : "text-emerald-600"}`} title="Período salvo">
                    ✓
                  </span>
                )}
                {p.numero}º {NOME_PERIODO[tipo]} <span className="opacity-70">({p.itens.length})</span>
              </button>
            ))}
          </div>
          <span className="hidden text-xs text-slate-500 sm:inline">{carregando ? "Carregando..." : `${totalItens} habilidades no plano`}</span>
        </div>

        {periodoAtual && (
          <ListaPeriodo
            periodo={periodoAtual}
            periodos={periodos}
            tipo={tipo}
            ano={ano}
            uf={ufParaApi(uf)}
            onRemover={(item) => atualizarPeriodo(aba, (p) => ({ ...p, itens: p.itens.filter((i) => i !== item) }))}
            onMover={(item, destino) => {
              setPeriodos((ps) =>
                ps.map((p) => {
                  if (p.numero === aba) return { ...p, itens: p.itens.filter((i) => i !== item) };
                  if (p.numero === destino && !p.itens.some((i) => chaveItem(i) === chaveItem(item))) return { ...p, itens: [...p.itens, item] };
                  return p;
                })
              );
              setAlterado(true);
            }}
            onAdicionar={(item) =>
              atualizarPeriodo(aba, (p) => (p.itens.some((i) => chaveItem(i) === chaveItem(item)) ? p : { ...p, itens: [...p.itens, item] }))
            }
            onEditar={(antigo, novo) => atualizarPeriodo(aba, (p) => ({ ...p, itens: p.itens.map((i) => (i === antigo ? novo : i)) }))}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
          {alterado && <span className="mr-auto text-xs text-amber-700">Alterações não salvas</span>}
          {planoId && (
            <button
              onClick={() => {
                setTextoExcluir("");
                setConfirmarExcluir(true);
              }}
              className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:text-rose-600"
            >
              Excluir plano anual de curso
            </button>
          )}
          {botaoSalvar}
        </div>
      </div>
      )}

      {/* Confirmacao de exclusao: barreira extra (digitar EXCLUIR) */}
      {confirmarExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !excluindo && setConfirmarExcluir(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-rose-700">Excluir plano anual de curso?</p>
            <p className="mt-2 text-sm text-slate-600">
              Isso apaga o plano do <b>{ANOS.find((a) => a.valor === ano)?.nome}</b> de <b>{anoLetivo}</b> com as <b>{totalItens} habilidades</b> de todos os
              períodos. Os novos registros de aula não poderão ser gerados até cadastrar o plano de novo. <b>Não dá para desfazer.</b>
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-500">
              Para confirmar, digite <b className="text-rose-700">EXCLUIR</b>
              <input autoFocus value={textoExcluir} onChange={(e) => setTextoExcluir(e.target.value)} onKeyDown={(e) => e.key === "Enter" && excluir()} className={`${campo} mt-1`} />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmarExcluir(false)} disabled={excluindo} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
              <button
                onClick={excluir}
                disabled={excluindo || textoExcluir.trim().toUpperCase() !== "EXCLUIR"}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {excluindo ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Lista de habilidades de um periodo, agrupada por componente
function ListaPeriodo(props: {
  periodo: PeriodoPlano;
  periodos: PeriodoPlano[];
  tipo: TipoPeriodo;
  ano: string;
  uf: string | null;
  onRemover: (i: ItemPlano) => void;
  onMover: (i: ItemPlano, destino: number) => void;
  onAdicionar: (i: ItemPlano) => void;
  onEditar: (antigo: ItemPlano, novo: ItemPlano) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null); // chave do item em edicao
  const [textoEdit, setTextoEdit] = useState("");
  const grupos = useMemo(() => {
    const m = new Map<string, ItemPlano[]>();
    props.periodo.itens.forEach((i) => m.set(i.componente, [...(m.get(i.componente) ?? []), i]));
    return [...m.entries()];
  }, [props.periodo.itens]);

  return (
    <div className="space-y-4">
      {!grupos.length && <p className="text-sm text-slate-400">Nenhuma habilidade neste período. Envie o plano ou adicione manualmente abaixo.</p>}
      {grupos.map(([comp, itens]) => (
        <div key={comp}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            {comp} <span className="font-normal text-slate-400">({itens.length})</span>
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {itens.map((i) => (
              <li key={chaveItem(i)} className="flex flex-wrap items-start gap-3 px-3 py-2 text-sm">
                <span className="flex w-full flex-wrap items-center gap-x-2 font-mono text-xs font-semibold text-slate-700 sm:block sm:w-28 sm:shrink-0">
                  {i.codigo ?? "sem código"}
                  {i.recomposicao && <span className="mt-0.5 block font-sans text-[10px] font-normal text-violet-700">recomposição</span>}
                  {i.conferir && <span className="mt-0.5 block font-sans text-[10px] font-semibold text-amber-700">conferir</span>}
                  {i.codigo && !i.noBanco && <span className="mt-0.5 block font-sans text-[10px] font-normal text-amber-700">novo na base</span>}
                  {i.origemTexto === "oficial" && <span className="mt-0.5 block font-sans text-[10px] font-normal text-emerald-700">texto oficial</span>}
                  {i.origemTexto === "documento" && <span className="mt-0.5 block font-sans text-[10px] font-normal text-slate-500">texto do plano</span>}
                </span>
                {editando === chaveItem(i) ? (
                  <span className="min-w-0 flex-1 basis-full sm:basis-0">
                    <textarea
                      autoFocus
                      rows={3}
                      value={textoEdit}
                      onChange={(e) => setTextoEdit(e.target.value)}
                      className="w-full rounded-lg border border-indigo-300 px-2 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                    <span className="mt-1 flex gap-2">
                      <button
                        onClick={() => {
                          if (textoEdit.trim().length >= 5) props.onEditar(i, { ...i, habilidade: textoEdit.trim(), conferir: false, origemTexto: "documento" });
                          setEditando(null);
                        }}
                        className="rounded bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-indigo-700"
                      >
                        Salvar texto
                      </button>
                      <button onClick={() => setEditando(null)} className="text-xs text-slate-500 hover:text-slate-700">
                        Cancelar
                      </button>
                    </span>
                  </span>
                ) : (
                  <span className="min-w-0 flex-1 basis-full text-xs leading-relaxed text-slate-600 sm:basis-0">
                    {i.textoOficial && i.habilidade ? destacarDiferenca(i.habilidade, i.textoOficial) : i.habilidade ?? i.conteudo}
                    {i.conteudo && i.habilidade && <span className="block text-slate-400">Conteúdo: {i.conteudo}</span>}
                    {i.textoOficial && i.textoOficial !== i.habilidade && (
                      <span className="mt-1.5 block rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
                        <b>Possível erro de digitação no PDF.</b> Texto oficial: <span className="italic">{destacarDiferenca(i.textoOficial, i.habilidade ?? "")}</span>
                        <span className="mt-1.5 flex flex-wrap gap-2">
                          <button
                            onClick={() =>
                              props.onEditar(i, { ...i, habilidade: i.textoOficial!, origemTexto: "oficial", textoOficial: null, conferir: false })
                            }
                            className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-600"
                          >
                            Usar texto oficial
                          </button>
                          <button
                            onClick={() => props.onEditar(i, { ...i, textoOficial: null, conferir: false })}
                            className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100"
                          >
                            Manter o do PDF
                          </button>
                        </span>
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setEditando(chaveItem(i));
                        setTextoEdit(i.habilidade ?? "");
                      }}
                      className="ml-2 text-[11px] font-medium text-indigo-600 hover:underline"
                      title="Corrigir o texto da habilidade como está no seu plano"
                    >
                      editar texto
                    </button>
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
                  <select
                    value=""
                    onChange={(e) => e.target.value && props.onMover(i, Number(e.target.value))}
                    className="rounded border border-slate-200 px-1 py-0.5 text-xs text-slate-500"
                  >
                    <option value="">mover…</option>
                    {props.periodos
                      .filter((p) => p.numero !== props.periodo.numero)
                      .map((p) => (
                        <option key={p.numero} value={p.numero}>
                          {p.numero}º {NOME_PERIODO[props.tipo].toLowerCase()}
                        </option>
                      ))}
                  </select>
                  <button onClick={() => props.onRemover(i)} className="text-xs text-slate-400 hover:text-rose-600">
                    remover
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <AdicionarHabilidade
        ano={props.ano}
        uf={props.uf}
        titulo={`${props.periodo.numero}º ${NOME_PERIODO[props.tipo].toLowerCase()}`}
        existentes={props.periodo.itens}
        onAdicionar={props.onAdicionar}
      />
    </div>
  );
}

// Adicionar habilidade ao periodo: buscando na base ou digitando codigo + descricao
function AdicionarHabilidade({
  ano,
  uf,
  titulo,
  existentes,
  onAdicionar,
}: {
  ano: string;
  uf: string | null;
  titulo: string;
  existentes: ItemPlano[];
  onAdicionar: (i: ItemPlano) => void;
}) {
  const [modo, setModo] = useState<"buscar" | "digitar">("buscar");
  const [componentes, setComponentes] = useState<string[]>([]);
  const [componente, setComponente] = useState("");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Opcao[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const jaTem = (cod: string) => existentes.some((i) => (i.codigo ?? "").toUpperCase() === cod.toUpperCase());

  useEffect(() => {
    habilidadeApi
      .componentes(ano, uf)
      .then((c) => {
        setComponentes(c);
        setComponente((atual) => (atual && c.includes(atual) ? atual : c[0] ?? atual));
      })
      .catch(() => setComponentes([]));
  }, [ano, uf]);

  async function buscar() {
    if (!componente) return;
    setMsg(null);
    setRes(await habilidadeApi.buscar({ ano, uf, componente, q }));
  }

  function incluir(item: ItemPlano) {
    if (item.codigo && jaTem(item.codigo)) {
      setMsg({ ok: false, texto: `${item.codigo} já está no ${titulo}.` });
      return;
    }
    onAdicionar(item);
    setMsg({ ok: true, texto: `${item.codigo} adicionada ao ${titulo}. Lembre de salvar o plano.` });
  }

  function incluirDigitada() {
    const cod = codigo.toUpperCase().replace(/[\s().]/g, "");
    if (!componente.trim()) return setMsg({ ok: false, texto: "Informe o componente." });
    if (!/^[A-Z]{2}\d{2}[A-Z]{2}\d{2,3}[A-Z0-9]*$/.test(cod) && !/^[A-Z0-9-]{4,20}$/.test(cod))
      return setMsg({ ok: false, texto: "Código inválido. Ex.: EF04MA01, EF35LP03, EF04MA03A." });
    if (descricao.trim().length < 5) return setMsg({ ok: false, texto: "Escreva a descrição da habilidade." });
    incluir({ componente: componente.trim(), codigo: cod, habilidade: descricao.trim(), conteudo: null, noBanco: false });
    setCodigo("");
    setDescricao("");
  }

  const aba = (id: typeof modo, rotulo: string) => (
    <button
      onClick={() => {
        setModo(id);
        setMsg(null);
      }}
      className={`rounded-md px-3 py-1 text-xs font-medium ${modo === id ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"}`}
    >
      {rotulo}
    </button>
  );

  return (
    <div data-tour="pc-adicionar" className="rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">+ Adicionar habilidade manualmente ao {titulo}</p>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          {aba("buscar", "Buscar na base")}
          {aba("digitar", "Digitar código")}
        </div>
      </div>

      <div className="mb-2">
        <input
          list="componentes-plano"
          value={componente}
          onChange={(e) => setComponente(e.target.value)}
          placeholder="Componente (ex.: Matemática)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs sm:w-64"
        />
        <datalist id="componentes-plano">
          {componentes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {modo === "buscar" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
              placeholder="código ou palavra (ex.: EF04MA01, frações, leitura...)"
              className="min-w-40 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            />
            <button onClick={buscar} className="rounded-lg bg-white px-3 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
              Buscar
            </button>
          </div>
          {res && !res.length && (
            <p className="mt-2 text-xs text-slate-500">
              Nada encontrado na base. Use <b>Digitar código</b> para incluir a habilidade como está no seu plano.
            </p>
          )}
          {res && res.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-auto rounded-lg bg-white">
              {res.slice(0, 20).map((o) => (
                <li key={o.codigo} className="flex items-start gap-2 border-b border-slate-100 px-3 py-1.5 text-xs">
                  <button
                    onClick={() => incluir({ componente, codigo: o.codigo, habilidade: o.habilidade, conteudo: null, noBanco: true })}
                    disabled={jaTem(o.codigo)}
                    className="shrink-0 rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-100 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {jaTem(o.codigo) ? `✓ ${o.codigo}` : `+ ${o.codigo}`}
                  </button>
                  <span className="text-slate-600">{o.habilidade}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            placeholder="Código (ex.: EF35LP03)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs sm:w-64"
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={2}
            placeholder="Descrição da habilidade (copie do seu plano de curso)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
          />
          <div>
            <button onClick={incluirDigitada} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
              Adicionar ao {titulo}
            </button>
          </div>
        </div>
      )}
      {msg && <p className={`mt-2 text-xs font-medium ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.texto}</p>}
    </div>
  );
}
