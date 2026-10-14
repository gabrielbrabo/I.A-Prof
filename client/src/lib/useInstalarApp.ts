import { useEffect, useState } from "react";

// Botao "Instalar app" (PWA):
// - Chrome / Edge / Android: usa o convite de instalacao do proprio navegador.
// - iPhone / iPad (Safari): nao tem convite automatico -> mostramos o passo a passo.
// - Ja instalado (aberto como app): o botao some.

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let convite: EventoInstalar | null = null; // guardado fora do React: o evento chega antes da tela montar
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    convite = e as EventoInstalar;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    convite = null;
    avisar();
  });
}

function rodandoComoApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function ehIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
}

export function useInstalarApp() {
  const [, forcar] = useState(0);
  const [instalado, setInstalado] = useState(rodandoComoApp);
  const [mostrarIos, setMostrarIos] = useState(false);

  useEffect(() => {
    const f = () => {
      setInstalado(rodandoComoApp());
      forcar((n) => n + 1);
    };
    ouvintes.add(f);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", f);
    return () => {
      ouvintes.delete(f);
      mq?.removeEventListener?.("change", f);
    };
  }, []);

  const ios = ehIos();
  const disponivel = !instalado && (!!convite || ios);

  async function instalar() {
    if (convite) {
      const c = convite;
      await c.prompt();
      const { outcome } = await c.userChoice;
      if (outcome === "accepted") convite = null;
      avisar();
    } else if (ios) {
      setMostrarIos(true);
    }
  }

  return { disponivel, instalar, mostrarIos, fecharIos: () => setMostrarIos(false) };
}
