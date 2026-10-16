import { useEffect, useRef } from "react";

// Pedidos comuns de ajuste (um toque coloca no campo; o professor pode completar)
const SUGESTOES = [
  "Melhore as imagens",
  "Use melhor o espaço da folha",
  "Coloque imagem em todas as questões",
  "Deixe mais fácil",
  "Deixe mais difícil",
  "Letra maior",
  "Mais colorida",
];

// Caixa "Quer mudar algo?": bem visivel, com sugestoes prontas
export function CaixaAjuste({
  valor,
  onChange,
  onAjustar,
  ajustando,
  compacta = false,
}: {
  valor: string;
  onChange: (v: string) => void;
  onAjustar: () => void;
  ajustando: boolean;
  compacta?: boolean;
}) {
  const juntar = (s: string) => onChange(valor.trim() ? `${valor.trim().replace(/[.;,]$/, "")}; ${s.toLowerCase()}` : s);
  return (
    <div className={`rounded-2xl border-2 border-violet-300 bg-gradient-to-br from-violet-50 to-indigo-50 ${compacta ? "p-3" : "p-4"}`} data-tour="ativ-ajuste">
      <label htmlFor="ajuste-ativ" className="flex items-center gap-2 text-base font-bold text-violet-900">
        <span className="text-xl" aria-hidden>
          ✨
        </span>
        Não ficou do seu jeito? Peça à I.A para ajustar
      </label>
      {!compacta && <p className="mt-0.5 text-xs text-violet-800">Escreva o que mudar. Ela mantém o resto e mostra a atividade ajustada.</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGESTOES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => juntar(s)}
            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-violet-800 ring-1 ring-violet-200 hover:bg-violet-100"
          >
            + {s}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <textarea
          id="ajuste-ativ"
          rows={2}
          value={valor}
          maxLength={1500}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && valor.trim() && !ajustando) {
              e.preventDefault();
              onAjustar();
            }
          }}
          placeholder="Ex.: melhore as imagens e deixe maiores, use melhor o espaço da folha, troque a questão 5 por uma de ligar…"
          className="min-h-[3rem] flex-1 rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <button
          onClick={onAjustar}
          disabled={ajustando || !valor.trim()}
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 sm:self-stretch"
        >
          {ajustando ? "Ajustando…" : "✨ Ajustar"}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-violet-700">⚡ Cada ajuste usa I.A: consome do seu limite do mês (ou dos créditos). No teste grátis, conta como 1 atividade.</p>
    </div>
  );
}

// Previa da folha do aluno (como vai sair na impressao), com o ajuste logo embaixo
export function PreviaAtividade({
  html,
  onFechar,
  onImprimir,
  ajuste,
}: {
  html: string;
  onFechar: () => void;
  onImprimir: () => void;
  ajuste?: { valor: string; onChange: (v: string) => void; onAjustar: () => void; ajustando: boolean };
}) {
  const quadro = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Prévia da atividade">
      <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 shadow">
        <p className="text-sm font-semibold text-slate-800">👁️ Como vai ficar a folha</p>
        <div className="flex gap-2">
          <button onClick={onImprimir} className="rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
            🖨️ Imprimir / PDF
          </button>
          <button onClick={onFechar} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-900">
            Fechar
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-auto p-2 sm:p-4">
        {ajuste?.ajustando && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <p className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-violet-800 shadow">✨ Ajustando a atividade… (com imagens pode levar até 1 min)</p>
          </div>
        )}
        <iframe
          ref={quadro}
          title="Prévia da atividade"
          srcDoc={html}
          className="mx-auto block h-full min-h-[70vh] w-full max-w-[820px] rounded-lg bg-white shadow-xl"
          style={{ padding: "18px 22px" }}
        />
      </div>
      {ajuste && (
        <div className="bg-white p-2 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] sm:p-3">
          <div className="mx-auto max-w-[820px]">
            <CaixaAjuste {...ajuste} compacta />
          </div>
        </div>
      )}
    </div>
  );
}
