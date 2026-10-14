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
import Tour, { PASSOS_INICIO } from "./components/Tour";
import ComoUsar from "./components/ComoUsar";
import { FERRAMENTAS, ferramentaDa, Tela } from "./components/Menu";
import InstalarApp from "./components/InstalarApp";
import { diarioApi, SituacaoDiario } from "./api/diario";
import { ModalConectarDiario } from "./components/Diario";

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
  if (!logado) return <Entrar onEntrou={() => setLogado(true)} />;
  return <Painel />;
}

function Painel() {
  const [aba, setAba] = useState<"registro" | "plano" | "historico" | "assinatura">("registro");
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
  const [tour, setTour] = useState(false);
  useEffect(() => {
    if (!usuario || lerPref("tourVisto", "") === "1") return;
    const t = window.setTimeout(() => setTour(true), 1200); // espera a tela carregar
    return () => window.clearTimeout(t);
  }, [usuario]);
  const fimTour = () => {
    setTour(false);
    gravarPref("tourVisto", "1");
  };
  useEffect(() => {
    diarioApi.status().then(setDiario).catch(() => setDiario(null));
  }, []);
  const [versao, setVersao] = useState(0);
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

  const ir = (id: typeof aba) => {
    setAba(id);
    setAvisoRegistro(null);
    window.scrollTo({ top: 0 });
  };
  const alertaAssinatura = situacao?.acesso === "bloqueado" ? situacao.motivo : null;
  const mudarTema = (novo: "claro" | "escuro") => {
    setTema(novo);
    gravarPrefGlobal("tema", novo);
  };
  const alertas: Partial<Record<Tela, string | null>> = { plano: faltaPlano, assinatura: alertaAssinatura };
  const ferramentaAtual = ferramentaDa(aba);
  // ultima tela usada em cada ferramenta (o botao principal volta para ela)
  const ultimaTela = useRef<Record<string, Tela>>({});
  if (ferramentaAtual) ultimaTela.current[ferramentaAtual.id] = aba;
  const abrirFerramenta = (f: (typeof FERRAMENTAS)[number]) => ir(ultimaTela.current[f.id] ?? f.itens[0].id);
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
                  {selo(alerta)}
                </button>
              );
            })}
            <button data-aba="assinatura" data-tour="aba-assinatura" onClick={() => ir("assinatura")} className={botaoTopo(aba === "assinatura")}>
              <span>💳</span>
              <span className="hidden lg:inline">Minha assinatura</span>
              <span className="lg:hidden">Assinatura</span>
              {selo(alertaAssinatura)}
            </button>
            <button data-tour="ajuda" onClick={() => setComoUsar(true)} className={botaoTopo(false)} title="Como usar o I.A Prof">
              <span>❓</span>
              <span className="hidden lg:inline">Como usar</span>
            </button>
            <InstalarApp variante="topo" />
            <select
              value={tema}
              onChange={(e) => mudarTema(e.target.value as "claro" | "escuro")}
              aria-label="Tema"
              title="Tema"
              className="ml-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-600 focus:border-indigo-500 focus:outline-none"
            >
              <option value="claro">☀️ Claro</option>
              <option value="escuro">🌙 Escuro</option>
            </select>
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
            <button onClick={sair} className="shrink-0 rounded border-l border-slate-200 px-2 py-1.5 pl-3 hover:bg-slate-100 hover:text-rose-600">
              Sair
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
                  onClick={() => ir(i.id)}
                  className={`relative flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-medium sm:flex-none sm:px-3 sm:text-sm ${
                    aba === i.id ? "bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200" : "text-slate-600 hover:bg-white"
                  }`}
                >
                  <span className="hidden sm:inline">{i.icone}</span>
                  {i.rotulo}
                  {selo(alertas[i.id])}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Celular: barra de botoes fixa embaixo (ferramentas + itens gerais) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Menu principal"
      >
        {[
          ...FERRAMENTAS.map((f) => ({
            chave: f.id,
            icone: f.icone,
            rotulo: f.curto,
            ativo: ferramentaAtual?.id === f.id,
            alerta: f.itens.map((i) => alertas[i.id]).find(Boolean),
            tour: `ferramenta-${f.id}`,
            acao: () => abrirFerramenta(f),
          })),
          { chave: "assinatura", icone: "💳", rotulo: "Assinatura", ativo: aba === "assinatura", alerta: alertaAssinatura, tour: "aba-assinatura", acao: () => ir("assinatura") },
          { chave: "ajuda", icone: "❓", rotulo: "Como usar", ativo: false, alerta: null, tour: "ajuda", acao: () => setComoUsar(true) },
          {
            chave: "tema",
            icone: tema === "escuro" ? "☀️" : "🌙",
            rotulo: tema === "escuro" ? "Claro" : "Escuro",
            ativo: false,
            alerta: null,
            tour: "tema",
            acao: () => mudarTema(tema === "escuro" ? "claro" : "escuro"),
          },
        ].map((b) => (
          <button
            key={b.chave}
            data-tour={b.tour}
            onClick={b.acao}
            className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-1 pb-2 pt-1.5 text-[11px] font-medium leading-tight ${b.ativo ? "text-indigo-700" : "text-slate-500"}`}
          >
            <span className={`relative rounded-full px-3 py-0.5 text-base ${b.ativo ? "bg-indigo-50" : ""}`}>
              {b.icone}
              {selo(b.alerta)}
            </span>
            <span className="w-full truncate text-center">{b.rotulo}</span>
          </button>
        ))}
        <InstalarApp variante="barra" />
      </nav>

      <main className="mx-auto max-w-5xl px-3 pb-24 pt-4 sm:px-4 md:py-6">
        {/* Uso de I.A no mes (barra no topo do Gerar aula) */}
        {situacao && aba === "registro" && (
          <div className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2" data-tour="uso">
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-600">⚡ Uso de I.A neste mês</span>
              <span
                className={`font-semibold ${
                  situacao.uso.percentual >= 90 ? "text-rose-600" : situacao.uso.percentual >= 70 ? "text-amber-700" : "text-emerald-700"
                }`}
              >
                {situacao.uso.percentual}% usado
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={situacao.uso.percentual}
              aria-label="Uso de I.A neste mês"
            >
              <div
                className={`h-full rounded-full transition-all ${
                  situacao.uso.percentual >= 90 ? "bg-rose-500" : situacao.uso.percentual >= 70 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.max(situacao.uso.percentual, situacao.uso.percentual > 0 ? 2 : 0)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {situacao.acesso === "teste" ? "Limite do teste grátis." : "Renova todo dia 1º."}
              {situacao.uso.percentual >= 90 && (
                <>
                  {" "}
                  <button onClick={() => ir("assinatura")} className="font-medium text-indigo-600 hover:underline">
                    Ver planos
                  </button>
                </>
              )}
            </p>
          </div>
        )}
        {/* Teste gratis / limite do plano */}
        {situacao && aba !== "assinatura" && (situacao.acesso === "bloqueado" || situacao.acesso === "teste" || (situacao.uso.percentual >= 80 && aba !== "registro")) && (
          <div
            className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-sm ${
              situacao.acesso === "bloqueado" ? "bg-rose-50 text-rose-700" : "bg-indigo-50 text-indigo-800"
            }`}
          >
            <span>
              {situacao.acesso === "bloqueado"
                ? situacao.motivo
                : situacao.acesso === "teste"
                  ? `Teste grátis: ${situacao.teste.diasRestantes} dia(s) e ${Math.max(0, situacao.teste.aulasLimite - situacao.teste.aulasUsadas)} aula(s) restantes.`
                  : `Você já usou ${situacao.uso.percentual}% do limite de I.A do seu plano neste mês.`}
            </span>
            <button onClick={() => ir("assinatura")} className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
              {situacao.acesso === "assinante" ? "Ver planos" : "Assinar"}
            </button>
          </div>
        )}
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
            onSalvo={() => setVersao((v) => v + 1)}
            onUsouIA={carregarConta}
            professorNome={usuario?.nome}
            diario={diario}
            onDiario={setDiario}
            onAbrirDiario={() => setModalDiario(true)}
            onSemAcesso={() => {
              carregarConta();
              setAba("assinatura");
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
        {aba === "assinatura" && <Assinatura situacao={situacao} onSituacao={setSituacao} />}
        {aba === "historico" && (
          <Historico
            atualizar={versao}
            onAbrir={(r) => {
              setAvisoRegistro(null);
              setEditando(r);
              setAba("registro");
            }}
          />
        )}
      </main>
      {modalDiario && diario && <ModalConectarDiario situacao={diario} onFechar={() => setModalDiario(false)} onMudou={setDiario} />}
      {comoUsar && (
        <ComoUsar
          onFechar={() => setComoUsar(false)}
          onRever={() => {
            setComoUsar(false);
            ir("registro");
            window.setTimeout(() => setTour(true), 500);
          }}
        />
      )}
      {tour && <Tour passos={PASSOS_INICIO} onFim={fimTour} />}
    </div>
  );
}
