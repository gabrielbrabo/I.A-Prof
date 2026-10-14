import { useEffect, useMemo, useRef, useState } from "react";
import { useDitado } from "../lib/useDitado";
import { ErroApi } from "../lib/sessao";
import { configApi, ErroAulaNoDia, InfoPlano, ItemRegistro, Opcao, registroApi, RegistroSalvo } from "../api/registroAula";
import { planoApi, PlanoCurso } from "../api/planoCurso";
import { ANOS, UFS, formatarComLimite } from "../lib/formatarRegistro";
import { sincronizarTexto } from "../lib/sincronizarTexto";
import { mesmoComponente } from "../lib/componente";
import ItemCard from "./ItemCard";
import { diarioApi, ErroAulaNoDiario, ErroReconectarDiario, nomeTurmaDiario, SituacaoDiario, TurmaDiario, VerificacaoDiario } from "../api/diario";
import { ModalConflitoDiario } from "./Diario";
import { lerPref, gravarPref, chaveDoUsuario, ufParaApi } from "../lib/prefs";

const hoje = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD no fuso local

// Registro salvo -> itens editaveis (registros antigos tinham um codigo so)
function itensDoRegistro(r: RegistroSalvo): ItemRegistro[] {
  return (r.itens ?? []).map((it) => {
    const habs = it.habilidades?.length ? it.habilidades : it.codigo ? [{ codigo: it.codigo, habilidade: it.habilidade ?? "" }] : [];
    return {
      componente: it.componente,
      conteudo: it.conteudo,
      habilidades: habs.map((h) => ({ codigo: h.codigo, habilidade: h.habilidade ?? "", fonte: "PLANO" })),
      revisar: !habs.length,
      // Palpite salvo sem conferir continua piscando ate o professor conferir
      confianca: it.conferir && habs.length ? ("baixa" as const) : ("alta" as const),
      candidatas: [], // preenchidas com o plano do periodo assim que ele carregar
    };
  });
}


// Rascunho da aula nova: a aula gerada continua na tela (trocar de aba, recarregar a pagina)
// ate o professor mudar algo, gerar outra ou salvar.
const chaveRascunho = () => chaveDoUsuario("rascunhoRegistro"); // rascunho de cada professor
interface Rascunho {
  data: string;
  texto: string;
  periodo: number;
  itens: ItemRegistro[] | null;
  planoInfo: InfoPlano | null;
  textoManual?: string | null;
  turma?: string;
  diarioTurmaId?: string;
  abertura?: string[];
}
function lerRascunho(): Rascunho | null {
  try {
    const r = JSON.parse(localStorage.getItem(chaveRascunho()) || "null") as Rascunho | null;
    return r && typeof r.texto === "string" ? r : null;
  } catch {
    return null;
  }
}
function gravarRascunho(r: Rascunho | null) {
  try {
    if (r && (r.texto.trim() || r.itens?.length || r.abertura?.length)) localStorage.setItem(chaveRascunho(), JSON.stringify(r));
    else localStorage.removeItem(chaveRascunho());
  } catch {
    /* sem storage: ignora */
  }
}

const LIMITE_PADRAO = 2000; // caracteres do texto final no diario
const ATALHOS_LIMITE = [1000, 2000, 3000, 4000];

export default function RegistroAula({
  onSalvo,
  registroEditar,
  onFecharEdicao,
  avisoInicial,
  onContexto,
  onUsouIA,
  professorNome,
  diario = null,
  onDiario,
  onAbrirDiario,
  onSemAcesso,
}: {
  onSalvo: () => void;
  registroEditar?: RegistroSalvo | null; // aberto pelo Historico para conferir/editar
  onFecharEdicao?: (aviso?: string) => void;
  avisoInicial?: string | null; // mensagem apos salvar (o formulario volta limpo)
  onContexto?: (ano: string, anoLetivo: number) => void; // serie/ano letivo da aula (aviso da aba Plano de curso)
  onUsouIA?: () => void; // atualiza o uso do plano no topo
  professorNome?: string; // nome do usuario logado
  diario?: SituacaoDiario | null; // conexao com o D.E.V (fica no App, botao no topo)
  onDiario?: (s: SituacaoDiario | null) => void;
  onAbrirDiario?: () => void;
  onSemAcesso?: () => void; // teste acabou / sem assinatura / limite do mes: abre "Minha assinatura"
}) {
  const editando = registroEditar ?? null;
  const [rascunho] = useState(() => (editando ? null : lerRascunho())); // aula nova em andamento
  // Professor: comeca com o nome da conta; o professor pode editar (fica lembrado na conta dele)
  // null = ainda nao editou (usa o nome da conta)
  const [professorEdit, setProfessorEdit] = useState<string | null>(() => editando?.professor ?? (lerPref("professor", "\u0000") === "\u0000" ? null : lerPref("professor", "")));
  // Conectado ao D.E.V: o nome da aula e o nome do professor no D.E.V (ignora o nome do I.A Prof)
  const nomeDev = diario?.conectado && diario.nome ? diario.nome : null;
  const professor = nomeDev ?? professorEdit ?? professorNome ?? "";
  // Serie e UF comecam vazias ate o professor escolher a primeira vez (depois ficam lembradas)
  const [ano, setAno] = useState(() => editando?.ano ?? lerPref("ano", ""));
  // Turma: depois da primeira aula salva, o nome fica guardado para aquela serie (preenche sozinho)
  const [turma, setTurma] = useState(() => editando?.turma ?? rascunho?.turma ?? lerPref(`turma.${editando?.ano ?? lerPref("ano", "")}`, ""));
  const [uf, setUf] = useState(() => (editando ? editando.uf || "BNCC" : lerPref("uf", "")));
  const [data, setData] = useState(() => editando?.data ?? rascunho?.data ?? hoje());
  const [texto, setTexto] = useState(() => editando?.entrada ?? rascunho?.texto ?? "");
  // Periodo salvo no registro (ou no rascunho): aplicado quando o plano carregar (so na abertura)
  const periodoInicial = useRef<number | null>(editando?.periodo ?? (rascunho?.periodo || null));

  // Plano de curso da serie no ano letivo da data: so os periodos com habilidades podem ser escolhidos
  const anoLetivo = Number(data.slice(0, 4)) || new Date().getFullYear();
  const [plano, setPlano] = useState<PlanoCurso | null>(null);
  // Avisa o App da serie/ano letivo em uso: o alerta da aba "Plano de curso" confere se ha plano de todos os periodos
  useEffect(() => {
    onContexto?.(ano, anoLetivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, anoLetivo]);
  const [carregandoPlano, setCarregandoPlano] = useState(false);
  const [planoPronto, setPlanoPronto] = useState(false); // ja tentou carregar o plano (so entao o rascunho e regravado)
  const [periodo, setPeriodo] = useState(0); // 0 = nao escolhido

  const [itens, setItens] = useState<ItemRegistro[] | null>(() => (editando ? itensDoRegistro(editando) : rascunho?.itens ?? null));
  const [planoInfo, setPlanoInfo] = useState<InfoPlano | null>(() => (editando ? null : rascunho?.planoInfo ?? null));
  // Texto final editado a mao pelo professor (null = texto montado a partir dos cards)
  const [textoManual, setTextoManual] = useState<string | null>(() =>
    editando ? (editando.textoEditado ? editando.textoFinal : null) : rascunho?.textoManual ?? null
  );
  const [editandoTexto, setEditandoTexto] = useState(false);
  // Momentos da aula sem componente (Acolhida, Rotina diaria...) que o professor escreveu
  const [abertura, setAbertura] = useState<string[]>(() => (editando ? editando.abertura ?? [] : rascunho?.abertura ?? []));
  const [textoDoEstilo, setTextoDoEstilo] = useState(false); // texto atual veio do formato aprendido das aulas do professor
  const [formatando, setFormatando] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false); // ultima tentativa barrada por plano/limite
  // Aula ja salva no mesmo dia: o professor escolhe substituir, juntar ou salvar como outra
  const [aulaNoDia, setAulaNoDia] = useState<ErroAulaNoDia["existente"] | null>(null);

  // ---------- Diario escolar ----------
  const situacaoDiario = diario;
  const setSituacaoDiario = (f: (s: SituacaoDiario | null) => SituacaoDiario | null) => onDiario?.(f(diario));
  const [turmasDiario, setTurmasDiario] = useState<TurmaDiario[] | null>(null);
  const [erroTurmasDiario, setErroTurmasDiario] = useState<string | null>(null);
  // "" = nao escolhida; "outra" = turma digitada (fora do Diario); senao o id da turma no Diario
  const [diarioTurmaId, setDiarioTurmaId] = useState<string>(
    () => editando?.diarioTurmaId ?? rascunho?.diarioTurmaId ?? lerPref(`diarioTurma.${editando?.ano ?? lerPref("ano", "")}`, "")
  );
  const [enviarDiario, setEnviarDiario] = useState(() => lerPref("enviarDiario", "1") === "1");
  const [conflitoDiario, setConflitoDiario] = useState<{ registroId: string; atual: string; aviso: string } | null>(null);
  const [enviandoDiario, setEnviandoDiario] = useState(false);
  const idTurmaDiario = /^[a-f0-9]{24}$/i.test(diarioTurmaId) ? diarioTurmaId : null;
  const usaTurmasDiario = !!situacaoDiario?.conectado && !!turmasDiario?.length;

  useEffect(() => {
    if (!situacaoDiario?.conectado) {
      setTurmasDiario(null);
      return;
    }
    let ativo = true;
    setErroTurmasDiario(null);
    diarioApi
      .turmas(String(anoLetivo))
      .then((l) => ativo && setTurmasDiario(l))
      .catch((e) => {
        if (!ativo) return;
        if (e instanceof ErroReconectarDiario) setSituacaoDiario((s) => (s ? { ...s, conectado: false, nome: null, escolas: [] } : s));
        setErroTurmasDiario(e instanceof Error ? e.message : "Erro ao buscar turmas do Diário");
        setTurmasDiario(null);
      });
    return () => {
      ativo = false;
    };
  }, [situacaoDiario?.conectado, anoLetivo]);

  // Ao escolher turma do Diario + data: avisa na hora se ja tem aula registrada nesse dia (ou se a data nao aceita aula)
  const [verifDiario, setVerifDiario] = useState<VerificacaoDiario | null>(null);
  const [verDescricaoDiario, setVerDescricaoDiario] = useState(false);
  useEffect(() => {
    setVerifDiario(null);
    setVerDescricaoDiario(false);
    if (!idTurmaDiario || !situacaoDiario?.conectado || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return;
    let ativo = true;
    const t = window.setTimeout(() => {
      diarioApi
        .verificar(idTurmaDiario, data)
        .then((v) => ativo && setVerifDiario(v))
        .catch(() => ativo && setVerifDiario(null)); // sem conexao com o Diario: nao bloqueia, confere ao enviar
    }, 400);
    return () => {
      ativo = false;
      window.clearTimeout(t);
    };
  }, [idTurmaDiario, data, situacaoDiario?.conectado]);
  // Aula aberta de Aulas salvas que ja e a mesma que esta no Diario: nao e conflito
  const ehEstaAulaNoDiario = !!verifDiario?.id && verifDiario.id === editando?.diarioRegistroId;

  function escolherTurmaDiario(id: string) {
    setDiarioTurmaId(id);
    const t = turmasDiario?.find((x) => x.id === id);
    if (t) setTurma(nomeTurmaDiario(t));
    else if (id === "outra") setTurma("");
  }

  // Envia a aula salva ao Diario; devolve o texto para o aviso final (ou abre a escolha se ja houver aula no dia)
  async function enviarAoDiario(registroId: string, aviso: string, modo?: "substituir" | "juntar"): Promise<string | null> {
    try {
      const r = await diarioApi.enviar(registroId, modo);
      const como = r.acao === "substituida" ? " (substituiu a aula que estava lá)" : r.acao === "juntada" ? " (juntada à aula que estava lá)" : "";
      return `${aviso} Também foi enviada ao Diário escolar${como}.`;
    } catch (e) {
      if (e instanceof ErroAulaNoDiario) {
        setConflitoDiario({ registroId, atual: e.descricaoAtual, aviso });
        return null; // espera o professor escolher
      }
      if (e instanceof ErroReconectarDiario) setSituacaoDiario((s) => (s ? { ...s, conectado: false, nome: null, escolas: [] } : s));
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      return `${aviso} ⚠️ Não foi enviada ao Diário: ${msg} Você pode enviar depois em Aulas salvas.`;
    }
  }

  async function decidirConflitoDiario(modo: "substituir" | "juntar" | null) {
    if (!conflitoDiario) return;
    const { registroId, aviso } = conflitoDiario;
    if (!modo) {
      setConflitoDiario(null);
      onFecharEdicao?.(`${aviso} Não foi enviada ao Diário (você pode enviar depois em Aulas salvas).`);
      return;
    }
    setEnviandoDiario(true);
    const final = await enviarAoDiario(registroId, aviso, modo);
    setEnviandoDiario(false);
    setConflitoDiario(null);
    onFecharEdicao?.(final ?? aviso);
  }
  // Cards alterados depois de editar o texto a mao: avisa que o texto nao acompanha
  const itensNoManual = useRef<ItemRegistro[] | null>(null);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(avisoInicial ?? null);

  // Guarda a aula nova em andamento (nao vale para aula aberta do Historico)
  useEffect(() => {
    if (editando || carregandoPlano || !planoPronto) return;
    // Periodo ainda nao aplicado (plano nao carregou): mantem o do rascunho para nao perder
    gravarRascunho({ data, texto, periodo: periodo || periodoInicial.current || 0, itens, planoInfo, textoManual, turma, diarioTurmaId, abertura });
  }, [editando, carregandoPlano, planoPronto, data, texto, periodo, itens, planoInfo, textoManual, turma, diarioTurmaId, abertura]);

  // Limites de caracteres: entrada vem do servidor; saida = limite do campo no diario (professor pode ajustar)
  const [limiteEntrada, setLimiteEntrada] = useState(1000);
  // Ditado por voz (reconhecimento do navegador, sem custo): cada frase falada entra no fim do texto
  const ditado = useDitado((trecho) => {
    if (!trecho) return;
    setTexto((t) => {
      const junto = t.trim() ? `${t.trimEnd()} ${trecho}` : trecho;
      return junto.slice(0, limiteEntrada);
    });
  });
  // Tamanho maximo do texto no diario: padrao 2000 caracteres (o professor ajusta ao campo do diario dele)
  const [limiteSaida, setLimiteSaida] = useState(() => lerPref("limiteSaida", "") || String(LIMITE_PADRAO));

  useEffect(() => {
    configApi
      .get()
      .then((c) => {
        setLimiteEntrada(c.limiteEntrada);
        // Limite definido no servidor (.env) so vale se o professor ainda nao escolheu o dele
        if (!lerPref("limiteSaida", "") && c.limiteRegistro > 0 && c.limiteRegistro !== LIMITE_PADRAO) setLimiteSaida(String(c.limiteRegistro));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ativo = true;
    if (!ano) {
      // Serie ainda nao escolhida: nada para carregar
      setPlano(null);
      setPeriodo(0);
      setCarregandoPlano(false);
      setPlanoPronto(true);
      return;
    }
    setCarregandoPlano(true);
    setPlano(null);
    setPeriodo(0);
    planoApi
      .obter(ano, anoLetivo)
      .then((p) => {
        if (!ativo) return;
        setPlano(p);
        // O professor escolhe o periodo da aula. Aula do Historico (ou rascunho) volta com o periodo salvo.
        const disp = (p?.periodos ?? []).filter((x) => x.itens.some((i) => i.codigo));
        const salvo = periodoInicial.current;
        periodoInicial.current = null;
        setPeriodo(salvo && disp.some((x) => x.numero === salvo) ? salvo : 0);
      })
      .catch(() => {
        if (!ativo) return;
        setPlano(null);
        setErro("Não consegui carregar o plano de curso (o servidor está rodando?). A aula gerada continua aqui; recarregue a página quando o servidor voltar.");
      })
      .finally(() => {
        if (!ativo) return;
        setCarregandoPlano(false);
        setPlanoPronto(true);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, anoLetivo]);


  const periodosDisponiveis = (plano?.periodos ?? []).filter((x) => x.itens.some((i) => i.codigo));
  const nomePeriodo = plano ? plano.tipoPeriodo.charAt(0).toUpperCase() + plano.tipoPeriodo.slice(1) : "";
  // Habilidades do periodo escolhido (usadas na troca/busca manual dentro de cada item)
  const habilidadesPeriodo: Array<Opcao & { componente: string }> = useMemo(
    () =>
      (plano?.periodos.find((x) => x.numero === periodo)?.itens ?? [])
        .filter((i) => i.codigo && i.habilidade)
        .map((i) => ({ codigo: i.codigo!, habilidade: i.habilidade!, fonte: i.recomposicao ? "RECOMPOSIÇÃO" : "PLANO", componente: i.componente })),
    [plano, periodo]
  );

  // Habilidades dos OUTROS periodos do plano: so para o professor escolher a mao (a I.A nunca usa)
  const habilidadesOutros: Array<Opcao & { componente: string; periodo: number }> = useMemo(
    () =>
      (plano?.periodos ?? [])
        .filter((x) => x.numero !== periodo)
        .flatMap((x) =>
          x.itens
            .filter((i) => i.codigo && i.habilidade)
            .map((i) => ({
              codigo: i.codigo!,
              habilidade: i.habilidade!,
              fonte: i.recomposicao ? "RECOMPOSIÇÃO" : "PLANO",
              componente: i.componente,
              periodo: x.numero,
            }))
        )
        .filter((h) => !habilidadesPeriodo.some((x) => x.codigo === h.codigo)),
    [plano, periodo, habilidadesPeriodo]
  );

  // Itens abertos do historico: completa as opcoes (candidatas) com o plano do periodo
  useEffect(() => {
    if (!habilidadesPeriodo.length) return;
    setItens((l) =>
      l?.map((it) =>
        it.candidatas.length
          ? it
          : {
              ...it,
              candidatas: habilidadesPeriodo
                .filter((h) => mesmoComponente(h.componente, it.componente))
                .map(({ codigo, habilidade, fonte }) => ({ codigo, habilidade, fonte })),
              habilidades: it.habilidades.map((h) => ({ ...h, fonte: habilidadesPeriodo.find((x) => x.codigo === h.codigo)?.fonte ?? h.fonte })),
            }
      ) ?? l
    );
  }, [habilidadesPeriodo]);

  const limiteNum = Number(limiteSaida) > 0 ? Number(limiteSaida) : null;
  const fmt = useMemo(() => (itens ? formatarComLimite(itens, limiteNum, abertura) : null), [itens, limiteNum, abertura]);
  const textoMontado = fmt?.texto ?? "";
  const textoFinal = textoManual ?? textoMontado; // o que vai para o diario
  const excede = textoManual != null ? !!limiteNum && textoManual.length > limiteNum : !!fmt?.excede;
  // Texto editado a mao + professor mudou habilidades nos cards: leva a mudanca para dentro do texto
  const [sincInfo, setSincInfo] = useState<"ok" | "conteudo" | null>(null);
  const [, setSincTick] = useState(0);
  useEffect(() => {
    const antes = itensNoManual.current;
    if (textoManual == null || !itens || !antes || antes === itens) return;
    const r = sincronizarTexto(textoManual, antes, itens);
    if (!r.ok) return; // nao achou no texto (professor reescreveu): fica o aviso para refazer
    // Mudou o CONTEUDO de algum card: isso o professor ajusta no texto (nao reescrevemos a frase dele)
    const conteudoMudou = itens.some((n) => {
      const v = antes.find((a) => a.componente === n.componente);
      return v && v.conteudo.trim() !== n.conteudo.trim();
    });
    itensNoManual.current = itens;
    if (r.texto !== textoManual) setTextoManual(r.texto);
    setSincInfo(conteudoMudou ? "conteudo" : r.texto !== textoManual ? "ok" : null);
    setSincTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);
  const cardsMudaram = textoManual != null && itensNoManual.current != null && itensNoManual.current !== itens;
  const pendentes = itens?.filter((i) => !i.habilidades.length).length ?? 0;
  const palpites = itens?.filter((i) => i.confianca === "baixa" && i.habilidades.length > 0).length ?? 0;
  // Habilidades que nao estao em NENHUM periodo do plano (ex.: aula antiga aberta de Aulas salvas): bloqueiam o salvar.
  // As de outros periodos escolhidas a mao pelo professor sao permitidas.
  const foraDoPlano = habilidadesPeriodo.length
    ? [
        ...new Set(
          (itens ?? [])
            .flatMap((i) => i.habilidades.map((h) => h.codigo))
            .filter((c) => !habilidadesPeriodo.some((x) => x.codigo === c) && !habilidadesOutros.some((x) => x.codigo === c))
        ),
      ]
    : [];

  function mudar<T extends string>(setter: (v: T) => void, chave: string) {
    return (v: T) => {
      setter(v);
      gravarPref(chave, v);
    };
  }

  async function gerar() {
    if (ditado.ouvindo) ditado.parar();
    if (!ano || !uf) {
      setErro("Selecione a série e a UF da aula.");
      return;
    }
    if (!periodo) {
      setErro("Selecione o período da aula.");
      return;
    }
    setErro(null);
    setSemAcesso(false);
    setAviso(null);
    setGerando(true);
    try {
      const r = await registroApi.gerar({ texto, ano, uf: ufParaApi(uf), turma: turma.trim() || null, data, anoLetivo, periodo, limiteSaida: limiteNum });
      setPlanoInfo(r.plano);
      setEditandoTexto(false);
      setAbertura(r.abertura ?? []);
      if (!r.itens.length && !(r.abertura ?? []).length)
        setErro("Não consegui identificar os componentes. Escreva, por exemplo: \"mat tabuada, port leitura de fábula\".");
      // Card sem opcoes (nome do componente diferente do plano): preenche com as habilidades do mesmo componente no periodo
      setItens(
        r.itens.map((it) =>
          it.candidatas.length
            ? it
            : {
                ...it,
                candidatas: habilidadesPeriodo
                  .filter((h) => mesmoComponente(h.componente, it.componente))
                  .map(({ codigo, habilidade, fonte }) => ({ codigo, habilidade, fonte })),
              }
        )
      );
      onUsouIA?.();
      // Ja ha aulas do professor com texto editado: o texto vem no formato dele
      if (r.textoEstilo) {
        itensNoManual.current = r.itens;
        setSincInfo(null);
        setTextoManual(r.textoEstilo);
        setTextoDoEstilo(true);
      } else {
        setTextoManual(null); // aula nova: texto montado pelos cards
        setSincInfo(null);
        setTextoDoEstilo(false);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar");
      if (e instanceof ErroApi && e.semAcesso) setSemAcesso(true);
    } finally {
      setGerando(false);
    }
  }

  async function salvar(duplicado?: "substituir" | "juntar" | "nova") {
    if (!itens || (!itens.length && !abertura.length)) return;
    setAulaNoDia(null);
    setErro(null);
    setSalvando(true);
    try {
      const corpo = {
        professor: professor || undefined,
        turma: turma.trim() || undefined,
        diarioTurmaId: idTurmaDiario,
        ano,
        uf: ufParaApi(uf),
        data,
        entrada: texto,
        anoLetivo,
        periodo,
        limiteSaida: limiteNum,
        textoManual: textoManual?.trim() || null,
        duplicado,
        abertura,
        itens: itens.map(({ componente, conteudo, habilidades, confianca }) => ({
          componente,
          conteudo,
          habilidades: habilidades.map(({ codigo, habilidade }) => ({ codigo, habilidade })),
          conferir: confianca === "baixa" && habilidades.length > 0,
        })),
      };
      const lembrarTurma = () => {
        if (turma.trim()) gravarPref(`turma.${ano}`, turma.trim());
        gravarPref(`diarioTurma.${ano}`, diarioTurmaId);
      };
      // Turma do Diario escolhida e "enviar" marcado: manda a aula salva para o Diario
      const mandarDiario = !!idTurmaDiario && enviarDiario && !!situacaoDiario?.conectado;
      if (editando) {
        const doc = await registroApi.atualizar(editando._id, corpo);
        lembrarTurma();
        onSalvo();
        // Sai da edicao: o Registro de aula volta limpo para uma nova aula
        const avisoEd = "Alterações salvas! A aula está em Aulas salvas. Pode registrar uma nova aula.";
        if (mandarDiario) {
          const final = await enviarAoDiario(doc._id, avisoEd, ehEstaAulaNoDiario ? "substituir" : undefined); // mesma aula do Diario: atualiza
          onSalvo();
          if (final) onFecharEdicao?.(final);
          return;
        }
        onFecharEdicao?.(avisoEd);
        return;
      }
      const doc = await registroApi.salvar(corpo);
      lembrarTurma();
      onSalvo();
      const avisoSalvo =
        duplicado === "substituir"
          ? "Aula do dia substituída! Está em Aulas salvas. Pode registrar uma nova aula."
          : duplicado === "juntar"
            ? "Conteúdo juntado à aula do dia! Está em Aulas salvas. Pode registrar uma nova aula."
            : "Registro salvo! A aula está em Aulas salvas. Pode registrar uma nova aula.";
      // Formulario limpo para a proxima aula (a salva vai para o Historico)
      gravarRascunho(null); // aula salva: o formulario volta limpo
      if (mandarDiario) {
        const final = await enviarAoDiario(doc._id, avisoSalvo);
        onSalvo();
        if (final) onFecharEdicao?.(final);
        return;
      }
      onFecharEdicao?.(avisoSalvo);
    } catch (e) {
      if (e instanceof ErroAulaNoDia) setAulaNoDia(e.existente);
      else setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  // Reescreve o texto no formato das aulas que o professor editou (usa I.A)
  async function refazerNoFormato() {
    if (!itens) return;
    setFormatando(true);
    setErro(null);
    try {
      const r = await registroApi.formatar({
        ano,
        turma: turma.trim() || null,
        abertura,
        limiteSaida: limiteNum,
        itens: itens.map(({ componente, conteudo, habilidades }) => ({
          componente,
          conteudo,
          habilidades: habilidades.map(({ codigo, habilidade }) => ({ codigo, habilidade })),
        })),
      });
      itensNoManual.current = itens;
      setTextoManual(r.texto);
      setTextoDoEstilo(true);
      onUsouIA?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao formatar");
      if (e instanceof ErroApi && e.semAcesso) setSemAcesso(true);
    } finally {
      setFormatando(false);
    }
  }

  async function copiar() {
    await navigator.clipboard.writeText(textoFinal);
    setAviso("Texto copiado! Cole no diário.");
  }

  const campo = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <div className="space-y-5">
      {editando && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <span>
            ✏️ Editando o registro de <b>{editando.data.split("-").reverse().join("/")}</b>. Confira e ajuste as habilidades e clique em{" "}
            <b>Salvar alterações</b>.
          </span>
          <button onClick={() => onFecharEdicao?.()} className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">
            Fechar edição / novo registro
          </button>
        </div>
      )}

      {/* Cabecalho da turma */}
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 lg:grid-cols-7">
        <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between gap-1">
            <label className="text-xs font-medium text-slate-500">Professor(a)</label>
            {nomeDev && <span className="text-[10px] font-medium text-emerald-700">nome do D.E.V</span>}
          </div>
          <input
            className={`${campo} ${nomeDev ? "cursor-not-allowed bg-slate-50 text-slate-600" : ""}`}
            value={professor}
            readOnly={!!nomeDev}
            title={nomeDev ? "Conectado ao D.E.V: o nome usado é o do seu cadastro no D.E.V" : undefined}
            onChange={(e) => !nomeDev && mudar(setProfessorEdit as (v: string) => void, "professor")(e.target.value)}
          />
        </div>
        <div className="min-w-0">
          <label className="text-xs font-medium text-slate-500">Série</label>
          <select
            className={`${campo} ${!ano ? "border-amber-400 bg-amber-50" : ""}`}
            value={ano}
            onChange={(e) => {
              mudar(setAno, "ano")(e.target.value);
              setTurma(lerPref(`turma.${e.target.value}`, "")); // turma guardada dessa serie
              setDiarioTurmaId(lerPref(`diarioTurma.${e.target.value}`, ""));
            }}
          >
            <option value="">Selecione…</option>
            {ANOS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1">
            <label className="text-xs font-medium text-slate-500">Turma</label>
            {situacaoDiario && (
              <button
                type="button"
                onClick={() => onAbrirDiario?.()}
                className={`truncate text-[11px] font-semibold ${situacaoDiario.conectado ? "text-emerald-700" : "text-amber-700 hover:underline"}`}
                title={situacaoDiario.conectado ? "Conectado ao D.E.V" : "Conectar ao D.E.V"}
              >
                {situacaoDiario.conectado ? "📒 D.E.V ✓" : "📒 Conectar D.E.V"}
              </button>
            )}
          </div>
          {usaTurmasDiario && diarioTurmaId !== "outra" ? (
            <select
              className={`${campo} ${!idTurmaDiario ? "border-amber-400 bg-amber-50" : ""}`}
              value={idTurmaDiario ?? ""}
              onChange={(e) => escolherTurmaDiario(e.target.value)}
            >
              <option value="">Selecione…</option>
              {turmasDiario!.map((t) => (
                <option key={t.id} value={t.id}>
                  {nomeTurmaDiario(t)}
                  {situacaoDiario!.escolas.length > 1 ? ` — ${t.escola}` : ""}
                  {t.papel === "ED_FISICA" ? " (Ed. Física)" : ""}
                </option>
              ))}
              <option value="outra">Outra (não enviar ao Diário)</option>
            </select>
          ) : (
            <input className={campo} value={turma} placeholder="ex.: 4º A" onChange={(e) => setTurma(e.target.value)} />
          )}
          {usaTurmasDiario && diarioTurmaId === "outra" && (
            <button type="button" onClick={() => escolherTurmaDiario("")} className="mt-0.5 text-[11px] text-indigo-600 hover:underline">
              usar turma do Diário
            </button>
          )}
          {erroTurmasDiario && <p className="mt-0.5 text-[11px] text-rose-600">{erroTurmasDiario}</p>}
        </div>
        <div className="col-span-2 grid min-w-0 grid-cols-[5.5rem_1fr] gap-2 sm:col-span-1 lg:col-span-2">
          <div>
            <label className="text-xs font-medium text-slate-500">UF</label>
            <select className={`${campo} ${!uf ? "border-amber-400 bg-amber-50" : ""}`} value={uf} onChange={(e) => mudar(setUf, "uf")(e.target.value)}>
              <option value="">Selecione…</option>
              <option value="BNCC">BNCC</option>
              {UFS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Data</label>
            <input type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1">
          <label className="text-xs font-medium text-slate-500">Período *</label>
          <select
            className={`${campo} ${!periodo && periodosDisponiveis.length ? "border-amber-400 bg-amber-50" : ""}`}
            value={periodo}
            disabled={!periodosDisponiveis.length}
            onChange={(e) => {
              // Trocar o periodo NAO apaga a aula gerada: as opcoes dos cards passam a ser as do novo periodo
              // e habilidades que nao estao nele ficam em vermelho para trocar (sem gerar de novo).
              const novo = Number(e.target.value);
              setPeriodo(novo);
              const habs = (plano?.periodos.find((x) => x.numero === novo)?.itens ?? []).filter((i) => i.codigo && i.habilidade);
              setItens((l) =>
                l?.map((it) => ({
                  ...it,
                  candidatas: habs
                    .filter((h) => mesmoComponente(h.componente, it.componente))
                    .map((h) => ({ codigo: h.codigo!, habilidade: h.habilidade!, fonte: h.recomposicao ? "RECOMPOSIÇÃO" : "PLANO" })),
                })) ?? l
              );
            }}
          >
            <option value={0}>{carregandoPlano ? "Carregando..." : periodosDisponiveis.length ? "Selecione…" : "Sem plano"}</option>
            {periodosDisponiveis.map((p) => (
              <option key={p.numero} value={p.numero}>
                {p.numero}º {nomePeriodo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Aviso do Diario escolar para a turma e data escolhidas */}
      {verifDiario && !verifDiario.podeRegistrar && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          📒 <b>Diário escolar:</b> {verifDiario.motivo} A aula pode ser salva aqui, mas não será enviada ao Diário nesta data.
        </div>
      )}
      {verifDiario?.existe && !ehEstaAulaNoDiario && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p>
            📒 <b>Já existe aula registrada no Diário em {data.split("-").reverse().join("/")}</b>
            {turma.trim() ? ` para a turma ${turma.trim()}` : ""}. Ao salvar, você escolhe se substitui ou junta com a aula de lá.
          </p>
          <button type="button" onClick={() => setVerDescricaoDiario((v) => !v)} className="mt-1 text-xs font-medium text-amber-800 underline">
            {verDescricaoDiario ? "esconder aula do Diário" : "ver aula que está no Diário"}
          </button>
          {verDescricaoDiario && (
            <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-700">{verifDiario.descricao}</p>
          )}
        </div>
      )}
      {verifDiario?.existe && ehEstaAulaNoDiario && (
        <div className="rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
          📒 Esta aula já está no Diário. Se você alterar e salvar, ela será atualizada lá.
        </div>
      )}

      {!carregandoPlano && !periodosDisponiveis.length && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não há plano de curso do <b>{ANOS.find((a) => a.valor === ano)?.nome}</b> em <b>{anoLetivo}</b>. Cadastre o plano na aba{" "}
          <b>Plano de curso</b> para gerar registros — as habilidades usadas vêm do plano do período.
        </div>
      )}
      {!carregandoPlano && periodosDisponiveis.length > 0 && !periodo && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Selecione o <b>período</b> da aula ({periodosDisponiveis.map((p) => `${p.numero}º`).join(", ")} {plano?.tipoPeriodo}) — as habilidades usadas
          vêm do plano de curso desse período.
        </div>
      )}
      {periodo > 0 && (
        <p className="-mt-2 text-xs text-slate-500">
          Usando as {habilidadesPeriodo.length} habilidades do plano de curso do {periodo}º {plano?.tipoPeriodo}.
        </p>
      )}

      {/* Entrada rapida */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        {/* Tamanho do texto no diario: em destaque, antes de escrever */}
        <div id="limite-diario" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5">
          <span className="text-sm font-semibold text-indigo-900">📏 Tamanho máximo do texto no diário</span>
          <span className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={100}
              value={limiteSaida}
              placeholder="sem limite"
              onChange={(e) => mudar(setLimiteSaida, "limiteSaida")(e.target.value)}
              className="w-24 rounded-md border border-indigo-300 bg-white px-2 py-1 text-sm font-semibold text-indigo-900 focus:border-indigo-500 focus:outline-none"
            />
            <span className="text-sm text-indigo-900">caracteres</span>
          </span>
          <span className="flex flex-wrap gap-1">
            {ATALHOS_LIMITE.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => mudar(setLimiteSaida, "limiteSaida")(String(n))}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  Number(limiteSaida) === n ? "bg-indigo-600 text-white" : "bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                }`}
              >
                {n}
              </button>
            ))}
          </span>
          <span className="w-full text-xs text-indigo-700">
            Use o limite do campo de registro do seu diário. O texto gerado é ajustado para caber (deixe vazio para não limitar).
          </span>
        </div>

        <label className="text-sm font-semibold text-slate-700">O que você trabalhou hoje?</label>
        <p className="mb-2 text-xs text-slate-500">
          Escreva do seu jeito, abreviado mesmo — ou clique em <b>🎤 Falar</b> e conte a aula. Confira e edite o texto antes de gerar: a I.A separa por
          componente e coloca os códigos.
        </p>
        <textarea
          rows={3}
          className={campo}
          value={texto}
          maxLength={limiteEntrada}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="mat tabuada 0 a 10, port texto dia da mulher, ens rel manifestações religiosas, geo poema diversidade cultural"
        />
        {ditado.ouvindo && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-rose-600">
            <span className="inline-block h-2 w-2 rounded-full bg-rose-600 motion-safe:animate-pulse" />
            {ditado.modoGravar ? (
              <>
                Gravando… {Math.floor(ditado.segundos / 60)}:{String(ditado.segundos % 60).padStart(2, "0")} de {ditado.maxSegundos / 60}:00. Fale a aula e
                clique em <b>Parar</b>: o texto aparece logo depois.
              </>
            ) : (
              <>
                Ouvindo… fale a aula com calma. Clique em <b>Parar</b> quando terminar.
              </>
            )}
            {ditado.parcial && <span className="italic text-slate-400">“{ditado.parcial}”</span>}
          </p>
        )}
        {ditado.transcrevendo && <p className="mt-1 text-xs text-indigo-600">Transformando a fala em texto…</p>}
        {ditado.erro && <p className="mt-1 text-xs text-rose-600">{ditado.erro}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <button
              type="button"
              onClick={ditado.alternar}
              disabled={ditado.transcrevendo}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                ditado.ouvindo ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
              }`}
              title="Ditar a aula por voz"
            >
              {ditado.transcrevendo ? "⏳ Transcrevendo…" : ditado.ouvindo ? "⏹ Parar" : "🎤 Falar"}
            </button>
            <span className={texto.length >= limiteEntrada ? "font-semibold text-rose-600" : ""}>
              {texto.length} / {limiteEntrada}
            </span>
          </div>
          <button
            onClick={gerar}
            disabled={gerando || texto.trim().length < 3 || !periodo || ditado.transcrevendo || (ditado.ouvindo && ditado.modoGravar)}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {gerando ? "Gerando..." : "✨ Gerar aula"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{erro}</span>
          {semAcesso && onSemAcesso && (
            <button onClick={onSemAcesso} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
              Ver planos
            </button>
          )}
        </div>
      )}
      {aviso && <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{aviso}</div>}

      {/* Revisao */}
      {itens && planoInfo && (
        <div
          className={`rounded-lg px-4 py-2 text-xs ${planoInfo.usado ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}
        >
          {planoInfo.usado
            ? `📘 Usando o plano de curso: ${planoInfo.periodo}º ${planoInfo.tipoPeriodo} (${planoInfo.habilidadesNoPeriodo} habilidades). Só habilidades desse período são usadas.`
            : "Sem plano de curso para esta série/ano letivo. Cadastre na aba Plano de curso para a I.A priorizar as habilidades do período."}
        </div>
      )}

      {itens && (itens.length > 0 || abertura.length > 0) && (
        <>
          {/* Momentos sem componente: Acolhida, Rotina diaria... (entram no inicio do texto) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className="text-xs font-semibold text-slate-600">Momentos da aula (sem habilidade) — um por linha</label>
            <textarea
              rows={Math.max(2, abertura.length)}
              value={abertura.join("\n")}
              onChange={(e) => setAbertura(e.target.value.split("\n"))}
              onBlur={() => setAbertura((l) => l.map((x) => x.trim()).filter(Boolean))}
              placeholder={"Acolhida.\nRotina diária.\nHabilidade auditiva: Sons emitidos pelos animais."}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {itens.map((it, idx) => (
              <ItemCard
                key={idx}
                item={it}
                ano={ano}
                uf={ufParaApi(uf)}
                habilidadesPeriodo={habilidadesPeriodo}
                habilidadesOutros={habilidadesOutros}
                nomePeriodo={plano?.tipoPeriodo ?? "período"}
                onChange={(novo) => setItens((l) => l!.map((x, i) => (i === idx ? novo : x)))}
                onRemove={() => setItens((l) => l!.filter((_, i) => i !== idx))}
              />
            ))}
          </div>

          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 sm:p-4">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-slate-700">Texto para o diário · 📅 {data.split("-").reverse().join("/")}</span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {palpites > 0 && <span className="font-semibold text-amber-700">{palpites} card(s) para conferir</span>}
                {pendentes > 0 && <span className="text-amber-700">{pendentes} item(ns) sem habilidade</span>}
                <span className={excede ? "font-semibold text-rose-600" : "text-slate-500"}>
                  {textoFinal.length}
                  {limiteNum ? ` / ${limiteNum}` : ""} caracteres
                </span>
                <button
                  type="button"
                  onClick={() => document.getElementById("limite-diario")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="text-indigo-600 underline hover:text-indigo-800"
                >
                  alterar limite
                </button>
              </span>
            </div>
            {textoManual == null && fmt?.compactado && !fmt.excede && (
              <p className="mb-2 text-xs text-amber-700">Para caber no limite, algumas descrições foram removidas (ficou só o código).</p>
            )}
            {excede && (
              <p className="mb-2 text-xs text-rose-600">
                {textoManual != null
                  ? "O texto passou do limite do diário. Encurte o texto."
                  : "Mesmo só com os códigos, o texto passou do limite. Encurte os conteúdos ou remova um item."}
              </p>
            )}
            {editandoTexto ? (
              <>
                <textarea
                  autoFocus
                  rows={Math.min(14, Math.max(5, Math.ceil(textoFinal.length / 110)))}
                  value={textoFinal}
                  onChange={(e) => {
                    if (textoManual == null) itensNoManual.current = itens;
                    setTextoManual(e.target.value);
                    setTextoDoEstilo(false);
                    setSincInfo(null);
                  }}
                  className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:outline-none"
                />
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                  <button onClick={() => setEditandoTexto(false)} className="rounded-lg bg-indigo-600 px-3 py-1 font-medium text-white hover:bg-indigo-700">
                    ✓ Pronto
                  </button>
                  <span className="text-slate-500">O texto editado é o que vai ser salvo e copiado para o diário.</span>
                </div>
              </>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{textoFinal}</p>
            )}
            {textoManual != null && !editandoTexto && (
              <p className={`mt-2 rounded-lg px-3 py-2 text-xs ${cardsMudaram ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>
                {cardsMudaram
                  ? "Você mudou os cards depois deste texto e não consegui atualizar o texto sozinho (ele foi reescrito). "
                  : sincInfo === "conteudo"
                    ? "As habilidades foram atualizadas no texto, mas o conteúdo de um card mudou: ajuste essa parte em ✏️ Editar texto ou "
                    : sincInfo === "ok"
                      ? "✓ As habilidades que você mudou nos cards foram atualizadas neste texto. "
                      : textoDoEstilo
                    ? "✨ Texto no formato das suas aulas anteriores. "
                    : "Texto editado manualmente. "}
                <button
                  onClick={() => {
                    setTextoManual(null);
                    setTextoDoEstilo(false);
                    setSincInfo(null);
                    itensNoManual.current = null;
                  }}
                  className="font-medium text-indigo-700 underline hover:text-indigo-900"
                >
                  Refazer o texto a partir dos cards
                </button>
                {textoDoEstilo && cardsMudaram && (
                  <>
                    {" · "}
                    <button
                      onClick={refazerNoFormato}
                      disabled={formatando}
                      className="font-medium text-indigo-700 underline hover:text-indigo-900 disabled:opacity-50"
                    >
                      {formatando ? "Refazendo…" : "Refazer no meu formato (I.A)"}
                    </button>
                  </>
                )}
              </p>
            )}
            {!periodo && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Selecione o <b>período</b> da aula (no topo) para salvar — a aula gerada não se perde.
              </p>
            )}
            {foraDoPlano.length > 0 && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {foraDoPlano.join(", ")} não {foraDoPlano.length > 1 ? "estão" : "está"} em nenhum período do plano de curso. Troque ou remova
                para salvar.
              </p>
            )}
            {idTurmaDiario && situacaoDiario?.conectado && (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-indigo-600"
                  checked={enviarDiario}
                  onChange={(e) => {
                    setEnviarDiario(e.target.checked);
                    gravarPref("enviarDiario", e.target.checked ? "1" : "0");
                  }}
                />
                Enviar também para o <b>Diário escolar</b> ({turma})
              </label>
            )}
            <div className="mt-4 flex flex-wrap gap-2 sm:justify-end">
              {!editandoTexto && (
                <button
                  onClick={() => setEditandoTexto(true)}
                  className="flex-1 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 py-2.5 sm:mr-auto sm:flex-none sm:py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ✏️ Editar texto
                </button>
              )}
              <button onClick={copiar} className="flex-1 whitespace-nowrap rounded-lg border border-indigo-300 bg-white px-4 py-2.5 sm:flex-none sm:py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
                Copiar texto
              </button>
              <button
                onClick={() => salvar()}
                disabled={salvando || excede || foraDoPlano.length > 0 || !textoFinal.trim() || !periodo}
                className="basis-full rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold sm:basis-auto sm:py-2 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Aprovar e salvar"}
              </button>
            </div>
          </div>
        </>
      )}
      {conflitoDiario && <ModalConflitoDiario data={data} atual={conflitoDiario.atual} enviando={enviandoDiario} onEscolher={decidirConflitoDiario} />}

      {/* Ja existe aula salva nesse dia */}
      {aulaNoDia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => setAulaNoDia(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-semibold text-slate-800">
              Já existe uma aula salva em {aulaNoDia.data.split("-").reverse().join("/")}
              {turma.trim() ? ` para a turma ${turma.trim()}` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">Aula que já está em Aulas salvas:</p>
            <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
              {aulaNoDia.textoFinal}
            </p>
            <p className="mt-3 text-sm text-slate-700">O que fazer com a aula nova?</p>
            <div className="mt-2 grid grid-cols-1 gap-2">
              <button onClick={() => salvar("substituir")} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                <b>Substituir</b> <span className="text-xs text-slate-500">— a aula nova fica no lugar da que já está salva</span>
              </button>
              <button onClick={() => salvar("juntar")} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                <b>Juntar</b> <span className="text-xs text-slate-500">— acrescenta o conteúdo novo na aula do dia (um registro só)</span>
              </button>
              <button onClick={() => salvar("nova")} className="rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50">
                <b>Salvar como outra aula</b> <span className="text-xs text-slate-500">— ficam duas aulas no mesmo dia</span>
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setAulaNoDia(null)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
