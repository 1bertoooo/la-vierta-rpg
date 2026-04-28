/**
 * TTS via Web Speech API (gratuito, nativo do browser).
 * Tenta achar voz pt-BR; fallback pra qualquer voz disponível.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;
let queue: string[] = [];
let speaking = false;

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Prefere pt-BR, depois pt, depois en
  const ptBr = voices.find((v) => /pt-?br/i.test(v.lang));
  const pt = voices.find((v) => /pt/i.test(v.lang));
  const fallback = voices[0];
  cachedVoice = ptBr || pt || fallback;
  return cachedVoice;
}

export function ttsSpeak(text: string, opts?: { rate?: number; pitch?: number }) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (!text.trim()) return;

  // Garante voz carregada (Chrome carrega async)
  if (!pickBestVoice()) {
    setTimeout(() => ttsSpeak(text, opts), 200);
    return;
  }

  const u = new SpeechSynthesisUtterance(text);
  u.voice = cachedVoice;
  u.lang = cachedVoice?.lang || "pt-BR";
  u.rate = opts?.rate ?? 0.95;
  u.pitch = opts?.pitch ?? 1.0;
  u.onend = () => {
    speaking = false;
    flushQueue();
  };
  u.onerror = () => {
    speaking = false;
    flushQueue();
  };

  if (speaking) {
    queue.push(text);
    return;
  }
  speaking = true;
  window.speechSynthesis.speak(u);
}

function flushQueue() {
  if (queue.length === 0) return;
  const next = queue.shift()!;
  ttsSpeak(next);
}

export function ttsStop() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  queue = [];
  speaking = false;
  window.speechSynthesis.cancel();
}

// Quebra texto longo em frases pra TTS soar mais natural
export function dividirEmFrases(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const TTS_KEY = "lavierta:tts:enabled";

export function ttsIsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(TTS_KEY) === "true";
}

export function ttsSetEnabled(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TTS_KEY, v ? "true" : "false");
  if (!v) ttsStop();
}
