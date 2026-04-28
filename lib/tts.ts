/**
 * TTS via Web Speech API.
 * Sincronização entre players: não dá pra garantir 100% (cada device tem voz diferente),
 * mas todos disparam ao mesmo tempo via Realtime broadcast → começam juntos.
 */

let cachedVoice: SpeechSynthesisVoice | null = null;
let speaking = false;
let currentUtterance: SpeechSynthesisUtterance | null = null;

function pickBestVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  if (typeof window === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Prefere vozes femininas pt-BR (Luciana, Maria, Camila), depois qualquer pt-BR, depois pt
  const ptBrFemale = voices.find((v) => /pt-?br/i.test(v.lang) && /luciana|maria|camila|francisca|paulina/i.test(v.name));
  const ptBr = voices.find((v) => /pt-?br/i.test(v.lang));
  const pt = voices.find((v) => /pt/i.test(v.lang));
  cachedVoice = ptBrFemale || ptBr || pt || voices[0];
  return cachedVoice;
}

// Pre-warm voices async (Chrome carrega depois)
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoice = null;
    pickBestVoice();
  };
}

export function ttsSpeak(text: string, opts?: { rate?: number; pitch?: number; force?: boolean }) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  if (!text.trim()) return;

  if (!pickBestVoice()) {
    setTimeout(() => ttsSpeak(text, opts), 200);
    return;
  }

  // Se forçado, cancela tudo
  if (opts?.force || speaking) {
    window.speechSynthesis.cancel();
  }

  const u = new SpeechSynthesisUtterance(text);
  u.voice = cachedVoice;
  u.lang = cachedVoice?.lang || "pt-BR";
  u.rate = opts?.rate ?? 0.92;
  u.pitch = opts?.pitch ?? 1.0;
  u.onend = () => {
    speaking = false;
    currentUtterance = null;
  };
  u.onerror = () => {
    speaking = false;
    currentUtterance = null;
  };

  speaking = true;
  currentUtterance = u;
  window.speechSynthesis.speak(u);
}

export function ttsStop() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  speaking = false;
  currentUtterance = null;
  window.speechSynthesis.cancel();
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

export function ttsIsSpeaking(): boolean {
  return speaking;
}
