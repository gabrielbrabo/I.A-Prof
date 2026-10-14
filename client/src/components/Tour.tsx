import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// Tour guiado: destaca um elemento da tela (marcado com data-tour="...") e mostra um card explicando.
// Passos cujo elemento nao existe/nao esta visivel sao pulados.
export interface PassoTour {
  alvo: string; // valor do atributo data-tour
  titulo: string;
  texto: string;
}

function acharAlvo(alvo: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${alvo}"]`));
  return els.find((e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden") ?? null;
}

const PAD = 6;

export default function Tour({ passos, onFim }: { passos: PassoTour[]; onFim: () => void }) {
  // so os passos que existem na tela agora
  const [lista] = useState(() => passos.filter((p) => acharAlvo(p.alvo)));
  const [i, setI] = useState(0);
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  const passo = lista[i];

  const medir = useCallback(() => {
    if (!passo) return;
    const el = acharAlvo(passo.alvo);
    setCaixa(el ? el.getBoundingClientRect() : null);
  }, [passo]);

  // leva o elemento para o meio da tela e mede de novo depois da rolagem
  useLayoutEffect(() => {
    if (!passo) return;
    const el = acharAlvo(passo.alvo);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    medir();
    const t1 = window.setTimeout(medir, 350);
    const t2 = window.setTimeout(medir, 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [passo, medir]);

  useEffect(() => {
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFim();
      if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, lista.length - 1));
      if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("keydown", tecla);
    };
  }, [medir, onFim, lista.length]);

  useEffect(() => {
    if (!lista.length) onFim();
  }, [lista.length, onFim]);
  if (!passo) return null;

  const ultimo = i === lista.length - 1;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const largura = Math.min(320, vw - 24);
  // card abaixo do elemento; se nao couber, acima
  let top = caixa ? caixa.bottom + PAD + 10 : vh / 2 - 90;
  const alturaCard = 190;
  if (caixa && top + alturaCard > vh - 70) top = Math.max(12, caixa.top - PAD - 10 - alturaCard);
  const left = caixa ? Math.min(Math.max(12, caixa.left + caixa.width / 2 - largura / 2), vw - largura - 12) : (vw - largura) / 2;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Como usar o I.A Prof">
      {/* fundo escuro com "buraco" no elemento destacado */}
      {caixa ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-amber-400 transition-all duration-300"
          style={{
            top: caixa.top - PAD,
            left: caixa.left - PAD,
            width: caixa.width + PAD * 2,
            height: caixa.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-slate-900/60" />
      )}
      {/* bloqueia cliques na tela durante o tour */}
      <div className="fixed inset-0" />

      <div className="fixed rounded-xl bg-white p-4 shadow-2xl transition-all duration-300" style={{ top, left, width: largura }}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800">{passo.titulo}</p>
          <span className="shrink-0 text-[11px] text-slate-400">
            {i + 1} de {lista.length}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">{passo.texto}</p>
        <div className="mt-2 flex gap-1">
          {lista.map((_, n) => (
            <span key={n} className={`h-1 flex-1 rounded-full ${n <= i ? "bg-indigo-500" : "bg-slate-200"}`} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={onFim} className="text-xs text-slate-500 hover:text-slate-700 hover:underline">
            Pular tour
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button onClick={() => setI(i - 1)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                Voltar
              </button>
            )}
            <button
              onClick={() => (ultimo ? onFim() : setI(i + 1))}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              autoFocus
            >
              {ultimo ? "Começar a usar" : "Próximo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Passos do tour da primeira entrada (tela Gerar aula)
export const PASSOS_INICIO: PassoTour[] = [
  {
    alvo: "ferramenta-aulas",
    titulo: "Plano de aulas",
    texto: "Esta é a ferramenta de aulas. Dentro dela ficam os botões Gerar aula, Plano de curso e Aulas salvas.",
  },
  {
    alvo: "aba-plano",
    titulo: "1º passo: o plano de curso",
    texto: "Antes de gerar aulas, envie o plano de curso da sua série neste botão. As habilidades (códigos BNCC) das aulas vêm dele.",
  },
  { alvo: "serie", titulo: "Série e UF", texto: "Escolha a série e o estado. Fica guardado para as próximas vezes." },
  {
    alvo: "periodo",
    titulo: "Período da aula",
    texto: "Escolha o bimestre/trimestre. A I.A usa só as habilidades do plano desse período.",
  },
  {
    alvo: "limite",
    titulo: "Tamanho do texto",
    texto: "Coloque o limite de caracteres do campo de registro do seu diário. O texto gerado é ajustado para caber.",
  },
  {
    alvo: "texto",
    titulo: "Conte como foi a aula",
    texto: "Escreva do seu jeito, abreviado mesmo. Ex.: “mat tabuada do 7, port leitura de fábula, acolhida”.",
  },
  { alvo: "falar", titulo: "Prefere falar?", texto: "Toque em 🎤 Falar e dite a aula. O texto aparece no campo para você conferir." },
  {
    alvo: "gerar",
    titulo: "Gerar aula",
    texto: "A I.A separa por matéria e coloca os códigos. Confira os cards (os que piscam pedem ✓ Conferi) e clique em Aprovar e salvar.",
  },
  { alvo: "uso", titulo: "Uso do mês", texto: "Aqui você acompanha quanto já usou da I.A neste mês. Renova todo dia 1º." },
  {
    alvo: "dev",
    titulo: "Diário D.E.V",
    texto: "Se sua escola usa o D.E.V, conecte aqui com seu CPF e senha do D.E.V: a aula salva vai direto para o diário da turma.",
  },
  { alvo: "aba-historico", titulo: "Aulas salvas", texto: "Todas as aulas ficam aqui para copiar, editar ou enviar ao D.E.V." },
  { alvo: "ajuda", titulo: "Ficou com dúvida?", texto: "Em ❓ Como usar você vê o passo a passo e deixa rever este tour quando quiser." },
];
