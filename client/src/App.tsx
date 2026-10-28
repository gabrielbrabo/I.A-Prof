import SeloConsumo from "./components/SeloConsumo";
import { useEffect, useRef, useState } from "react";
import RegistroAula from "./components/RegistroAula";
import Historico from "./components/Historico";
import PlanoCurso from "./components/PlanoCurso";
import { RegistroSalvo } from "./api/registroAula";
import { planoApi, TipoPeriodo } from "./api/planoCurso";
import { ANOS } from "./lib/formatarRegistro";
import { gravarPref, lerPref, gravarPrefGlobal, lerPrefGlobal } from "./lib/prefs";
import { lerToken, sair } from "./lib/sessao";
import { contaApi, Situacao, Usuario } from "./api/conta";
import Entrar from "./components/Entrar";
import Assinatura from "./components/Assinatura";
import Logo from "./components/Logo";
import Tour, { PASSOS_ATIV_PRONTA, PASSOS_ATIVIDADE, PASSOS_AULA_PRONTA, PASSOS_INICIO, PASSOS_PLANO } from "./components/Tour";
import ComoUsar from "./components/ComoUsar";
import { FERRAMENTAS, ferramentaDa, Tela } from "./components/Menu";
import InstalarApp from "./components/InstalarApp";
import { diarioApi, SituacaoDiario } from "./api/diario";
import { ModalConectarDiario } from "./components/Diario";
import GerarAtividade from "./components/atividades/GerarAtividade";
import AtividadesSalvas from "./components/atividades/AtividadesSalvas";
import CorrigirAtividade from "./components/atividades/CorrigirAtividade";
import Turmas from "./components/atividades/Turmas";
import Configuracoes, { BoasVindas, configCompleta } from "./components/Configuracoes";
import { Atividade } from "./api/atividades";
import { reais } from "./api/conta";
import WhatsAppButton from "./components/WhatsAppButton";
import Admin from "./components/Admin";

const QTD_PERIODOS: Record<TipoPeriodo, number> = { bimestre: 4, trimestre: 3, semestre: 2 };

// Tema: claro ou escuro (escolha do professor; sem escolha, segue o sistema)
function temaInicial(): "claro" | "escuro" {
  const salvo = lerPrefGlobal("tema", "");
  if (salvo === "claro" || salvo === "escuro") return salvo;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
  } catch {
    return "claro";
  }
}

// Porta de entrada: sem login mostra a tela de entrar/criar conta
export default function App() {
  const [logado, setLogado] = useState(() => !!lerToken());
  useEffect(() => {
    const saiu = () => setLogado(false);
    window.addEventListener("iaprof:sair", saiu);
    return () => window.removeEventListener("iaprof:sair", saiu);
  }, []);
  // Botao de suporte via WhatsApp fixo em todas as telas (inclusive login)
  return (
    <>
      {logado ? <Painel /> : <Entrar onEntrou={() => setLogado(true)} />}
      <WhatsAppButton />
    </>
  );
}

function Painel() {
  const [aba, setAba] = useState<Tela>("registro");
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const carregarConta = () =>
    contaApi
      .eu()
      .then((r) => {
        setUsuario(r.usuario);
        setSituacao(r.situacao);
      })
      .catch(() => {});
  useEffect(() => {
    carregarConta();
  }, []);
  // Conexao com o D.E.V (Diario escolar): botao embaixo do nome do professor
  const [diario, setDiario] = useState<SituacaoDiario | null>(null);
  const [modalDiario, setModalDiario] = useState(false);
  // "Como usar" e tour guiado (o tour aparece sozinho na primeira entrada de cada professor)
  const [comoUsar, setComoUsar] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => {
    if (!menuAberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuAberto(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [menuAberto]);
  const [tour, setTour] = useState<null | "inicio" | "plano" | "atividade" | "aulaPronta" | "ativPronta">(null);
  // Primeira entrada: assistente "Vamos configurar" (nome, serie, estado, tamanho do texto). O tour vem depois.
  const [boasVindas, setBoasVindas] = useState(false);
  useEffect(() => {
    if (usuario && lerPref("configurado", "") !== "1" && !configCompleta()) setBoasVindas(true);
  }, [usuario]);
  // "Comece por aqui" no Gerar aula (some quando tudo estiver feito ou o professor ocultar)
  const [primeiraAula, setPrimeiraAula] = useState(() => lerPref("primeiraAula", "") === "1");
  const [ocultarPassos, setOcultarPassos] = useState(() => lerPref("ocultarPassos", "") === "1");
  useEffect(() => {
    if (!usuario || boasVindas || lerPref("tourVisto", "") === "1") return;
    const t = window.setTimeout(() => setTour((v) => v ?? "inicio"), 1200); // espera a tela carregar
    return () => window.clearTimeout(t);
  }, [usuario, boasVindas]);
  // Primeira vez na tela Plano de curso: tour proprio dela
  useEffect(() => {
    if (!usuario || aba !== "plano" || tour || lerPref("tourPlanoVisto", "") === "1") return;
    const t = window.setTimeout(() => setTour((v) => v ?? "plano"), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, aba]);
  // Primeira vez em Gerar atividade: tour de Atividades
  useEffect(() => {
    if (!usuario || aba !== "atividade" || tour || lerPref("tourAtivVisto", "") === "1") return;
    const t = window.setTimeout(() => setTour((v) => v ?? "atividade"), 900);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, aba]);
  // Guias depois da 1a aula / 1a atividade gerada (uma vez so)
  useEffect(() => {
    const PREF = { aulaPronta: "tourAulaProntaVisto", ativPronta: "tourAtivProntaVisto" } as const;
    const ouvir = (e: Event) => {
      const qual = (e as CustomEvent<keyof typeof PREF>).detail;
      if (!PREF[qual] || lerPref(PREF[qual], "") === "1") return;
      window.setTimeout(() => setTour((v) => v ?? qual), 1000); // espera o resultado aparecer na tela
    };
    window.addEventListener("iaprof:tour", ouvir);
    return () => window.removeEventListener("iaprof:tour", ouvir);
  }, []);

  const fimTour = () => {
    gravarPref(
      tour === "plano" ? "tourPlanoVisto" : tour === "atividade" ? "tourAtivVisto" : tour === "aulaPronta" ? "tourAulaProntaVisto" : tour === "ativPronta" ? "tourAtivProntaVisto" : "tourVisto",
      "1"
    );
    setTour(null);
  };
  useEffect(() => {
    diarioApi
      .status()
      .then((s) => {
        setDiario(s);
        // pedido de conexao esperando aprovacao no D.E.V: ja abre a janela com o contador e as instrucoes
        if (s && !s.conectado && s.pedido) setModalDiario(true);
      })
      .catch(() => setDiario(null));
  }, []);
  const [versao, setVersao] = useState(0);
  // Atividades: atividade aberta para editar / corrigir
  const [atividadeEditar, setAtividadeEditar] = useState<Atividade | null>(null);
  const [atividadeCorrigir, setAtividadeCorrigir] = useState<Atividade | null>(null);
  const [versaoAtiv, setVersaoAtiv] = useState(0);
  const [ativSalva, setAtivSalva] = useState<string | null>(null); // destaque na lista depois de salvar
  const [novaAtiv, setNovaAtiv] = useState(0);
  const [novaExterna, setNovaExterna] = useState(false); // abrir "Gerar" no modo atividade feita fora
  // Limite de I.A acabou (qualquer tela): card com fundo desfocado oferecendo creditos extras ou mudar de plano
  const [semLimite, setSemLimite] = useState<string | null>(null);
  const [focoCreditos, setFocoCreditos] = useState(0);
  useEffect(() => {
    const ev = (e: Event) => {
      setSemLimite((e as CustomEvent<string>).detail || "Seu limite de uso de I.A acabou.");
      carregarConta();
    };
    window.addEventListener("iaprof:semAcesso", ev);
    return () => window.removeEventListener("iaprof:semAcesso", ev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [editando, setEditando] = useState<RegistroSalvo | null>(null); // registro aberto pelo historico
  const [novoForm, setNovoForm] = useState(0); // muda para recriar o Registro de aula limpo apos salvar
  const [avisoRegistro, setAvisoRegistro] = useState<string | null>(null);
  const [tema, setTema] = useState<"claro" | "escuro">(temaInicial);
  const [versaoPlano, setVersaoPlano] = useState(0);
  // Aviso na aba "Plano de curso": falta plano de algum periodo do ano (serie e ano letivo escolhidos)
  const [faltaPlano, setFaltaPlano] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "escuro");
  }, [tema]);

  useEffect(() => {
    const ano = lerPref("ano", "");
    if (!ano) {
      setFaltaPlano(null); // serie ainda nao escolhida
      return;
    }
    const anoLetivo = Number(lerPref("anoLetivo", String(new Date().getFullYear())));
    const serie = ANOS.find((a) => a.valor === ano)?.nome ?? ano;
    let ativo = true;
    planoApi
      .obter(ano, anoLetivo)
      .then((p) => {
        if (!ativo) return;
        if (!p) return setFaltaPlano(`Nenhum plano de curso do ${serie} em ${anoLetivo}.`);
        const tipo = p.tipoPeriodo as TipoPeriodo;
        const faltam = Array.from({ length: QTD_PERIODOS[tipo] ?? 0 }, (_, i) => i + 1).filter(
          (n) => !p.periodos.find((x) => x.numero === n)?.itens.some((i) => i.codigo)
        );
        setFaltaPlano(
          faltam.length
            ? `Falta o plano do ${faltam.map((n) => `${n}º`).join(", ").replace(/, ([^,]*)$/, " e $1")} ${tipo} (${serie}, ${anoLetivo}).`
            : null
        );
      })
      .catch(() => ativo && setFaltaPlano(null));
    return () => {
      ativo = false;
    };
  }, [aba, versaoPlano]);

  // ferramenta aberta (Plano de curso aparece em Plano de aulas e em Atividades)
  const [ferramentaPref, setFerramentaPref] = useState<string | null>(null);
  // Atividade gerada e ainda nao salva: avisa antes de sair da tela (ou do sistema)
  const ativPendente = useRef(false);
  const [sairSemSalvar, setSairSemSalvar] = useState<null | (() => void)>(null);
  const protegido = (acao: () => void) => {
    if (aba === "atividade" && ativPendente.current) setSairSemSalvar(() => acao);
    else acao();
  };
  const ir = (id: Tela, ferramenta?: string) => {
    if (id !== "atividade" && aba === "atividade" && ativPendente.current) {
      setSairSemSalvar(() => () => {
        ativPendente.current = false;
        irDireto(id, ferramenta);
      });
      return;
    }
    irDireto(id, ferramenta);
  };
  const irDireto = (id: Tela, ferramenta?: string) => {
    if (id === "atividades" && aba === "atividades") setAtividadeCorrigir(null); // botao "Atividades e correção" volta para a lista
    setFerramentaPref((atual) => ferramenta ?? (ferramentaDa(id, atual)?.id === atual ? atual : ferramentaDa(id)?.id ?? atual));
    setAba(id);
    setAvisoRegistro(null);
    window.scrollTo({ top: 0 });
  };
  const alertaAssinatura = situacao?.acesso === "bloqueado" ? situacao.motivo : null;
  const abrirCreditos = () => {
    setSemLimite(null);
    ir("assinatura");
    setFocoCreditos((n) => n + 1);
  };
  const irMenu = (t: Tela, ferramenta?: string) => {
    ir(t, ferramenta);
    setMenuAberto(false);
  };
  const mudarTema = (novo: "claro" | "escuro") => {
    setTema(novo);
    gravarPrefGlobal("tema", novo);
  };
  const alertas: Partial<Record<Tela, string | null>> = { plano: faltaPlano, assinatura: alertaAssinatura };
  const ferramentaAtual = ferramentaDa(aba, ferramentaPref);
  // ultima tela usada em cada ferramenta (o botao principal volta para ela)
  const ultimaTela = useRef<Record<string, Tela>>({});
  if (ferramentaAtual) ultimaTela.current[ferramentaAtual.id] = aba;
  const abrirFerramenta = (f: (typeof FERRAMENTAS)[number]) => ir(ultimaTela.current[f.id] ?? f.itens[0].id, f.id);
  const selo = (titulo?: string | null, canto = true) =>
    titulo ? (
      <span
        title={titulo}
        className={`${canto ? "absolute -right-1 -top-1" : "ml-1"} inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white ring-2 ring-white`}
      >
        !
      </span>
    ) : null;
  const botaoTopo = (ativo: boolean) =>
    `relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium lg:px-3 ${
      ativo ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4">
          <h1 className="shrink-0">
            <Logo className="h-9 md:h-10" />
          </h1>
          {/* Computador / tablet: botoes no topo (ferramentas + itens gerais no mesmo nivel) */}
          <nav className="hidden items-center gap-1 md:flex" aria-label="Menu principal">
            {FERRAMENTAS.map((f) => {
              const alerta = f.itens.map((i) => alertas[i.id]).find(Boolean);
              return (
                <button key={f.id} data-tour={`ferramenta-${f.id}`} onClick={() => abrirFerramenta(f)} className={botaoTopo(ferramentaAtual?.id === f.id)}>
                  <span>{f.icone}</span>
                  {f.rotulo}
                  {alerta && <span title={alerta} className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white" />}
                </button>
              );
            })}
            <button data-aba="assinatura" data-tour="aba-assinatura" onClick={() => ir("assinatura")} className={botaoTopo(aba === "assinatura")}>
              <span>💳</span>
              <span className="hidden lg:inline">Minha assinatura</span>
              <span className="lg:hidden">Assinatura</span>
              {selo(alertaAssinatura)}
            </button>
          </nav>
          <span className="flex min-w-0 items-center gap-1 text-xs text-slate-500 md:gap-2">
            <span className="flex min-w-0 flex-col items-end leading-tight">
              <span className="min-w-0 max-w-[9rem] truncate sm:max-w-48 md:max-w-32" title={usuario?.email}>
                {usuario?.nome ?? ""}
              </span>
              {diario && (
                <button
                  onClick={() => setModalDiario(true)}
                  data-tour="dev"
                  title={diario.conectado ? `Conectado ao D.E.V${diario.nome ? ` como ${diario.nome}` : ""}` : "Conectar sua conta do D.E.V (Diário escolar)"}
                  className={`mt-0.5 whitespace-nowrap rounded px-1.5 py-px text-[10px] font-medium ${
                    diario.conectado ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  {diario.conectado ? "✓ Conectado ao D.E.V" : "Conectar ao D.E.V"}
                </button>
              )}
            </span>
            <button onClick={() => protegido(sair)} className="hidden shrink-0 rounded border-l border-slate-200 px-2 py-1.5 pl-3 hover:bg-slate-100 hover:text-rose-600 md:inline-block">
              Sair
            </button>
            {/* Como usar: a direita do Sair (computador) */}
            <button
              data-tour="ajuda"
              onClick={() => setComoUsar(true)}
              title="Como usar o I.A Prof"
              className="ml-2 hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 md:inline-flex"
            >
              <span>❓</span>
              <span className="hidden lg:inline">Como usar</span>
            </button>
            {usuario?.admin && (
              <button
                onClick={() => ir("admin")}
                title="Painel admin"
                aria-label="Painel admin"
                className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base md:inline-flex ${aba === "admin" ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-100"}`}
              >
                🔒
              </button>
            )}
            <button
              data-tour="config"
              onClick={() => ir("config")}
              title="Configurações"
              aria-label="Configurações"
              className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base md:inline-flex ${aba === "config" ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-slate-100"}`}
            >
              ⚙️
            </button>
            {/* Tema: botao pequeno, separado dos outros */}
            <span className="mx-1 hidden h-6 border-l border-slate-200 md:mx-2 md:block" aria-hidden />
            <button
              onClick={() => mudarTema(tema === "escuro" ? "claro" : "escuro")}
              aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
              title={tema === "escuro" ? "Tema escuro (clique para claro)" : "Tema claro (clique para escuro)"}
              className="mr-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ring-1 ring-slate-200 hover:bg-slate-100 md:mr-0"
            >
              {tema === "escuro" ? "🌙" : "☀️"}
            </button>
            <button
              onClick={() => setMenuAberto(true)}
              data-tour="menu"
              aria-label="Abrir menu"
              className="relative shrink-0 rounded-lg px-2 py-1.5 text-2xl leading-none text-slate-700 hover:bg-slate-100 md:hidden"
            >
              ☰
              {(faltaPlano || alertaAssinatura) && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />}
            </button>
          </span>
        </div>

        {/* Sub-botoes da ferramenta aberta (computador e celular) */}
        {ferramentaAtual && (
          <div className="border-t border-slate-100 bg-slate-50">
            <div className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 py-1.5 sm:px-4">
              {ferramentaAtual.itens.map((i) => (
                <button
                  key={i.id}
                  data-aba={i.id}
                  data-tour={i.tour}
                  title={alertas[i.id] ?? undefined}
                  onClick={() => ir(i.id, ferramentaAtual.id)}
                  className={`relative flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-medium sm:flex-none sm:px-3 sm:text-sm ${
                    aba === i.id ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200" : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <span className="hidden sm:inline">{i.icone}</span>
                  {i.curto ? (
                    <>
                      <span className="sm:hidden">{i.curto}</span>
                      <span className="hidden sm:inline">{i.rotulo}</span>
                    </>
                  ) : (
                    i.rotulo
                  )}
                  {i.consumo && (
                    <>
                      <SeloConsumo nivel={i.consumo} so="ponto" className="sm:hidden" />
                      <SeloConsumo nivel={i.consumo} className="hidden lg:inline-flex" />
                      <SeloConsumo nivel={i.consumo} so="ponto" className="hidden sm:inline-block lg:hidden" />
                    </>
                  )}
                  {selo(alertas[i.id])}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Celular: menu hamburguer (abre pela direita) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuAberto(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <aside
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-3 shadow-xl"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Menu"
          >
            <div className="mb-2 flex items-start justify-between gap-2 px-1">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{usuario?.nome ?? ""}</p>
                <p className="truncate text-xs text-slate-500">{usuario?.email ?? ""}</p>
              </div>
              <button onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="rounded-lg px-2 py-0.5 text-2xl leading-none text-slate-400 hover:bg-slate-100">
                ×
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1" aria-label="Menu principal">
              {FERRAMENTAS.map((f) => (
                <div key={f.id}>
                  <p className="flex items-center gap-2 px-3 pb-1 pt-2 text-sm font-semibold text-slate-800">
                    <span className="text-base">{f.icone}</span>
                    {f.rotulo}
                  </p>
                  <div className="ml-4 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                    {f.itens.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => irMenu(i.id, f.id)}
                        className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                          aba === i.id && ferramentaAtual?.id === f.id ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <span>{i.icone}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block">{i.rotulo}</span>
                          {i.consumo && <SeloConsumo nivel={i.consumo} className="mt-0.5" />}
                        </span>
                        {selo(alertas[i.id], false)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="my-2 border-t border-slate-200" />
              <button
                onClick={() => irMenu("assinatura")}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                  aba === "assinatura" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="text-base">💳</span>
                <span className="flex-1">Minha assinatura</span>
                {selo(alertaAssinatura, false)}
              </button>
              {usuario?.admin && (
                <button
                  onClick={() => irMenu("admin")}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    aba === "admin" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-base">🔒</span>
                  <span className="flex-1">Painel admin</span>
                </button>
              )}
              <button
                onClick={() => irMenu("config")}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                  aba === "config" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="text-base">⚙️</span>
                <span className="flex-1">Configurações</span>
              </button>
              <button
                onClick={() => {
                  setMenuAberto(false);
                  setComoUsar(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <span className="text-base">❓</span>
                <span className="flex-1">Como usar</span>
              </button>
              <InstalarApp variante="menu" onClique={() => setMenuAberto(false)} />
              <div className="mt-auto border-t border-slate-200 pt-2">
                <button onClick={() => protegido(sair)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50">
                  <span className="text-base">🚪</span>
                  <span className="flex-1">Sair</span>
                </button>
              </div>
            </nav>
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-5xl px-3 pb-24 pt-4 sm:px-4 md:py-6">
        {/* Uso no topo do Gerar aula: no teste grátis mostra aulas e dias; assinante vê o uso de I.A do mês */}
        {situacao && (aba === "registro" || aba === "atividade" || aba === "atividades") && (() => {
          const teste = situacao.acesso === "teste";
          const t = situacao.teste;
          // no teste: em Atividades conta as atividades; nas aulas, as aulas
          const emAtiv = aba !== "registro";
          const usados = emAtiv ? t.atividadesUsadas ?? 0 : t.aulasUsadas;
          const limiteQtd = emAtiv ? t.atividadesLimite ?? 0 : t.aulasLimite;
          const nomeQtd = emAtiv ? "atividades" : "aulas";
          const pctQtd = limiteQtd ? Math.round((usados / limiteQtd) * 100) : 0;
          // no teste vale o que acabar primeiro: a quantidade ou o limite de I.A
          const pct = Math.min(100, teste ? Math.max(pctQtd, situacao.uso.percentual) : situacao.uso.percentual);
          const cor = pct >= 90 ? "rose" : pct >= 70 ? "amber" : "emerald";
          const corTexto = { rose: "text-rose-600", amber: "text-amber-700", emerald: "text-emerald-700" }[cor];
          const corBarra = { rose: "bg-rose-500", amber: "bg-amber-500", emerald: "bg-emerald-500" }[cor];
          const saldo = situacao.creditos?.saldoCentavos ?? 0;
          const podeComprar = !!situacao.creditos?.podeComprar;
          return (
            <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2" data-tour="uso">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-slate-600">{teste ? "🎁 Teste grátis" : "⚡ Uso de I.A neste mês"}</span>
                <span className={`font-semibold ${corTexto}`}>
                  {teste ? `${usados} de ${limiteQtd} ${nomeQtd}` : `${situacao.uso.percentual}% usado`}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={teste ? `${nomeQtd} usadas no teste grátis` : "Uso de I.A neste mês"}>
                <div className={`h-full rounded-full transition-all ${corBarra}`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                {teste
                  ? `${t.diasRestantes} dia(s) restante(s) · ${Math.max(0, limiteQtd - usados)} ${emAtiv ? "atividade(s)" : "aula(s)"} restante(s).${emAtiv ? " No teste, a correção com foto é dos planos Profissional e Premium; à mão é liberada." : " Vale o que acabar primeiro."}`
                  : situacao.uso.renovaEm
                    ? `Renova em ${situacao.uso.renovaEm.split("-").reverse().slice(0, 2).join("/")}.`
                    : ""}
                {saldo > 0 && !teste && <> · ⚡ Créditos extras: {reais(saldo)}</>}
                {(teste || pct >= 90) && (
                  <>
                    {" "}
                    <button onClick={() => ir("assinatura")} className="font-medium text-indigo-600 hover:underline">
                      {teste ? "Assinar" : "Ver planos"}
                    </button>
                  </>
                )}
                {!teste && podeComprar && pct >= 80 && (
                  <>
                    {" · "}
                    <button onClick={abrirCreditos} className="font-semibold text-emerald-700 hover:underline">
                      + Comprar créditos
                    </button>
                  </>
                )}
              </p>
            </div>
          );
        })()}
        {/* Teste gratis / limite do plano */}
        {situacao && aba !== "assinatura" && (situacao.acesso === "bloqueado" || ((situacao.acesso === "teste" || situacao.uso.percentual >= 80) && aba !== "registro" && aba !== "atividade" && aba !== "atividades")) && (
          <div
            className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-sm ${
              situacao.acesso === "bloqueado" ? "bg-rose-50 text-rose-700" : "bg-indigo-50 text-indigo-800"
            }`}
          >
            <span>
              {situacao.acesso === "bloqueado"
                ? situacao.motivo
                : situacao.acesso === "teste"
                  ? `Teste grátis: ${situacao.teste.diasRestantes} dia(s), ${Math.max(0, situacao.teste.aulasLimite - situacao.teste.aulasUsadas)} aula(s) e ${Math.max(0, (situacao.teste.atividadesLimite ?? 0) - (situacao.teste.atividadesUsadas ?? 0))} atividade(s) restantes.`
                  : `Você já usou ${situacao.uso.percentual}% do limite de I.A do seu plano neste mês.`}
            </span>
            <button onClick={() => ir("assinatura")} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
              {situacao.acesso === "assinante" ? "Ver planos" : "Assinar"}
            </button>
          </div>
        )}
        {aba === "registro" && !editando && !ocultarPassos && (() => {
          const passos = [
            { feito: configCompleta(), titulo: "Configure seus dados", acao: "Configurar", ir: () => ir("config") },
            // plano de curso continua obrigatorio: sem ele a I.A Prof usa a base (oficial do estado/BNCC) so provisoriamente
            { feito: configCompleta() && (faltaPlano == null || !faltaPlano.startsWith("Nenhum")), titulo: "Envie o plano de curso", acao: "Enviar plano", ir: () => ir("plano", "aulas") },
            { feito: !!diario?.conectado, titulo: "Conecte ao D.E.V (opcional)", acao: "Conectar", ir: () => setModalDiario(true), opcional: true, dev: true },
            { feito: primeiraAula, titulo: "Gere e salve sua primeira aula", acao: "", ir: () => document.getElementById("texto-aula")?.focus() },
          ];
          const obrigatorios = passos.filter((p) => !p.opcional);
          if (obrigatorios.every((p) => p.feito)) return null;
          const feitos = obrigatorios.filter((p) => p.feito).length;
          return (
            <div className="mb-4 rounded-2xl border border-indigo-100 bg-white p-3 sm:p-4" data-tour="primeiros-passos">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  🚀 Comece por aqui <span className="font-normal text-slate-500">· {feitos} de {obrigatorios.length}</span>
                </p>
                <button
                  onClick={() => {
                    gravarPref("ocultarPassos", "1");
                    setOcultarPassos(true);
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Ocultar
                </button>
              </div>
              <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {passos
                  .filter((p) => !(p.dev && diario?.disponivel === false))
                  .map((p, i) => (
                    <li key={p.titulo} className={`items-center gap-2 rounded-xl px-3 py-2 text-sm ${p.feito ? "hidden bg-emerald-50 text-emerald-800 sm:flex" : "flex bg-slate-50 text-slate-700"}`}>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${p.feito ? "bg-emerald-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-300"}`}
                      >
                        {p.feito ? "✓" : i + 1}
                      </span>
                      <span className={`min-w-0 flex-1 ${p.feito ? "line-through decoration-emerald-400/60" : ""}`}>{p.titulo}</span>
                      {!p.feito && p.acao && (
                        <button onClick={p.ir} className="shrink-0 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                          {p.acao}
                        </button>
                      )}
                    </li>
                  ))}
              </ol>
            </div>
          );
        })()}
        {aba === "registro" && (
          <RegistroAula
            key={editando?._id ?? `novo-${novoForm}`}
            registroEditar={editando}
            avisoInicial={editando ? null : avisoRegistro}
            onContexto={(ano, anoLetivo) => {
              // Mesma serie/ano letivo na aba Plano de curso e no alerta dela
              if (ano && lerPref("ano", "") !== ano) gravarPref("ano", ano);
              if (lerPref("anoLetivo", "") !== String(anoLetivo)) gravarPref("anoLetivo", String(anoLetivo));
              setVersaoPlano((v) => v + 1);
            }}
            onSalvo={() => {
              setVersao((v) => v + 1);
              if (!primeiraAula) {
                gravarPref("primeiraAula", "1");
                setPrimeiraAula(true);
              }
            }}
            onAbrirConfig={() => ir("config")}
            onUsouIA={carregarConta}
            professorNome={usuario?.nome}
            diario={diario}
            onDiario={setDiario}
            onAbrirDiario={() => setModalDiario(true)}
            onSemAcesso={() => {
              carregarConta();
              setSemLimite(situacao?.motivo ?? "Seu limite de uso de I.A acabou.");
            }}
            onFecharEdicao={(aviso) => {
              setEditando(null);
              setAvisoRegistro(aviso ?? null);
              setNovoForm((n) => n + 1);
            }}
          />
        )}
        {aba === "plano" && (
          <>
            {faltaPlano && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                ⚠️ {faltaPlano} Cadastre o plano de cada período para registrar aulas o ano todo.
              </div>
            )}
            <PlanoCurso onMudou={() => setVersaoPlano((v) => v + 1)} />
          </>
        )}
        {aba === "assinatura" && <Assinatura situacao={situacao} onSituacao={setSituacao} focoCreditos={focoCreditos > 0} key={`ass-${focoCreditos}`} />}
        {aba === "atividade" && (
          <GerarAtividade
            key={atividadeEditar?._id ?? `nova-${novaAtiv}`}
            editar={atividadeEditar}
            onPendente={(v) => (ativPendente.current = v)}
            externa={novaExterna}
            fotoLiberada={situacao?.planoId === "profissional" || situacao?.planoId === "premium"}
            diario={diario}
            professorNome={usuario?.nome}
            onSalva={() => setVersaoAtiv((v) => v + 1)}
            onCorrigir={(a) => {
              setAtividadeEditar(null);
              setAtividadeCorrigir(a);
              ir("atividades");
            }}
            onUsouIA={carregarConta}
            onIrTurmas={() => ir("turmas")}
            onIrPlano={() => ir("plano", "atividades")}
            onFecharEdicao={() => {
              setAtividadeEditar(null);
              setNovaAtiv((n) => n + 1);
            }}
            onIrLista={(a) => {
              setAtividadeEditar(null);
              setAtividadeCorrigir(null);
              setNovaAtiv((n) => n + 1);
              setAtivSalva(a._id ?? null);
              setNovaExterna(false);
              ir("atividades");
            }}
          />
        )}
        {aba === "atividades" &&
          (atividadeCorrigir ? (
            <CorrigirAtividade
              key={atividadeCorrigir._id}
              atividade={atividadeCorrigir}
              diario={diario}
              fotoLiberada={situacao?.planoId === "profissional" || situacao?.planoId === "premium"}
              onAssinar={() => ir("assinatura")}
              onVoltar={() => {
                setAtividadeCorrigir(null);
                setVersaoAtiv((v) => v + 1);
              }}
              onEditar={(a) => {
                setAtividadeEditar(a);
                setAtividadeCorrigir(null);
                ir("atividade");
              }}
              onUsouIA={carregarConta}
              onAbrirDiario={() => setModalDiario(true)}
            />
          ) : (
            <AtividadesSalvas
              atualizar={versaoAtiv}
              destaque={ativSalva}
              onDestaqueVisto={() => setAtivSalva(null)}
              teste={!situacao?.planoId}
              onAssinar={() => ir("assinatura")}
              professorNome={diario?.conectado && diario.nome ? diario.nome : usuario?.nome}
              onCorrigir={setAtividadeCorrigir}
              onEditar={(a) => {
                setAtividadeEditar(a);
                ir("atividade");
              }}
              onNova={() => {
                setAtividadeEditar(null);
                setNovaExterna(false);
                setNovaAtiv((n) => n + 1);
                ir("atividade");
              }}
              onExterna={() => {
                setAtividadeEditar(null);
                setNovaExterna(true);
                setNovaAtiv((n) => n + 1);
                ir("atividade");
              }}
            />
          ))}
        {aba === "turmas" && <Turmas diario={diario} onAbrirDiario={() => setModalDiario(true)} />}
        {aba === "admin" && usuario?.admin && <Admin />}
        {aba === "config" && (
          <Configuracoes
            professorNome={usuario?.nome}
            diario={diario}
            tema={tema}
            onTema={mudarTema}
            onAbrirDiario={() => setModalDiario(true)}
            onIrPlano={() => ir("plano", "aulas")}
            onRever={() => {
              ir("registro", "aulas");
              window.setTimeout(() => setTour("inicio"), 600);
            }}
            onSalvo={() => {
              setNovoForm((n) => n + 1);
              setVersaoPlano((v) => v + 1);
            }}
          />
        )}
        {aba === "historico" && (
          <Historico
            atualizar={versao}
            onNova={() => ir("registro", "aulas")}
            onAbrir={(r) => {
              setAvisoRegistro(null);
              setEditando(r);
              setAba("registro");
            }}
          />
        )}
      </main>
      {boasVindas && (
        <BoasVindas
          professorNome={usuario?.nome}
          diario={diario}
          onAbrirDiario={() => setModalDiario(true)}
          onIrPlano={() => ir("plano", "aulas")}
          onFim={() => {
            setBoasVindas(false);
            setNovoForm((n) => n + 1);
            setVersaoPlano((v) => v + 1);
          }}
        />
      )}
      {sairSemSalvar && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => setSairSemSalvar(null)} role="dialog" aria-modal="true" aria-labelledby="titulo-sair-sem-salvar">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">⚠️</div>
            <p id="titulo-sair-sem-salvar" className="text-lg font-bold text-slate-800">
              A atividade ainda não foi salva
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Você ainda não aprovou o gabarito nem salvou esta atividade. Se sair agora, ela pode ser perdida e você vai precisar gerar de novo (e gastar I.A).
            </p>
            <div className="mt-4 grid gap-2">
              <button onClick={() => setSairSemSalvar(null)} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                Voltar e aprovar / salvar
              </button>
              <button
                onClick={() => {
                  const acao = sairSemSalvar;
                  setSairSemSalvar(null);
                  ativPendente.current = false;
                  acao?.();
                }}
                className="rounded-lg px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
              >
                Sair sem salvar
              </button>
            </div>
          </div>
        </div>
      )}
      {semLimite && (
        <ModalSemLimite
          motivo={semLimite}
          situacao={situacao}
          onComprar={abrirCreditos}
          onPlanos={() => {
            setSemLimite(null);
            ir("assinatura");
          }}
          onFechar={() => setSemLimite(null)}
        />
      )}
      {modalDiario && diario && <ModalConectarDiario situacao={diario} onFechar={() => setModalDiario(false)} onMudou={setDiario} />}
      {comoUsar && (
        <ComoUsar
          onFechar={() => setComoUsar(false)}
          onRever={(qual) => {
            setComoUsar(false);
            ir(qual === "plano" ? "plano" : qual === "atividade" ? "atividade" : "registro", qual === "atividade" ? "atividades" : qual === "plano" ? "aulas" : undefined);
            window.setTimeout(() => setTour(qual), 600);
          }}
        />
      )}
      {tour && (
        <Tour
          key={tour}
          passos={
            tour === "plano"
              ? PASSOS_PLANO
              : tour === "atividade"
                ? PASSOS_ATIVIDADE
                : tour === "aulaPronta"
                  ? PASSOS_AULA_PRONTA
                  : tour === "ativPronta"
                    ? PASSOS_ATIV_PRONTA
                    : PASSOS_INICIO
          }
          onFim={fimTour}
        />
      )}
    </div>
  );
}

// Card com fundo desfocado quando a I.A e barrada: comprar creditos extras ou mudar de plano
function ModalSemLimite({
  motivo,
  situacao,
  onComprar,
  onPlanos,
  onFechar,
}: {
  motivo: string;
  situacao: Situacao | null;
  onComprar: () => void;
  onPlanos: () => void;
  onFechar: () => void;
}) {
  const assinante = !!situacao?.planoId;
  const podeComprar = !!situacao?.creditos?.podeComprar;
  const premium = situacao?.planoId === "premium";
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onFechar} role="dialog" aria-modal="true" aria-labelledby="titulo-sem-limite">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">⚡</div>
        <p id="titulo-sem-limite" className="text-lg font-bold text-slate-800">
          {assinante ? "Seu limite de uso de I.A acabou" : "Acesso à I.A bloqueado"}
        </p>
        <p className="mt-1 text-sm text-slate-600">{motivo}</p>
        {assinante && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Uma correção de turma que você já começou pode ser terminada. A correção à mão, salvar e lançar notas continuam liberados.
          </p>
        )}
        <div className="mt-4 grid gap-2">
          {assinante ? (
            <>
              {podeComprar && <button onClick={onComprar} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                ⚡ Comprar créditos de uso
              </button>}
              {!premium && (
                <button onClick={onPlanos} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
                  ⬆️ Fazer upgrade do plano
                </button>
              )}
            </>
          ) : (
            <button onClick={onPlanos} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              Assinar um plano
            </button>
          )}
          <button onClick={onFechar} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}
