import { useEffect, useRef, useState } from "react";
import { BASE } from "../api/client";
import { cabecalhoAuth, lerResposta } from "./sessao";

// Ditado por voz em TODOS os navegadores:
// - Computador (Chrome / Edge / Safari): reconhecimento de fala do proprio navegador (gratis, texto aparece enquanto fala).
// - Celular e tablet (e Firefox / Brave / Opera): grava o audio e o servidor transcreve (Whisper, custo baixo).
//   No celular o reconhecimento do navegador repete palavras (bug do Android): a gravacao e bem mais precisa.
// O texto entra no campo e o professor revisa/edita antes de gerar o registro.

// Tipos minimos da Web Speech API (nao vem no lib.dom do TypeScript)
type ResultadoFala = { isFinal: boolean; 0: { transcript: string } };
type EventoFala = { resultIndex: number; results: ArrayLike<ResultadoFala> };
type Reconhecedor = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const MAX_SEGUNDOS = 120; // gravacao (modo servidor): para sozinha em 2 minutos (custo/tamanho)
const CHAVE_MODO = "iaprof.ditadoGravar"; // lembra que o reconhecimento do navegador falhou (ex.: Brave)

// Celular / tablet (inclui iPad, que se apresenta como Mac com tela de toque)
export function ehCelularOuTablet(): boolean {
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

// Junta repeticoes seguidas ("tabuada tabuada tabuada", "mat tabuada mat tabuada") numa so
export function limparRepeticoes(texto: string): string {
  let palavras = texto.split(/\s+/).filter(Boolean);
  const norm = (w: string) => w.toLowerCase().replace(/[.,;:!?]+$/, "");
  for (let n = 6; n >= 1; n--) {
    const saida: string[] = [];
    for (let i = 0; i < palavras.length; ) {
      let j = i + n;
      // nao junta atravessando fim de frase ("aula de mat. Mat tabuada")
      if (!/[.!?]$/.test(palavras[i + n - 1] ?? "")) {
        while (j + n <= palavras.length && palavras.slice(j, j + n).every((w, k) => norm(w) === norm(palavras[i + k]))) j += n;
      }
      saida.push(...palavras.slice(j - n, j)); // fica a ultima repeticao (com a pontuacao dela)
      i = j;
    }
    palavras = saida;
  }
  return palavras.join(" ");
}

function classeReconhecedor(): (new () => Reconhecedor) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function lerModoGravar(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_MODO) === "1";
  } catch {
    return false;
  }
}
function salvarModoGravar() {
  try {
    sessionStorage.setItem(CHAVE_MODO, "1");
  } catch {
    /* ignora */
  }
}

// Melhor formato de audio que o navegador grava (Safari: mp4; Chrome/Firefox: webm/ogg)
function formatoAudio(): { mime: string; ext: string } {
  const opcoes = [
    { mime: "audio/webm;codecs=opus", ext: "webm" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/ogg;codecs=opus", ext: "ogg" },
    { mime: "audio/mp4", ext: "mp4" },
  ];
  const MR = (window as unknown as { MediaRecorder?: { isTypeSupported?: (t: string) => boolean } }).MediaRecorder;
  return opcoes.find((o) => MR?.isTypeSupported?.(o.mime)) ?? { mime: "", ext: "webm" };
}

const ERROS: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone no navegador (ícone de cadeado ao lado do endereço) para falar.",
  "service-not-allowed": "Permita o uso do microfone no navegador para falar.",
  "audio-capture": "Nenhum microfone encontrado. Conecte um microfone e tente de novo.",
};

// onTexto recebe cada trecho FINAL reconhecido
export function useDitado(onTexto: (trecho: string) => void) {
  const [ouvindo, setOuvindo] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false); // modo servidor: enviando o audio
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  // celular/tablet: grava e transcreve (preciso); computador: reconhecimento do navegador (texto ao vivo)
  const [modoGravar, setModoGravar] = useState(() => !classeReconhecedor() || ehCelularOuTablet() || lerModoGravar());

  const rec = useRef<Reconhecedor | null>(null);
  const querOuvir = useRef(false);
  const recebeuFala = useRef(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const relogio = useRef<number | null>(null);
  const cb = useRef(onTexto);
  cb.current = onTexto;

  useEffect(
    () => () => {
      rec.current?.abort();
      pararGravacao(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ---------- Modo navegador (Chrome / Edge / Safari) ----------
  function iniciarNavegador() {
    const C = classeReconhecedor();
    if (!C) return iniciarGravacao();
    const r = new C();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;
    recebeuFala.current = false;
    const entregues = new Set<number>(); // indices finais ja enviados (o navegador as vezes repete o mesmo resultado)
    let ultimo = "";
    r.onresult = (e) => {
      recebeuFala.current = true;
      let temp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          if (entregues.has(i)) continue;
          entregues.add(i);
          let t = res[0].transcript.trim();
          // alguns navegadores mandam o trecho acumulado ("mat" -> "mat tabuada"): envia so o que e novo
          if (ultimo && t.toLowerCase().startsWith(ultimo.toLowerCase())) t = t.slice(ultimo.length).trim();
          else if (t.toLowerCase() === ultimo.toLowerCase()) t = "";
          if (t) {
            ultimo = res[0].transcript.trim();
            cb.current(limparRepeticoes(t));
          }
        } else temp += res[0].transcript;
      }
      setParcial(temp);
    };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // silencio: segue ouvindo
      // Navegador tem a API mas nao consegue usar o servico (ex.: Brave, Opera): troca para gravar + servidor
      if ((e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") && !recebeuFala.current) {
        querOuvir.current = false;
        rec.current = null;
        salvarModoGravar();
        setModoGravar(true);
        setOuvindo(false);
        setParcial("");
        iniciarGravacao();
        return;
      }
      setErro(ERROS[e.error] ?? `Não foi possível usar o microfone (${e.error}).`);
      querOuvir.current = false;
    };
    // O navegador encerra sozinho depois de um silencio: reinicia enquanto o professor nao parar
    r.onend = () => {
      setParcial("");
      if (querOuvir.current && rec.current === r) {
        try {
          entregues.clear(); // nova sessao do reconhecedor: os indices recomecam do zero
          r.start();
          return;
        } catch {
          /* ignora */
        }
      }
      if (rec.current === r) setOuvindo(false);
    };
    rec.current = r;
    querOuvir.current = true;
    try {
      r.start();
      setOuvindo(true);
    } catch {
      iniciarGravacao();
    }
  }

  // ---------- Modo servidor (Firefox / Brave / Opera / outros) ----------
  async function iniciarGravacao() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setErro("Este navegador não permite usar o microfone. Atualize o navegador ou digite o texto.");
      return;
    }
    try {
      // som mais limpo: tira eco e ruido e ajusta o volume (melhora muito a transcricao no celular)
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (e) {
      const nome = (e as { name?: string }).name;
      setErro(
        nome === "NotFoundError"
          ? ERROS["audio-capture"]
          : "Permita o uso do microfone no navegador (ícone ao lado do endereço) para falar."
      );
      return;
    }
    const { mime, ext } = formatoAudio();
    const g = mime ? new MediaRecorder(stream.current, { mimeType: mime }) : new MediaRecorder(stream.current);
    const pedacos: Blob[] = [];
    g.ondataavailable = (ev) => ev.data.size && pedacos.push(ev.data);
    g.onstop = () => {
      const tipo = g.mimeType || mime || "audio/webm";
      const audio = new Blob(pedacos, { type: tipo });
      if (audio.size > 0 && (g as MediaRecorder & { enviar?: boolean }).enviar !== false) void enviar(audio, `fala.${ext}`);
    };
    gravador.current = g;
    g.start();
    setSegundos(0);
    setOuvindo(true);
    relogio.current = window.setInterval(() => {
      setSegundos((s) => {
        if (s + 1 >= MAX_SEGUNDOS) pararGravacao(true);
        return s + 1;
      });
    }, 1000);
  }

  function pararGravacao(enviarAudio: boolean) {
    if (relogio.current) window.clearInterval(relogio.current);
    relogio.current = null;
    const g = gravador.current;
    gravador.current = null;
    if (g && g.state !== "inactive") {
      (g as MediaRecorder & { enviar?: boolean }).enviar = enviarAudio;
      g.stop();
    }
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setOuvindo(false);
  }

  async function enviar(audio: Blob, nome: string) {
    setTranscrevendo(true);
    try {
      const fd = new FormData();
      fd.append("audio", audio, nome);
      const resp = await fetch(`${BASE}/voz/transcrever`, { method: "POST", body: fd, headers: cabecalhoAuth() });
      const dados = await lerResposta<{ texto?: string }>(resp);
      if (dados.texto) cb.current(limparRepeticoes(dados.texto));
      else setErro("Não entendi o áudio. Fale mais perto do microfone e tente de novo.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao transcrever o áudio");
    } finally {
      setTranscrevendo(false);
    }
  }

  // ---------- Controles ----------
  function iniciar() {
    if (transcrevendo) return;
    setErro(null);
    if (modoGravar) void iniciarGravacao();
    else iniciarNavegador();
  }

  function parar() {
    if (gravador.current) return pararGravacao(true);
    querOuvir.current = false;
    rec.current?.stop();
    setOuvindo(false);
  }

  return {
    ouvindo,
    transcrevendo,
    parcial,
    erro,
    modoGravar, // true = grava e transcreve no servidor ao parar
    segundos,
    maxSegundos: MAX_SEGUNDOS,
    iniciar,
    parar,
    alternar: () => (ouvindo ? parar() : iniciar()),
  };
}
