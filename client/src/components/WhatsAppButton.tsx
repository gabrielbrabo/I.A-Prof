import { useEffect, useState } from "react";

// Botao flutuante de suporte via WhatsApp (fixo no canto inferior direito em todas as telas)
const WHATSAPP_NUMERO = "5538998357525"; // 55 (Brasil) + 38 (DDD) + numero
const WHATSAPP_MENSAGEM = "Ola! Preciso de suporte no I.A Prof.";

// Campos que abrem o teclado no celular
const ehCampoTexto = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

export default function WhatsAppButton() {
  const link = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(WHATSAPP_MENSAGEM)}`;

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

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Suporte via WhatsApp (38) 99835-7525"
      title="Suporte: (38) 99835-7525"
      // z-[35]: fica acima do conteudo e do topo (z-30), mas abaixo do menu mobile e dos modais
      className={`group fixed z-[35] flex items-center gap-2 right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] transition-opacity duration-200 md:right-6 md:bottom-6 md:opacity-100 md:pointer-events-auto print:hidden ${
        digitando ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Rotulo com o numero (somente no PC, ao passar o mouse) */}
      <span className="pointer-events-none hidden translate-x-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 opacity-0 shadow-md transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 md:block">
        Suporte: (38) 99835-7525
      </span>

      {/* Botao redondo: 44px no mobile (minimo para toque), 56px no PC */}
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform duration-200 hover:scale-110 hover:bg-[#1ebe5b] active:scale-95 md:h-14 md:w-14">
        <svg viewBox="0 0 32 32" className="h-6 w-6 fill-white md:h-7 md:w-7" aria-hidden="true">
          <path d="M16.004 3C9.374 3 4 8.373 4 15.002c0 2.119.554 4.188 1.607 6.012L4 29l8.187-1.573a11.95 11.95 0 0 0 3.817.625C22.632 28.052 28 22.68 28 16.05 28 9.42 22.632 3 16.004 3Zm0 22.86a9.86 9.86 0 0 1-5.03-1.378l-.36-.214-4.86.934.95-4.733-.235-.375a9.83 9.83 0 0 1-1.51-5.092c0-5.45 4.437-9.886 9.89-9.886 5.45 0 9.886 4.436 9.886 9.886 0 5.452-4.436 10.858-9.73 10.858Zm5.42-7.39c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.198.296-.768.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51l-.57-.01c-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Z" />
        </svg>
      </span>
    </a>
  );
}
