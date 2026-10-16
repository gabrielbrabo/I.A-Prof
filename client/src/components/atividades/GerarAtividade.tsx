import { useEffect, useMemo, useRef, useState } from "react";
import { gravarRascunhoAtividade, lerRascunhoAtividade, RascunhoAtividade } from "../../lib/rascunhoAtividade";
import { Atividade, atividadesApi, ImagemAtividade, miniatura, PontosPeriodo, Questao, reduzirFoto, TIPOS_DEV, TipoDev, Turma, turmasApi } from "../../api/atividades";
import { diarioApi, nomeTurmaDiario, SituacaoDiario, TurmaDiario } from "../../api/diario";
import { planoApi, PlanoCurso } from "../../api/planoCurso";
import { ANOS } from "../../lib/formatarRegistro";
import { mesmoComponente } from "../../lib/componente";
import { gravarPref, lerPref } from "../../lib/prefs";
import { ErroApi } from "../../lib/sessao";
import EditorAtividade, { escolherImagens, problemasGabarito } from "./EditorAtividade";
import { htmlDaAtividade, imprimirAtividade, imprimirGabarito } from "./impressao";
import { CaixaAjuste, PreviaAtividade } from "./AjusteAtividade";

const campo =
  "mt-1 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const LIMITE_DETALHES = 1500;

// Turmas que o professor pode usar: do D.E.V (se conectado) e as criadas no I.A Prof
export function useTurmas(diario: SituacaoDiario | null, anoLetivo: number) {
  const [dev, setDev] = useState<TurmaDiario[] | null>(null);
  const [locais, setLocais] = useState<Turma[]>([]);
  const [erroDev, setErroDev] = useState<string | null>(null);
  useEffect(() => {
    turmasApi.listar().then(setLocais).catch(() => {});
  }, []);
  useEffect(() => {
    if (!diario?.conectado) {
      setDev(null);
      return;
    }
    let ativo = true;
    const carregar = (tentativa: number) =>
      diarioApi
        .turmas(String(anoLetivo))
        .then((t) => {
          if (!ativo) return;
          setDev(t);
          setErroDev(null);
        })
        .catch((e) => {
          if (!ativo) return;
          // D.E.V oscilou: tenta de novo sozinho uma vez
          if (tentativa === 0) setTimeout(() => ativo && carregar(1), 4000);
          else setErroDev(e instanceof Error ? e.message : "Não foi possível carregar as turmas do D.E.V");
        });
    carregar(0);
    return () => {
      ativo = false;
    };
  }, [diario?.conectado, anoLetivo]);
  return { dev, locais, erroDev };
}

// Valor do select de turma: "dev:<id>" | "t:<id>" | ""
export const chaveTurma = (a: Pick<Atividade, "diarioTurmaId" | "turmaId">) => (a.diarioTurmaId ? `dev:${a.diarioTurmaId}` : a.turmaId ? `t:${a.turmaId}` : "");

export function SeletorTurma({
  valor,
  onChange,
  dev,
  locais,
  erroDev,
  onIrTurmas,
  bloqueado,
}: {
  valor: string;
  onChange: (chave: string, nome: string | null) => void;
  dev: TurmaDiario[] | null;
  locais: Turma[];
  erroDev?: string | null;
  onIrTurmas?: () => void;
  bloqueado?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-1">
        <label className="text-xs font-medium text-slate-500">Turma</label>
        {onIrTurmas && (
          <button type="button" onClick={onIrTurmas} className="text-[11px] font-medium text-indigo-600 hover:underline">
            + nova turma
          </button>
        )}
      </div>
      <select
        className={campo}
        value={valor}
        disabled={bloqueado}
        title={bloqueado ? "Atividade já tem correções: a turma não pode mudar" : undefined}
        onChange={(e) => {
          const v = e.target.value;
          const nome = v.startsWith("dev:")
            ? nomeTurmaDiario(dev!.find((t) => `dev:${t.id}` === v)!)
            : v.startsWith("t:")
              ? locais.find((t) => `t:${t._id}` === v)?.nome ?? null
              : null;
          onChange(v, nome);
        }}
      >
        <option value="">Sem turma (só gerar e imprimir)</option>
        {dev && dev.length > 0 && (
          <optgroup label="📒 Turmas do D.E.V">
            {dev.map((t) => (
              <option key={t.id} value={`dev:${t.id}`}>
                {nomeTurmaDiario(t)}
                {t.papel === "ED_FISICA" ? " (Ed. Física)" : ""}
                {t.notas === false ? " (Infantil)" : ""} — {t.escola}
              </option>
            ))}
          </optgroup>
        )}
        {locais.length > 0 && (
          <optgroup label="👥 Minhas turmas">
            {locais.map((t) => (
              <option key={t._id} value={`t:${t._id}`}>
                {t.nome} ({t.alunos.length} alunos)
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {erroDev && <p className="mt-0.5 text-[11px] text-rose-600">{erroDev}</p>}
    </div>
  );
}

type PropsGerar = Parameters<typeof GerarAtividadeTela>[0];

// Atividade nova: antes de abrir, busca o rascunho (atividade gerada e ainda nao salva) para nao gerar de novo
export default function GerarAtividade(props: Omit<PropsGerar, "rascunho">) {
  const [rascunho, setRascunho] = useState<RascunhoAtividade | null | undefined>(props.editar ? null : undefined);
  useEffect(() => {
    if (props.editar) return;
    lerRascunhoAtividade().then(setRascunho);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (rascunho === undefined) return <p className="text-sm text-slate-500">Carregando…</p>;
  return <GerarAtividadeTela {...props} rascunho={rascunho} />;
}

function GerarAtividadeTela({
  editar,
  rascunho,
  diario,
  professorNome,
  onSalva,
  onCorrigir,
  onUsouIA,
  onIrTurmas,
  onIrPlano,
  onFecharEdicao,
  onIrLista,
  podeCorrigir = true,
  fotoLiberada = false,
  externa = false,
}: {
  editar?: Atividade | null;
  diario: SituacaoDiario | null;
  professorNome?: string;
  onSalva: () => void;
  onCorrigir: (a: Atividade) => void;
  onUsouIA: () => void;
  onIrTurmas: () => void;
  onIrPlano: () => void;
  onFecharEdicao: () => void;
  onIrLista: (a: Atividade) => void; // depois de aprovar e salvar: vai para a lista
  podeCorrigir?: boolean; // teste gratis: so gera (correcao e notas nos planos pagos)
  rascunho: RascunhoAtividade | null; // atividade nova em andamento (recarregou a pagina, trocou de aba)
  fotoLiberada?: boolean; // ler gabarito por foto (I.A): Profissional e Premium
  externa?: boolean; // abrir ja no modo "atividade feita fora" (so gabarito para corrigir)
}) {
  const r0 = editar ? null : rascunho;
  // "ia" = gerar com I.A; "externa" = a atividade foi feita fora do I.A Prof: so o gabarito para corrigir
  const [origem, setOrigem] = useState<"ia" | "externa">(() => (editar?.origem ?? (externa ? "externa" : r0?.origem ?? "ia")) as "ia" | "externa");
  const ehExterna = origem === "externa";
  const [qtdQuestoes, setQtdQuestoes] = useState(10);
  const [tipoQuestoes, setTipoQuestoes] = useState<"multipla" | "vf" | "discursiva" | "completar">("multipla");
  const [lendoFoto, setLendoFoto] = useState(false);
  const [ano, setAno] = useState(() => editar?.ano ?? r0?.ano ?? lerPref("ano", ""));
  const [anoLetivo, setAnoLetivo] = useState(() => editar?.anoLetivo ?? r0?.anoLetivo ?? Number(lerPref("anoLetivo", String(new Date().getFullYear()))));
  const [periodo, setPeriodo] = useState(() => editar?.periodo ?? r0?.periodo ?? Number(lerPref("ativ.periodo", "0")));
  const [turmaChave, setTurmaChave] = useState(() => (editar ? chaveTurma(editar) : r0?.turmaChave ?? lerPref("ativ.turma", "")));
  const [turmaNome, setTurmaNome] = useState<string | null>(() => editar?.turma ?? r0?.turmaNome ?? null);
  const [componente, setComponente] = useState(() => editar?.componente ?? r0?.componente ?? "");
  const [materiaDev, setMateriaDev] = useState<string>(() => editar?.diarioMateriaId ?? r0?.materiaDev ?? "");
  const [tipoDev, setTipoDev] = useState<TipoDev>(() => editar?.tipoDev ?? r0?.tipoDev ?? "Normal");
  const [valorTotal, setValorTotal] = useState(() => editar?.valorTotal ?? r0?.valorTotal ?? Number(lerPref("ativ.valor", "10")));
  const [detalhes, setDetalhes] = useState(() => editar?.detalhes ?? r0?.detalhes ?? "");
  const [atividade, setAtividade] = useState<Atividade | null>(editar ?? r0?.atividade ?? null);
  // Imagens do professor (logo, figuras): antes de gerar ficam aqui; depois, dentro da atividade
  const [imagensPedido, setImagensPedido] = useState<ImagemAtividade[]>(() => editar?.imagens ?? r0?.imagensPedido ?? []);
  const imgs = atividade?.imagens ?? imagensPedido;
  const setImgs = (l: ImagemAtividade[]) => (atividade ? setAtividade({ ...atividade, imagens: l }) : setImagensPedido(l));
  // A I.A pode pedir algo que falta (ex.: a logo); o professor responde e gera de novo
  const [perguntas, setPerguntas] = useState<string[] | null>(null);
  const [respostas, setRespostas] = useState("");
  const [ajuste, setAjuste] = useState("");
  const [ajustando, setAjustando] = useState(false);
  const [previa, setPrevia] = useState(false); // ver a folha antes de salvar
  // o que a I.A ja aprendeu do jeito do professor
  const [aprendido, setAprendido] = useState<{ salvas: number; ajustes: number } | null>(null);
  const [esquecer, setEsquecer] = useState(false);
  useEffect(() => {
    atividadesApi.preferencias().then(setAprendido).catch(() => setAprendido(null));
  }, []);
  const [usouPlano, setUsouPlano] = useState<boolean | null>(() => r0?.usouPlano ?? null);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(() =>
    r0?.atividade ? "📝 Sua atividade gerada continua aqui (ainda não salva). Confira, aprove e salve." : null
  );
  const [plano, setPlano] = useState<PlanoCurso | null>(null);
  const [carregandoPlano, setCarregandoPlano] = useState(false);
  const [habSel, setHabSel] = useState<string[]>(() => editar?.habilidades.map((h) => h.codigo) ?? r0?.habSel ?? []);
  const [materiasDev, setMateriasDev] = useState<Array<{ id: string; nome: string }> | null>(null);
  // Guarda a atividade nova em andamento (recarregar a pagina nao perde o que ja foi gerado)
  const salvaDeVez = useRef(false);
  useEffect(() => {
    if (editar || salvaDeVez.current) return;
    const t = window.setTimeout(() => {
      if (salvaDeVez.current) return;
      if (!atividade && !detalhes.trim()) return void gravarRascunhoAtividade(null);
      void gravarRascunhoAtividade({ ano, anoLetivo, periodo, turmaChave, turmaNome, componente, materiaDev, tipoDev, valorTotal, detalhes, habSel, atividade, imagensPedido, usouPlano, origem, em: Date.now() });
    }, 600);
    return () => window.clearTimeout(t);
  }, [editar, ano, anoLetivo, periodo, turmaChave, turmaNome, componente, materiaDev, tipoDev, valorTotal, detalhes, habSel, atividade, imagensPedido, usouPlano, origem]);
  const [descartar, setDescartar] = useState(false);
  const [periodosDev, setPeriodosDev] = useState<Array<{ label: string; aberto: boolean; totalPontos: number }>>([]);
  const { dev, locais, erroDev } = useTurmas(diario, anoLetivo);
  const ehDev = turmaChave.startsWith("dev:");
  const turmaDev = ehDev ? dev?.find((t) => `dev:${t.id}` === turmaChave) ?? null : null;
  // Educacao Infantil (D.E.V com conceitos): usa a turma e os alunos do D.E.V, mas atividade/notas ficam so no I.A Prof
  const infantilDev = !!turmaDev && turmaDev.notas === false;
  const devNotas = ehDev && !infantilDev;
  const temCorrecoes = !!editar && (editar.corrigidas ?? 0) > 0;

  // nome da turma quando as listas chegam
  useEffect(() => {
    if (turmaNome || !turmaChave) return;
    if (turmaDev) setTurmaNome(nomeTurmaDiario(turmaDev));
    const l = locais.find((t) => `t:${t._id}` === turmaChave);
    if (l) setTurmaNome(l.nome);
  }, [turmaChave, turmaDev, locais, turmaNome]);

  // Plano de curso da serie no ano letivo (o mesmo das aulas): periodos e habilidades
  useEffect(() => {
    if (!ano) return setPlano(null);
    setCarregandoPlano(true);
    planoApi
      .obter(ano, anoLetivo)
      .then(setPlano)
      .catch(() => setPlano(null))
      .finally(() => setCarregandoPlano(false));
  }, [ano, anoLetivo]);
  const tipoPeriodo = plano?.tipoPeriodo ?? "bimestre";
  const qtdPeriodos = tipoPeriodo === "trimestre" ? 3 : tipoPeriodo === "semestre" ? 2 : 4;
  const itensPeriodo = (plano?.periodos.find((x) => x.numero === periodo)?.itens ?? []).filter((i) => i.codigo && i.habilidade);
  // materias do plano no periodo (sugestoes quando o professor digita)
  const materiasPlano = [...new Set(itensPeriodo.map((i) => i.componente))];
  // habilidades do periodo + materia: o professor escolhe quais a atividade vai ter
  const habilidadesDisp = componente.trim() ? itensPeriodo.filter((i) => mesmoComponente(i.componente, componente)) : [];
  const codigosDisp = habilidadesDisp.map((h) => h.codigo!);
  const habEscolhidas = habSel.filter((c) => codigosDisp.includes(c));

  // turma do D.E.V: materias do professor e periodos (abertos/fechados, total de pontos)
  useEffect(() => {
    if (!turmaDev || turmaDev.notas === false) {
      setMateriasDev(null);
      setPeriodosDev([]);
      return;
    }
    diarioApi
      .alunos(turmaDev.id)
      .then((r) => {
        setMateriasDev(r.materias);
        setPeriodosDev(r.periodos);
        if (r.materias.length === 1) {
          setMateriaDev(r.materias[0].id);
          setComponente(r.materias[0].nome);
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar a turma do D.E.V"));
  }, [turmaDev?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const periodoDev = periodosDev.find((p) => p.label === `${periodo}º BIMESTRE`);
  // D.E.V (turma com notas): as atividades somadas nao podem passar os pontos do periodo
  const [pontos, setPontos] = useState<PontosPeriodo | null>(null);
  const [modalPontos, setModalPontos] = useState<PontosPeriodo | null>(null);
  useEffect(() => {
    setPontos(null);
    if (!devNotas || !turmaDev || !materiaDev || !periodo) return;
    atividadesApi
      .pontosPeriodo({ turma: turmaDev.id, periodo, materia: materiaDev, excluir: atividade?._id ?? null })
      .then(setPontos)
      .catch(() => setPontos(null));
  }, [devNotas, turmaDev?.id, materiaDev, periodo, atividade?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  const valorAtual = atividade ? atividade.valorTotal : valorTotal;
  const naoCabe = !!pontos && pontos.restante != null && valorAtual > pontos.restante + 1e-9;
  const pronto = !!ano && periodo > 0 && !!componente.trim() && (!devNotas || !!materiaDev);
  const precisaHabilidade = habilidadesDisp.length > 0 && !habEscolhidas.length;

  async function gerar(modo: "novo" | "ajuste" = "novo") {
    setErro(null);
    setAviso(null);
    if (!pronto) return setErro(devNotas && !materiaDev ? "Escolha a matéria do D.E.V." : "Preencha série, período e matéria.");
    if (precisaHabilidade) return setErro("Escolha pelo menos uma habilidade do plano de curso para a atividade.");
    if (detalhes.trim().length < 3) return setErro("Descreva a atividade que você quer.");
    if (modo === "ajuste" && (!atividade || !ajuste.trim())) return;
    if (modo === "novo" && naoCabe) return setModalPontos(pontos); // nao gasta I.A com valor que nao cabe no periodo
    if (modo === "ajuste") setAjustando(true);
    else setGerando(true);
    try {
      // a I.A ve so miniaturas das imagens (mais rapido e barato); a imagem inteira fica na atividade
      const miniaturas = await Promise.all(imgs.map(async (i) => ({ ...i, dataUrl: await miniatura(i.dataUrl).catch(() => i.dataUrl) })));
      const atual =
        modo === "ajuste" && atividade
          ? { titulo: atividade.titulo, instrucoes: atividade.instrucoes, texto: atividade.texto, questoes: atividade.questoes, cabecalho: atividade.cabecalho, estilo: atividade.estilo }
          : null;
      const nomeProfessor = diario?.conectado && diario.nome ? diario.nome : lerPref("professor", "") || professorNome || null;
      const r = await atividadesApi.gerar({
        ano,
        anoLetivo,
        periodo,
        componente: componente.trim(),
        turma: turmaNome,
        detalhes: detalhes.trim(),
        valorTotal: atividade?.valorTotal ?? valorTotal,
        habilidades: habEscolhidas,
        imagens: miniaturas,
        respostas: respostas.trim() || null,
        atual,
        ajuste: modo === "ajuste" ? ajuste.trim() : null,
        escola: atividade?.cabecalho?.escola || turmaDev?.escola || null,
        professor: nomeProfessor,
        diarioTurmaId: devNotas && turmaDev ? turmaDev.id : null,
        diarioMateriaId: devNotas ? materiaDev || null : null,
        atividadeId: atividade?._id ?? null,
      });
      onUsouIA();
      if (r.status === "perguntas") {
        setPerguntas(r.perguntas);
        return;
      }
      setPerguntas(null);
      setAtividade({
        ...(atividade?._id ? { _id: atividade._id } : {}),
        ...dadosBase(),
        valorTotal: atividade?.valorTotal ?? valorTotal,
        titulo: r.titulo,
        instrucoes: r.instrucoes,
        questoes: r.questoes,
        habilidades: r.habilidades,
        imagens: [...imgs, ...(r.imagensIA ?? [])],
        cabecalho: r.cabecalho,
        estilo: r.estilo,
        texto: r.texto,
      });
      setUsouPlano(r.usouPlano);
      if (modo === "novo") {
        window.scrollTo({ top: 0, behavior: "smooth" }); // resultado fica no topo
        window.dispatchEvent(new CustomEvent("iaprof:tour", { detail: "ativPronta" })); // guia da 1a atividade gerada
      }
      if (modo === "ajuste") {
        setAjuste("");
        setAviso("✓ Ajuste feito. Confira abaixo.");
      }
    } catch (e) {
      if (e instanceof ErroApi && e.dados?.semPontos && e.dados.pontos) {
        setPontos(e.dados.pontos as PontosPeriodo);
        setModalPontos(e.dados.pontos as PontosPeriodo);
        return;
      }
      if (!(e instanceof ErroApi && e.semAcesso)) setErro(e instanceof Error ? e.message : "Erro ao gerar");
      else setErro(e.message);
    } finally {
      setGerando(false);
      setAjustando(false);
    }
  }

  // ---- Atividade feita fora do I.A Prof: monta o gabarito (a mao ou pela foto) ----
  const camposOk = (): boolean => {
    setErro(null);
    if (!pronto) {
      setErro(devNotas && !materiaDev ? "Escolha a matéria do D.E.V." : "Preencha série, período e matéria.");
      return false;
    }
    return true;
  };
  const montarExterna = (titulo: string, questoes: Questao[]) => {
    setAtividade({
      ...dadosBase(),
      valorTotal,
      titulo,
      instrucoes: "",
      questoes,
      habilidades: [],
      imagens: [],
      cabecalho: undefined,
      estilo: undefined,
      texto: undefined,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  function gabaritoAMao() {
    if (!camposOk()) return;
    const n = Math.max(1, Math.min(30, qtdQuestoes || 1));
    const qs: Questao[] = Array.from({ length: n }, (_, i) => ({
      tipo: tipoQuestoes,
      enunciado: `Questão ${i + 1}`,
      alternativas: tipoQuestoes === "multipla" ? ["A", "B", "C", "D"] : [],
      itens: tipoQuestoes === "vf" ? ["a", "b", "c", "d"].map((l) => ({ texto: `Item ${l}`, resposta: "V" as const })) : [],
      resposta: "",
      criterios: "",
      valor: Math.round((valorTotal / n) * 10) / 10,
      linhas: 0,
    }));
    montarExterna(detalhes.trim() || "Atividade", qs);
    setAviso("✍️ Marque a resposta certa de cada questão (gabarito) e confira os valores. Dá para mudar o tipo de cada questão.");
  }
  async function gabaritoPorFoto(arquivos: FileList | null) {
    if (!arquivos?.length || !camposOk()) return;
    setLendoFoto(true);
    try {
      const fotos = await Promise.all(Array.from(arquivos).slice(0, 4).map((f) => reduzirFoto(f)));
      const r = await atividadesApi.gabaritoFoto({ ano, componente: componente.trim(), valorTotal }, fotos);
      onUsouIA();
      montarExterna(detalhes.trim() || r.titulo, r.questoes);
      setAviso(
        r.duvidas.length
          ? `📷 Gabarito lido da foto. Confira com atenção as questões ${r.duvidas.join(", ")} (a I.A ficou em dúvida) e todas as respostas antes de salvar.`
          : "📷 Gabarito lido da foto. Confira cada resposta e os valores antes de salvar."
      );
    } catch (e) {
      if (!(e instanceof ErroApi && e.semAcesso)) setErro(e instanceof Error ? e.message : "Erro ao ler a foto");
    } finally {
      setLendoFoto(false);
    }
  }

  const dadosBase = (): Omit<Atividade, "titulo" | "instrucoes" | "questoes" | "habilidades"> => ({
    ano,
    uf: null,
    anoLetivo,
    periodo,
    componente: componente.trim(),
    turma: turmaNome,
    turmaId: turmaChave.startsWith("t:") ? turmaChave.slice(2) : null,
    diarioTurmaId: ehDev ? turmaChave.slice(4) : null,
    diarioMateriaId: devNotas ? materiaDev || null : null,
    tipoDev,
    detalhes,
    valorTotal,
    origem,
  });

  const problemas = useMemo(() => (atividade ? problemasGabarito(atividade.questoes) : []), [atividade]);

  async function salvar(corrigirDepois: boolean) {
    if (!atividade) return;
    setErro(null);
    if (problemas.length) return setErro(problemas[0]);
    if (!atividade._id && naoCabe) return setModalPontos(pontos); // D.E.V: valor tem que caber no periodo
    setSalvando(true);
    try {
      const salva = await atividadesApi.salvar({ ...atividade, ...dadosBase(), valorTotal: atividade.valorTotal });
      salvaDeVez.current = true; // salva no servidor: o rascunho nao e mais necessario
      await gravarRascunhoAtividade(null);
      gravarPref("ano", ano);
      gravarPref("ativ.turma", turmaChave);
      gravarPref("ativ.periodo", String(periodo));
      gravarPref("ativ.valor", String(atividade.valorTotal));
      onSalva();
      if (corrigirDepois) onCorrigir(salva);
      else onIrLista(salva);
    } catch (e) {
      if (e instanceof ErroApi && e.dados?.semPontos && e.dados.pontos) {
        setPontos(e.dados.pontos as PontosPeriodo);
        setModalPontos(e.dados.pontos as PontosPeriodo);
        return;
      }
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  const extrasImpressao = { professor: diario?.conectado && diario.nome ? diario.nome : professorNome, escola: turmaDev?.escola };
  const nomePer = tipoPeriodo.charAt(0).toUpperCase() + tipoPeriodo.slice(1);

  return (
    <div className="space-y-4">
      {editar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
          <span>
            ✏️ Editando: <b>{editar.titulo}</b>
            {temCorrecoes ? " — as notas já corrigidas são recalculadas ao salvar." : ""}
          </span>
          <button onClick={onFecharEdicao} className="text-xs font-semibold underline">
            Nova atividade
          </button>
        </div>
      )}
      {!editar && !atividade && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-sm" role="tablist" data-tour="ativ-origem">
          <button
            role="tab"
            aria-selected={!ehExterna}
            onClick={() => setOrigem("ia")}
            className={`rounded-lg px-3 py-2 font-semibold ${!ehExterna ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}
          >
            ✨ Gerar com a I.A
          </button>
          <button
            role="tab"
            aria-selected={ehExterna}
            onClick={() => setOrigem("externa")}
            className={`rounded-lg px-3 py-2 font-semibold ${ehExterna ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:bg-white/60"}`}
          >
            📥 Já tenho a atividade
          </button>
        </div>
      )}
      {atividade && (
        <div className="space-y-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-3 sm:p-4">
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200 sm:p-4" data-tour="ativ-pronta">
            <p className="text-base font-bold text-emerald-900">
              ✅ {editar ? "Atividade aberta para editar" : ehExterna ? "Gabarito pronto para conferir!" : "Atividade gerada!"} Agora confira:
            </p>
            <ol className="mt-1 space-y-0.5 text-sm text-emerald-900">
              {!ehExterna && (
                <li>
                  <b>1.</b> Veja como ficou a folha
                </li>
              )}
              <li>
                <b>2.</b> Confira o gabarito e os valores (em “Editar à mão”, abaixo)
              </li>
              <li>
                <b>3.</b> Aprove e salve{podeCorrigir ? " — ou salve e já corrija" : ""}
              </li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              {!ehExterna && <button onClick={() => setPrevia(true)} data-tour="ativ-ver" className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-900">
                👁️ Ver como ficou a folha
              </button>}
              <button onClick={() => salvar(false)} disabled={salvando} data-tour="ativ-salvar" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
                {salvando ? "Salvando..." : "✓ Aprovar e salvar"}
              </button>
              {!editar &&
                (descartar ? (
                  <button
                    onClick={() => {
                      setAtividade(null);
                      setImagensPedido([]);
                      setUsouPlano(null);
                      setAviso(null);
                      setDescartar(false);
                    }}
                    className="rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
                  >
                    Confirmar: descartar
                  </button>
                ) : (
                  <button onClick={() => setDescartar(true)} className="rounded-xl px-3 py-2.5 text-sm text-slate-500 hover:bg-white" title="Apagar esta atividade (sem salvar)">
                    🗑️ Descartar
                  </button>
                ))}
              {podeCorrigir && (
                <button onClick={() => salvar(true)} disabled={salvando} data-tour="ativ-salvar-corrigir" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
                  Salvar e corrigir →
                </button>
              )}
            </div>
          </div>
          {erro && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{erro}</p>}
          {aviso && <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{aviso}</p>}
          {!ehExterna && <CaixaAjuste valor={ajuste} onChange={setAjuste} onAjustar={() => gerar("ajuste")} ajustando={ajustando} />}
          <details className="rounded-xl bg-white/60 p-2" open>
            <summary className="cursor-pointer px-1 text-sm font-semibold text-slate-700" data-tour="ativ-editar">✍️ Editar à mão (questões, gabarito, valores, imagens, cabeçalho)</summary>
            <div className="mt-3">
              <EditorAtividade valor={atividade} onChange={setAtividade} />
            </div>
          </details>
          {problemas.length > 0 && (
            <ul className="space-y-0.5 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900">
              {problemas.slice(0, 5).map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-indigo-100 pt-3">
            <button onClick={() => imprimirAtividade({ ...atividade, ...dadosBase(), valorTotal: atividade.valorTotal }, extrasImpressao)} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-white">
              🖨️ Imprimir / PDF
            </button>
            <button onClick={() => imprimirGabarito({ ...atividade, ...dadosBase(), valorTotal: atividade.valorTotal })} className="rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-white">
              🔑 Imprimir gabarito
            </button>
            <button
              onClick={() => salvar(false)}
              disabled={salvando}
              className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "✓ Aprovar e salvar"}
            </button>
            {podeCorrigir && (
              <button onClick={() => salvar(true)} disabled={salvando} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                Salvar e corrigir →
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:grid-cols-4" data-tour="ativ-campos">
        <div className="min-w-0" data-tour="ativ-serie">
          <label className="text-xs font-medium text-slate-500">Série</label>
          <select className={`${campo} ${!ano ? "border-amber-400 bg-amber-50" : ""}`} value={ano} onChange={(e) => setAno(e.target.value)}>
            <option value="">Selecione…</option>
            {ANOS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-1" data-tour="ativ-turma">
          <SeletorTurma
            valor={turmaChave}
            bloqueado={temCorrecoes}
            onChange={(v, nome) => {
              setTurmaChave(v);
              setTurmaNome(nome);
              setMateriaDev("");
            }}
            dev={dev}
            locais={locais}
            erroDev={erroDev}
            onIrTurmas={onIrTurmas}
          />
        </div>
        <div className="min-w-0">
          <label className="text-xs font-medium text-slate-500">Ano letivo</label>
          <input type="number" className={campo} value={anoLetivo} onChange={(e) => setAnoLetivo(Number(e.target.value) || new Date().getFullYear())} />
        </div>
        <div className="min-w-0">
          <label className="text-xs font-medium text-slate-500">Período *</label>
          <select data-tour="ativ-periodo" className={`${campo} ${!periodo ? "border-amber-400 bg-amber-50" : ""}`} value={periodo} onChange={(e) => setPeriodo(Number(e.target.value))}>
            <option value={0}>{carregandoPlano ? "Carregando…" : "Selecione…"}</option>
            {Array.from({ length: qtdPeriodos }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}º {nomePer}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 min-w-0" data-tour="ativ-materia">
          <label className="text-xs font-medium text-slate-500">Matéria *{devNotas ? " (do D.E.V)" : ""}</label>
          {devNotas ? (
            <select
              className={`${campo} ${!materiaDev ? "border-amber-400 bg-amber-50" : ""}`}
              value={materiaDev}
              onChange={(e) => {
                setMateriaDev(e.target.value);
                setComponente(materiasDev?.find((m) => m.id === e.target.value)?.nome ?? "");
              }}
            >
              <option value="">{materiasDev ? "Selecione…" : "Carregando…"}</option>
              {(materiasDev ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                list="materias-plano"
                className={`${campo} ${!componente.trim() ? "border-amber-400 bg-amber-50" : ""}`}
                value={componente}
                placeholder="Digite a matéria (ex.: Matemática)"
                onChange={(e) => setComponente(e.target.value)}
              />
              <datalist id="materias-plano">
                {materiasPlano.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </div>
        {devNotas && (
          <div className="min-w-0">
            <label className="text-xs font-medium text-slate-500">Tipo no D.E.V</label>
            <select className={campo} value={tipoDev} onChange={(e) => setTipoDev(e.target.value as TipoDev)}>
              {TIPOS_DEV.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0" data-tour="ativ-valor">
          <label className="text-xs font-medium text-slate-500">Valor total</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            className={campo}
            value={atividade ? atividade.valorTotal : valorTotal}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              setValorTotal(v);
              if (atividade) setAtividade({ ...atividade, valorTotal: v });
            }}
          />
        </div>
      </div>

      {infantilDev && (
        <p className="rounded-lg bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          🧸 Turma de Educação Infantil: no D.E.V ela usa conceitos. Você usa a lista de alunos do D.E.V para corrigir aqui, mas a atividade e as notas ficam só no I.A Prof.
        </p>
      )}
      {devNotas && periodoDev && !periodoDev.aberto && (
        <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">📒 O {periodo}º período desta turma está fechado no D.E.V: dá para gerar e corrigir, mas as notas só entram no D.E.V se a escola reabrir.</p>
      )}
      {devNotas && pontos && pontos.total > 0 ? (
        <p className={`-mt-2 text-xs ${naoCabe ? "font-semibold text-rose-600" : "text-slate-500"}`} data-tour="ativ-pontos">
          📒 D.E.V — {periodo}º período: {fmtPts(pontos.total)} pontos · {fmtPts(pontos.usadoDev)} já lançados
          {pontos.pendente > 0 ? ` · ${fmtPts(pontos.pendente)} em atividades salvas aqui` : ""} · <b>restam {fmtPts(pontos.restante ?? 0)}</b>
          {naoCabe ? " — o valor desta atividade não cabe." : "."}
        </p>
      ) : (
        devNotas &&
        periodoDev &&
        periodoDev.totalPontos > 0 && <p className="-mt-2 text-xs text-slate-500">📒 No D.E.V, o {periodo}º período vale {periodoDev.totalPontos} pontos no total por matéria.</p>
      )}
      {modalPontos && (
        <ModalPontos
          pontos={modalPontos}
          periodo={periodo}
          valor={valorAtual}
          onUsar={(v) => {
            setValorTotal(v);
            if (atividade) setAtividade({ ...atividade, valorTotal: v });
            setModalPontos(null);
          }}
          onFechar={() => setModalPontos(null)}
        />
      )}

      {!ehExterna && (
        <>
      {/* Habilidades do plano de curso (periodo + materia) */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-tour="ativ-habilidades">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">
            Habilidades da atividade {habilidadesDisp.length > 0 && <span className="text-rose-600">*</span>}
          </p>
          {habilidadesDisp.length > 1 && (
            <button
              type="button"
              onClick={() => setHabSel(habEscolhidas.length === habilidadesDisp.length ? [] : codigosDisp)}
              className="text-xs font-medium text-indigo-600 hover:underline"
            >
              {habEscolhidas.length === habilidadesDisp.length ? "Desmarcar todas" : "Marcar todas"}
            </button>
          )}
        </div>
        {!ano || !periodo || !componente.trim() ? (
          <p className="text-xs text-slate-500">Escolha a série, o período e a matéria para ver as habilidades do plano de curso.</p>
        ) : carregandoPlano ? (
          <p className="text-xs text-slate-500">Carregando o plano de curso…</p>
        ) : !habilidadesDisp.length ? (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {plano
              ? `O plano de curso não tem habilidades de ${componente.trim()} no ${periodo}º ${tipoPeriodo}.`
              : `Não há plano de curso do ${ANOS.find((a) => a.valor === ano)?.nome ?? ano} em ${anoLetivo}.`}{" "}
            Dá para gerar mesmo assim (sem códigos), ou{" "}
            <button type="button" onClick={onIrPlano} className="font-semibold underline">
              cadastre o plano de curso
            </button>
            .
          </div>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {habilidadesDisp.map((h) => {
              const on = habSel.includes(h.codigo!);
              return (
                <li key={h.codigo}>
                  <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${on ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-600"
                      checked={on}
                      onChange={() => setHabSel((l) => (on ? l.filter((c) => c !== h.codigo) : [...l, h.codigo!]))}
                    />
                    <span className="min-w-0 text-slate-700">
                      <b className="text-indigo-700">{h.codigo}</b> {h.habilidade}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {precisaHabilidade && <p className="mt-2 text-xs text-amber-700">Marque pelo menos uma habilidade.</p>}
      </div>

      {/* Pedido do professor */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-tour="ativ-detalhes">
        <label className="text-sm font-semibold text-slate-700" htmlFor="detalhes-ativ">
          Como deve ser a atividade?
        </label>
        <textarea
          id="detalhes-ativ"
          rows={4}
          maxLength={LIMITE_DETALHES}
          className={`${campo} mt-2`}
          placeholder="Ex.: 8 questões sobre frações, 4 de marcar X e 4 discursivas, com imagens coloridas para chamar atenção. Coloque a logo da escola no cabeçalho e letra grande."
          value={detalhes}
          onChange={(e) => setDetalhes(e.target.value)}
        />
        {/* Imagens do professor */}
        <div className="mt-2 rounded-lg border border-dashed border-slate-300 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {imgs.map((im) => (
              <span key={im.id} className="relative flex flex-col items-center gap-0.5">
                <img src={im.dataUrl} alt={im.nome} className="h-14 w-14 rounded-lg object-contain ring-1 ring-slate-200" />
                <input
                  value={im.nome}
                  onChange={(e) => setImgs(imgs.map((x) => (x.id === im.id ? { ...x, nome: e.target.value.slice(0, 40) } : x)))}
                  className="w-20 rounded border border-transparent px-1 text-center text-[10px] text-slate-600 hover:border-slate-200 focus:border-indigo-300 focus:outline-none"
                  aria-label="Nome da imagem"
                  title="Dê um nome (ex.: logo, gato) para a I.A saber o que é"
                />
                <button
                  type="button"
                  onClick={() => setImgs(imgs.filter((x) => x.id !== im.id))}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-xs text-white"
                  aria-label="Remover imagem"
                >
                  ×
                </button>
              </span>
            ))}
            {imgs.length < 8 && (
              <label className="flex h-14 cursor-pointer items-center gap-2 rounded-lg px-3 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                <span className="text-xl">🖼️</span>
                <span>
                  Adicionar imagens
                  <span className="block font-normal text-slate-500">logo da escola, figuras…</span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={async (e) => {
                    const novas = await escolherImagens(e.target.files, imgs);
                    e.target.value = "";
                    if (novas.length) setImgs([...imgs, ...novas]);
                  }}
                />
              </label>
            )}
          </div>
          {imgs.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Diga no pedido como usar (ex.: “coloque a logo no cabeçalho”, “use a imagem gato na questão 2”).</p>}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400">
            {detalhes.length}/{LIMITE_DETALHES} · Diga o tema, a quantidade e os tipos de questão (marcar X, V ou F, discursiva, completar).
          </span>
          <button
            onClick={() => gerar()}
            disabled={gerando}
            data-tour="ativ-gerar"
            className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
          >
            {gerando ? "Gerando… (com imagens leva até 1 min)" : atividade ? "✨ Gerar de novo" : "✨ Gerar atividade"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500" data-tour="ativ-aprende">
          {aprendido && aprendido.salvas + aprendido.ajustes > 0 ? (
            <>
              <span>
                🧠 A I.A já aprendeu seu jeito com {aprendido.salvas} atividade(s) salva(s){aprendido.ajustes ? ` e ${aprendido.ajustes} ajuste(s)` : ""}.
              </span>
              {esquecer ? (
                <button
                  onClick={() => atividadesApi.esquecerPreferencias().then(() => (setAprendido({ salvas: 0, ajustes: 0 }), setEsquecer(false)))}
                  className="font-semibold text-rose-600 underline"
                >
                  Confirmar: esquecer tudo
                </button>
              ) : (
                <button onClick={() => setEsquecer(true)} className="underline hover:text-slate-700">
                  Esquecer
                </button>
              )}
            </>
          ) : (
            <span>🧠 A I.A aprende seu jeito a cada atividade que você aprova e a cada ajuste que pede.</span>
          )}
          <span className="basis-full text-amber-700">⚡ Gerar usa I.A: consome do seu limite do mês (ou dos créditos). No teste grátis, conta como 1 atividade.</span>
        </div>
      </div>

        </>
      )}
      {ehExterna && !atividade && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4" data-tour="ativ-externa">
          <div>
            <p className="text-sm font-semibold text-slate-700">📥 Atividade feita fora do I.A Prof</p>
            <p className="text-xs text-slate-500">Coloque o gabarito para corrigir os alunos aqui (com foto ou à mão) e lançar as notas.</p>
          </div>
          <label className="block text-xs font-medium text-slate-500">
            Nome da atividade
            <input className={campo} value={detalhes} maxLength={200} onChange={(e) => setDetalhes(e.target.value)} placeholder="Ex.: Avaliação de Matemática — frações" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-3">
              <p className="text-sm font-semibold text-indigo-900">📷 Ler o gabarito da foto (I.A)</p>
              <p className="mt-0.5 text-xs text-indigo-800">Foto da folha (em branco ou já respondida por você) ou da lista de respostas. A I.A monta o gabarito e você confere.</p>
              {fotoLiberada ? (
                <>
                  <label className={`mt-2 inline-block cursor-pointer rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 ${lendoFoto ? "pointer-events-none opacity-50" : ""}`}>
                    {lendoFoto ? "Lendo a folha…" : "Escolher foto(s)"}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => (gabaritoPorFoto(e.target.files), (e.target.value = ""))} />
                  </label>
                  <p className="mt-1 text-[11px] text-amber-700">⚡ Usa I.A: consome do seu limite do mês (ou dos créditos). Até 4 páginas.</p>
                </>
              ) : (
                <p className="mt-2 text-xs font-medium text-indigo-900">🔒 Nos planos Profissional e Premium.</p>
              )}
            </div>
            <div className="rounded-xl border-2 border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-800">✍️ Digitar o gabarito</p>
              <p className="mt-0.5 text-xs text-slate-500">Não usa I.A. Depois você marca a resposta certa de cada questão.</p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="text-xs text-slate-500">
                  Questões
                  <input type="number" min={1} max={30} value={qtdQuestoes} onChange={(e) => setQtdQuestoes(Number(e.target.value) || 1)} className={`${campo} w-20`} />
                </label>
                <label className="text-xs text-slate-500">
                  Tipo
                  <select value={tipoQuestoes} onChange={(e) => setTipoQuestoes(e.target.value as typeof tipoQuestoes)} className={campo}>
                    <option value="multipla">Marcar X</option>
                    <option value="vf">V ou F</option>
                    <option value="discursiva">Discursiva</option>
                    <option value="completar">Completar</option>
                  </select>
                </label>
                <button onClick={gabaritoAMao} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900">
                  Montar gabarito
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {erro && !atividade && <p className="rounded-lg bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{erro}</p>}

      {/* A I.A precisa de algo para fazer do jeito pedido */}
      {perguntas && (
        <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 sm:p-4">
          <p className="text-sm font-semibold text-amber-900">🙋 Para fazer do jeito que você pediu, a I.A precisa de:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">
            {perguntas.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <textarea
            rows={2}
            value={respostas}
            onChange={(e) => setRespostas(e.target.value)}
            placeholder="Responda aqui (se precisar de imagem, use “Adicionar imagens” acima)"
            className={campo}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setPerguntas(null)} className="rounded-lg px-4 py-2 text-sm text-amber-900 hover:bg-amber-100">
              Fechar
            </button>
            <button onClick={() => gerar()} disabled={gerando} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {gerando ? "Gerando..." : "Responder e gerar"}
            </button>
          </div>
        </div>
      )}
      {aviso && !atividade && <p className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{aviso}</p>}
      {previa && atividade && (
        <PreviaAtividade
          html={htmlDaAtividade({ ...atividade, ...dadosBase(), valorTotal: atividade.valorTotal }, extrasImpressao)}
          onFechar={() => setPrevia(false)}
          onImprimir={() => imprimirAtividade({ ...atividade, ...dadosBase(), valorTotal: atividade.valorTotal }, extrasImpressao)}
          ajuste={{ valor: ajuste, onChange: setAjuste, onAjustar: () => gerar("ajuste"), ajustando }}
        />
      )}
      {usouPlano === false && atividade && (
        <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          Atividade feita só pelo seu pedido, sem habilidades do plano de curso.
        </p>
      )}

    </div>
  );
}

const fmtPts = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

// Valor da atividade maior do que resta no periodo do D.E.V (card com fundo desfocado)
function ModalPontos({
  pontos,
  periodo,
  valor,
  onUsar,
  onFechar,
}: {
  pontos: PontosPeriodo;
  periodo: number;
  valor: number;
  onUsar: (v: number) => void;
  onFechar: () => void;
}) {
  const resta = pontos.restante ?? 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onFechar} role="dialog" aria-modal="true" aria-labelledby="titulo-pontos">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">📒</div>
        <p id="titulo-pontos" className="text-lg font-bold text-slate-800">
          O valor não cabe no {periodo}º período
        </p>
        <p className="mt-1 text-sm text-slate-600">
          No D.E.V, as atividades somadas não podem passar o total do período nesta matéria. A atividade vale <b>{fmtPts(valor)}</b>, mas restam só{" "}
          <b>{fmtPts(resta)}</b> pontos.
        </p>
        <ul className="mt-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <li>Total do {periodo}º período: {fmtPts(pontos.total)} pontos</li>
          <li>Já lançados no D.E.V: {fmtPts(pontos.usadoDev)}</li>
          {pontos.pendente > 0 && <li>Em atividades salvas aqui (ainda não lançadas): {fmtPts(pontos.pendente)}</li>}
          <li className="font-semibold text-slate-700">Restam: {fmtPts(resta)}</li>
        </ul>
        <div className="mt-4 grid gap-2">
          {resta > 0 ? (
            <button onClick={() => onUsar(resta)} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              Usar {fmtPts(resta)} pontos nesta atividade
            </button>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Não restam pontos nesta matéria neste período. Escolha outro período ou diminua o valor das atividades já salvas.
            </p>
          )}
          <button onClick={onFechar} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
