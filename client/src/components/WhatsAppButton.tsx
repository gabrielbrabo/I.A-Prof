import { useEffect, useRef, useState } from "react";

// Botao flutuante de suporte via WhatsApp (fixo no canto inferior direito em todas as telas)
const WHATSAPP_NUMERO = "5538998357525"; // 55 (Brasil) + 38 (DDD) + numero
const WHATSAPP_MENSAGEM = "Ola! Preciso de suporte no I.A Prof.";

// Campos que abrem o teclado no celular
const ehCampoTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

// Elementos clicaveis que o botao NUNCA pode cobrir (qualquer zoom ou tamanho de fonte)
const CLICAVEIS = "button, a[href], input, select, textarea, label, summary, [role=button], [role=tab], [contenteditable=true]";
const FOLGA = 8; // distancia minima (px) entre o botao e o que esta embaixo
const MARGEM = 12; // distancia da borda da tela

export default function WhatsAppButton() {
  const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_MENSAGEM)}`;
  const ref = useRef<HTMLAnchorElement>(null);
  const bolinha = useRef<HTMLSpanElement>(null);
  const rotulo = useRef<HTMLSpanElement>(null);
  // o rotulo "Suporte: (38)..." (PC, ao passar o mouse no botao) so aparece se o espaco ao lado estiver livre
  const [rotuloOk, setRotuloOk] = useState(false);
  // Posicao: canto inferior direito; se ali tiver um botao/campo, sobe ate achar um lugar livre.
  // Se nao houver lugar livre na lateral, o botao some ate liberar (nunca fica em cima de "Gerar aula", "Salvar"...).
  const [pos, setPos] = useState<{ lado: "direita" | "esquerda"; baixo: number } | null>({ lado: "direita", baixo: MARGEM });

  useEffect(() => {
    let quadro = 0;
    const calcular = () => {
      quadro = 0;
      const tam = bolinha.current?.offsetWidth || 44;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const proprio = ref.current;
      // retangulos de tudo que e clicavel e esta visivel na tela agora
      const alvos: DOMRect[] = [];
      document.querySelectorAll<HTMLElement>(CLICAVEIS).forEach((el) => {
        if (proprio && (el === proprio || proprio.contains(el))) return;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0 || st.pointerEvents === "none") return;
        alvos.push(r);
      });
      const livre = (esq: number, topo: number) =>
        !alvos.some((r) => esq - FOLGA < r.right && esq + tam + FOLGA > r.left && topo - FOLGA < r.bottom && topo + tam + FOLGA > r.top);
      const limite = vh * 0.6; // nao sobe mais que 60% da tela
      for (const lado of ["direita", "esquerda"] as const) {
        const esq = lado === "direita" ? vw - MARGEM - tam : MARGEM;
        for (let baixo = MARGEM; baixo + tam <= limite; baixo += 8) {
          if (livre(esq, vh - baixo - tam)) {
            setPos((p) => (p && p.lado === lado && p.baixo === baixo ? p : { lado, baixo }));
            const larg = rotulo.current?.offsetWidth ?? 0;
            const altR = rotulo.current?.offsetHeight ?? 0;
            const topoR = vh - baixo - tam / 2 - altR / 2;
            const esqR = lado === "direita" ? esq - 8 - larg : esq + tam + 8;
            setRotuloOk(
              larg > 0 &&
                !alvos.some((r) => esqR - FOLGA < r.right && esqR + larg + FOLGA > r.left && topoR - FOLGA < r.bottom && topoR + altR + FOLGA > r.top)
            );
            return;
          }
        }
      }
      setPos(null); // sem lugar livre: esconde
      setRotuloOk(false);
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(calcular);
    };
    agendar();
    window.addEventListener("scroll", agendar, { passive: true, capture: true });
    window.addEventListener("resize", agendar);
    window.visualViewport?.addEventListener("resize", agendar);
    const obs = new MutationObserver(agendar);
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
    const t = window.setInterval(agendar, 1500); // seguranca (fontes carregando, animacoes)
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", agendar, { capture: true });
      window.removeEventListener("resize", agendar);
      window.visualViewport?.removeEventListener("resize", agendar);
      obs.disconnect();
      window.clearInterval(t);
    };
  }, []);

  // No celular, esconde enquanto o professor digita (teclado aberto) para nao cobrir botoes como "Gerar aula"
  const [digitando, setDigitando] = useState(false);
  useEffect(() => {
    const entrou = (e: FocusEvent) => ehCampoTexto(e.target) && setDigitando(true);
    const saiu = () => setDigitando(false);
    document.addEventListener("focusin", entrou);
    document.addEventListener("focusout", saiu);
    return () => {
      document.removeEventListener("focusin", entrou);
      document.removeEventListener("focusout", saiu);
    };
  }, []);
  const escondido = digitando || !pos;

  return (
    <a
      ref={ref}
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Suporte via WhatsApp (38) 99835-7525"
      title="Suporte: (38) 99835-7525"
      // z-[35]: fica acima do conteudo e do topo (z-30), mas abaixo do menu mobile e dos modais.
      // A posicao (bottom/lado) e calculada para nunca ficar em cima de botoes e campos.
      style={{
        bottom: `calc(${pos?.baixo ?? MARGEM}px + env(safe-area-inset-bottom))`,
        ...(pos?.lado === "esquerda" ? { left: MARGEM } : { right: MARGEM }),
      }}
      className={`group fixed z-[35] block transition-opacity duration-200 print:hidden ${
        escondido ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Rotulo com o numero (somente no PC, ao passar o mouse NO BOTAO). Fica fora da area clicavel
          (absolute + pointer-events-none) e so aparece se nao cobrir nenhum botao/campo. */}
      <span
        ref={rotulo}
        aria-hidden="true"
        className={`pointer-events-none invisible absolute top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 opacity-0 shadow-md transition-opacity duration-200 md:block ${
          pos?.lado === "esquerda" ? "left-full ml-2" : "right-full mr-2"
        } ${rotuloOk ? "group-hover:visible group-hover:opacity-100" : ""}`}
      >
        Suporte: (38) 99835-7525
      </span>

      {/* Botao redondo: 44px no mobile (minimo para toque), 56px no PC */}
      <span ref={bolinha} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform duration-200 hover:scale-110 hover:bg-[#1ebe5b] active:scale-95 md:h-14 md:w-14">
        <svg viewBox="0 0 32 32" className="h-6 w-6 fill-white md:h-7 md:w-7" aria-hidden="true">
          <path d="M16.004 3C9.374 3 4 8.373 4 15.002c0 2.119.554 4.188 1.607 6.012L4 29l8.187-1.573a11.95 11.95 0 0 0 3.817.625C22.632 28.052 28 22.68 28 16.05 28 9.42 22.632 3 16.004 3Zm0 22.86a9.86 9.86 0 0 1-5.03-1.378l-.36-.214-4.86.934.95-4.733-.235-.375a9.83 9.83 0 0 1-1.51-5.092c0-5.45 4.437-9.886 9.89-9.886 5.45 0 9.886 4.436 9.886 9.886 0 5.452-4.436 10.858-9.73 10.858Zm5.42-7.39c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.296-.768.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51l-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z" />
        </svg>
      </span>
    </a>
  );
}
