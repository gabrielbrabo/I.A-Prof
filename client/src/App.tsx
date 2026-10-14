import { useEffect, useState } from "react";
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
import InstalarApp from "./components/InstalarApp";
import Logo from "./components/Logo";
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
  const abas: { id: typeof aba; rotulo: string; curto: string; icone: string; alerta?: string | null }[] = [
    { id: "registro", rotulo: "Gerar aula", curto: "Gerar aula", icone: "✨" },
    { id: "plano", rotulo: "Plano de curso", curto: "Plano", icone: "📘", alerta: faltaPlano },
    { id: "historico", rotulo: "Aulas salvas", curto: "Salvas", icone: "🗂️" },
    { id: "assinatura", rotulo: "Minha assinatura", curto: "Assinatura", icone: "💳", alerta: alertaAssinatura },
  ];
  const selo = (
    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white ring-2 ring-white">
      !
    </span>
  );
  const trocarTema = () => {
    const novo = tema === "escuro" ? "claro" : "escuro";
    setTema(novo);
    gravarPrefGlobal("tema", novo);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white md:static">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-4 md:py-3">
          <h1 className="shrink-0">
            <Logo className="h-9 md:h-10" />
          </h1>
          {/* Computador / tablet: abas no topo */}
          <nav className="hidden gap-1 md:flex">
            {abas.map((a) => (
              <button
                key={a.id}
                data-aba={a.id}
                title={a.alerta ?? undefined}
                onClick={() => ir(a.id)}
                className={`relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium lg:px-4 ${aba === a.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {a.rotulo}
                {a.alerta && selo}
              </button>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-1">
            <InstalarApp variante="topo" />
            <button
              onClick={trocarTema}
              title={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
              aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
              className="shrink-0 rounded-lg px-2.5 py-2 text-sm text-slate-600 hover:bg-slate-100 md:px-3"
            >
              {tema === "escuro" ? "☀️" : "🌙"}
              <span className="hidden lg:inline"> {tema === "escuro" ? "Claro" : "Escuro"}</span>
            </button>
            <span className="flex min-w-0 items-center gap-1 border-l border-slate-200 pl-2 text-xs text-slate-500 md:gap-2 md:pl-3">
              <span className="flex min-w-0 flex-col items-end leading-tight">
                <span className="min-w-0 max-w-[7.5rem] truncate sm:max-w-40 md:hidden lg:inline lg:max-w-32" title={usuario?.email}>
                  {usuario?.nome ?? ""}
                </span>
                {diario && (
                  <button
                    onClick={() => setModalDiario(true)}
                    title={diario.conectado ? `Conectado ao D.E.V${diario.nome ? ` como ${diario.nome}` : ""}` : "Conectar sua conta do D.E.V (Diário escolar)"}
                    className={`mt-0.5 whitespace-nowrap rounded px-1.5 py-px text-[10px] font-medium ${
                      diario.conectado ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                    }`}
                  >
                    {diario.conectado ? "✓ Conectado ao D.E.V" : "Conectar ao D.E.V"}
                  </button>
                )}
              </span>
              <button onClick={sair} className="shrink-0 rounded px-2 py-1.5 hover:bg-slate-100 hover:text-rose-600">
                Sair
              </button>
            </span>
          </div>
        </div>
      </header>

      {/* Celular: barra de abas fixa embaixo (facil de alcancar com o polegar) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {abas.map((a) => (
          <button
            key={a.id}
            data-aba={a.id}
            title={a.alerta ?? undefined}
            onClick={() => ir(a.id)}
            className={`flex min-w-0 flex-col items-center gap-0.5 px-1 pb-2 pt-1.5 text-[11px] font-medium leading-tight ${
              aba === a.id ? "text-indigo-700" : "text-slate-500"
            }`}
          >
            <span className={`relative rounded-full px-3 py-0.5 text-base ${aba === a.id ? "bg-indigo-50" : ""}`}>
              {a.icone}
              {a.alerta && selo}
            </span>
            <span className="w-full truncate text-center">{a.curto}</span>
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-5xl px-3 pb-24 pt-4 sm:px-4 md:py-6">
        {/* Teste gratis / limite do plano */}
        {situacao && aba !== "assinatura" && (situacao.acesso === "bloqueado" || situacao.acesso === "teste" || situacao.uso.percentual >= 80) && (
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
    </div>
  );
}
