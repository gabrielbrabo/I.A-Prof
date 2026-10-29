import { useState } from "react";
import { SituacaoDiario } from "../api/diario";
import { ANOS, UFS } from "../lib/formatarRegistro";
import { gravarPref, lerPref } from "../lib/prefs";
import { divisaoAtual, divisaoDaUf, Divisao } from "../lib/divisao";
import { gravarMostrarObjeto, lerMostrarObjeto } from "../lib/objetos";

// Configuracoes do professor (ficam salvas neste aparelho, por conta):
// nome no diario, serie principal, estado (UF) e tamanho do texto do diario.
// Usadas como padrao em Gerar aula, Plano de curso e Atividades.

export const LIMITE_PADRAO = 2000;
export const ATALHOS_LIMITE = [1000, 2000, 3000, 4000];
const campo =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

export interface DadosConfig {
  professor: string;
  ano: string;
  uf: string;
  divisao: Divisao;
  mostrarObjeto: boolean;
  limiteSaida: string;
}
export const lerConfig = (nomePadrao = ""): DadosConfig => ({
  professor: lerPref("professor", "\u0000") === "\u0000" ? nomePadrao : lerPref("professor", ""),
  ano: lerPref("ano", ""),
  uf: lerPref("uf", ""),
  divisao: divisaoAtual(),
  mostrarObjeto: lerMostrarObjeto(),
  limiteSaida: lerPref("limiteSaida", "") || String(LIMITE_PADRAO),
});
export const configCompleta = () => !!lerPref("ano", "") && !!lerPref("uf", "");
function gravarConfig(c: DadosConfig) {
  gravarPref("professor", c.professor.trim());
  if (c.ano) gravarPref("ano", c.ano);
  if (c.uf) gravarPref("uf", c.uf);
  gravarPref("divisao", c.divisao);
  gravarMostrarObjeto(c.mostrarObjeto);
  gravarPref("limiteSaida", c.limiteSaida);
}

// Campos (usados na tela de Configuracoes e no assistente de boas-vindas)
function CamposConfig({
  valor,
  onChange,
  nomeDev,
  parte = "tudo",
}: {
  valor: DadosConfig;
  onChange: (c: DadosConfig) => void;
  nomeDev: string | null;
  parte?: "tudo" | "dados" | "texto";
}) {
  const set = (x: Partial<DadosConfig>) => onChange({ ...valor, ...x });
  return (
    <div className="space-y-4">
      {parte !== "texto" && (
        <>
          <label className="block text-sm font-medium text-slate-700">
            Seu nome no diário
            <input
              className={`${campo} ${nomeDev ? "cursor-not-allowed bg-slate-50 text-slate-500" : ""}`}
              value={nomeDev ?? valor.professor}
              readOnly={!!nomeDev}
              placeholder="ex.: Maria da Silva"
              onChange={(e) => set({ professor: e.target.value })}
            />
            {nomeDev && <span className="mt-1 block text-xs font-normal text-emerald-700">Conectado ao D.E.V: usamos o nome do seu cadastro no D.E.V.</span>}
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Série que você mais usa
              <select className={campo} value={valor.ano} onChange={(e) => set({ ano: e.target.value })}>
                <option value="">Escolha a série…</option>
                {ANOS.map((a) => (
                  <option key={a.valor} value={a.valor}>
                    {a.nome}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">Dá para trocar a qualquer momento na hora de gerar.</span>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Seu estado
              <select className={campo} value={valor.uf} onChange={(e) => set({ uf: e.target.value, divisao: divisaoDaUf(e.target.value) })}>
                <option value="">Escolha o estado…</option>
                <option value="BNCC">Só BNCC (nacional)</option>
                {UFS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">Para reconhecer os códigos do currículo do seu estado.</span>
            </label>
            <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
              Divisão do ano letivo
              <select className={campo} value={valor.divisao} onChange={(e) => set({ divisao: e.target.value as Divisao })}>
                <option value="bimestre">Bimestres (4)</option>
                <option value="trimestre">Trimestres (3)</option>
                <option value="semestre">Semestres (2)</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Preenchida pelo seu estado (rede estadual). Se a sua escola usa outra divisão (ex.: escola municipal), troque aqui. Quando você cadastrar o seu
                plano de curso, vale a divisão dele.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-emerald-600"
                checked={valor.mostrarObjeto}
                onChange={(e) => set({ mostrarObjeto: e.target.checked })}
              />
              <span className="text-sm font-medium text-slate-700">
                Mostrar o objeto de conhecimento
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  Aparece junto de cada habilidade nos cards de Gerar aula e na escolha das habilidades em Atividades (vem do seu plano de curso ou da BNCC).
                </span>
              </span>
            </label>
          </div>
        </>
      )}
      {parte !== "dados" && (
        <div>
          <p className="text-sm font-medium text-slate-700">Tamanho máximo do texto no diário</p>
          <p className="text-xs text-slate-500">Quantos caracteres cabem no campo de registro de aula do seu diário. O texto gerado é ajustado para caber.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ATALHOS_LIMITE.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => set({ limiteSaida: String(n) })}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                  Number(valor.limiteSaida) === n ? "bg-indigo-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
                }`}
              >
                {n}
              </button>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              outro:
              <input
                type="number"
                min={0}
                step={100}
                value={valor.limiteSaida}
                onChange={(e) => set({ limiteSaida: e.target.value })}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                aria-label="Tamanho máximo em caracteres"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

// Tela "Configuracoes"
export default function Configuracoes({
  professorNome,
  diario,
  tema,
  onTema,
  onAbrirDiario,
  onRever,
  onIrPlano,
  onSalvo,
}: {
  professorNome?: string;
  diario: SituacaoDiario | null;
  tema: "claro" | "escuro";
  onTema: (t: "claro" | "escuro") => void;
  onAbrirDiario: () => void;
  onRever: () => void;
  onIrPlano: () => void;
  onSalvo: () => void;
}) {
  const [c, setC] = useState(() => lerConfig(professorNome));
  const [ok, setOk] = useState(false);
  const nomeDev = diario?.conectado && diario.nome ? diario.nome : null;

  function salvar() {
    gravarConfig(c);
    setOk(true);
    onSalvo();
    setTimeout(() => setOk(false), 2500);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">⚙️ Configurações</h2>
        <p className="text-sm text-slate-500">Preencha uma vez. O I.A Prof usa estas informações em todas as telas.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Seus dados</h3>
        <CamposConfig valor={c} onChange={setC} nomeDev={nomeDev} />
        <div className="mt-5 flex items-center justify-end gap-3">
          {ok && <span className="text-sm font-medium text-emerald-700">✓ Salvo</span>}
          <button onClick={salvar} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
            Salvar configurações
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Diário D.E.V</h3>
        {diario?.conectado ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              ✓ Conectado como <b>{diario.nome}</b>. Turmas, alunos e notas vêm do D.E.V.
            </p>
            <button onClick={onAbrirDiario} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
              Gerenciar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Se sua escola usa o D.E.V, conecte para enviar aulas e notas direto para o diário. É opcional.</p>
            <button onClick={onAbrirDiario} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
              Conectar ao D.E.V
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Plano de curso</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">As habilidades das aulas e atividades vêm do plano de curso de cada série.</p>
          <button onClick={onIrPlano} className="rounded-xl px-4 py-2 text-sm font-medium text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50">
            Abrir plano de curso
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Aparência e ajuda</h3>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
            {(["claro", "escuro"] as const).map((t) => (
              <button
                key={t}
                onClick={() => onTema(t)}
                className={`rounded-lg px-3 py-1.5 ${tema === t ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-500"}`}
              >
                {t === "claro" ? "☀️ Claro" : "🌙 Escuro"}
              </button>
            ))}
          </div>
          <button onClick={onRever} className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50">
            Ver o tour de novo
          </button>
        </div>
      </section>
    </div>
  );
}

// Assistente de boas-vindas (primeira entrada): configura o basico em 3 passos
export function BoasVindas({
  professorNome,
  diario,
  onAbrirDiario,
  onIrPlano,
  onFim,
}: {
  professorNome?: string;
  diario: SituacaoDiario | null;
  onAbrirDiario: () => void;
  onIrPlano: () => void;
  onFim: () => void;
}) {
  const [passo, setPasso] = useState(0);
  const [c, setC] = useState(() => lerConfig(professorNome));
  const nomeDev = diario?.conectado && diario.nome ? diario.nome : null;
  const podeAvancar = passo !== 0 || (!!c.ano && !!c.uf);
  const titulos = ["Vamos configurar o I.A Prof", "Tamanho do texto do diário", "Tudo pronto!"];

  function avancar() {
    if (passo < 2) {
      gravarConfig(c);
      setPasso(passo + 1);
    }
  }
  function terminar(depois?: () => void) {
    gravarConfig(c);
    gravarPref("configurado", "1");
    onFim();
    depois?.();
  }

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-boas-vindas">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= passo ? "bg-indigo-600" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-semibold text-indigo-600">Passo {passo + 1} de 3</p>
        <h2 id="titulo-boas-vindas" className="mb-1 text-xl font-bold text-slate-800">
          {titulos[passo]}
        </h2>

        {passo === 0 && (
          <>
            <p className="mb-4 text-sm text-slate-500">Leva menos de 1 minuto. Você pode mudar depois em ⚙️ Configurações.</p>
            <CamposConfig valor={c} onChange={setC} nomeDev={nomeDev} parte="dados" />
          </>
        )}
        {passo === 1 && (
          <>
            <p className="mb-4 text-sm text-slate-500">Se não souber, deixe 2000 — é o mais comum.</p>
            <CamposConfig valor={c} onChange={setC} nomeDev={nomeDev} parte="texto" />
          </>
        )}
        {passo === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Para as aulas e atividades usarem as habilidades certas, falta só uma coisa:</p>
            <button
              onClick={() => terminar(onIrPlano)}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 text-left hover:bg-indigo-100"
            >
              <span className="text-2xl">📘</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-indigo-900">Enviar o plano de curso</span>
                <span className="block text-xs text-indigo-800">O arquivo (PDF, Word…) com as habilidades do ano. Recomendado.</span>
              </span>
              <span className="text-indigo-600">→</span>
            </button>
            {!diario?.conectado && diario?.disponivel !== false && (
              <button
                onClick={() => terminar(onAbrirDiario)}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50"
              >
                <span className="text-2xl">📒</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">Conectar ao D.E.V</span>
                  <span className="block text-xs text-slate-500">Opcional: se sua escola usa o D.E.V.</span>
                </span>
                <span className="text-slate-400">→</span>
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-2">
          {passo > 0 ? (
            <button onClick={() => setPasso(passo - 1)} className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100">
              Voltar
            </button>
          ) : (
            <button onClick={() => terminar()} className="rounded-xl px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-100">
              Agora não
            </button>
          )}
          {passo < 2 ? (
            <button
              onClick={avancar}
              disabled={!podeAvancar}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button onClick={() => terminar()} className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700">
              Começar a usar
            </button>
          )}
        </div>
        {passo === 0 && !podeAvancar && <p className="mt-2 text-right text-xs text-slate-400">Escolha a série e o estado para continuar.</p>}
      </div>
    </div>
  );
}
