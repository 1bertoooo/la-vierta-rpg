/**
 * TTS humano via OpenAI:
 * - Narrador (Mestre): onyx — masculina grave, épica
 * - NPCs: voz escolhida por hash do nome (echo, fable, alloy, nova, shimmer)
 * - Falas em "Nome: ..." são detectadas e tocadas com a voz do NPC
 *
 * Fallback: Web Speech API se /api/tts falhar.
 */

type OpenAIVoice = "onyx" | "echo" | "fable" | "alloy" | "nova" | "shimmer";

const NARRADOR_VOICE: OpenAIVoice = "onyx";

// Vozes diferentes por NPC, escolhidas por hash do nome
const NPC_VOICES: OpenAIVoice[] = ["echo", "fable", "alloy", "nova", "shimmer"];

// NPCs específicos com voz fixa pra consistência
const NPC_VOICE_OVERRIDE: Record<string, OpenAIVoice> = {
  "anderson": "fable",
  "mestre anderson": "fable",
  "sergio": "echo",
  "seu sergio": "echo",
  "seu sérgio": "echo",
  "walber": "alloy",
  "bia": "nova",
  "bia, a triste": "nova",
  "diego": "echo",
  "diego das sombras": "echo",
  "letícia": "shimmer",
  "leticia": "shimmer",
  "punheticia": "shimmer",
  "punhetícia": "shimmer",
  "bruna": "shimmer",
  "bruna a pandórica": "shimmer",
  "bruna a pandorica": "shimmer",
  "victor": "echo",
  "joseph pussy": "alloy",
  "joseph pussies": "alloy",
};

function vozPraNpc(nome: string): OpenAIVoice {
  const key = nome.trim().toLowerCase();
  if (NPC_VOICE_OVERRIDE[key]) return NPC_VOICE_OVERRIDE[key];
  // Hash simples
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return NPC_VOICES[h % NPC_VOICES.length];
}

// Estado interno
let audioEl: HTMLAudioElement | null = null;
let speakingChunkIdx = 0;
let chunks: { text: string; voice: OpenAIVoice }[] = [];
let stopped = false;

const TTS_KEY = "lavierta:tts:enabled";
// Cache de áudios já gerados (text+voice → blob URL)
const audioCache: Map<string, string> = new Map();

export function ttsIsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(TTS_KEY) === "true";
}

export function ttsSetEnabled(v: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TTS_KEY, v ? "true" : "false");
  if (!v) ttsStop();
}

export function ttsStop() {
  stopped = true;
  if (audioEl) {
    audioEl.pause();
    audioEl.src = "";
    audioEl = null;
  }
  chunks = [];
  speakingChunkIdx = 0;

  // Para Web Speech API tb (fallback)
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Detecta falas em "Nome: \"...\"" ou "Nome diz: ..." e divide o texto em chunks com vozes.
 * O resto vai pro Narrador.
 */
function dividirEmChunks(texto: string): { text: string; voice: OpenAIVoice }[] {
  const result: { text: string; voice: OpenAIVoice }[] = [];

  // Regex: captura "Nome: "fala"" ou "Nome solta seu "fala""
  // Padrão: 1+ palavras com inicial maiúscula seguidas de : "..." OU "..."
  const re = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[a-záéíóúâêôãõç]+)*)(?:\s*[:,]?\s*)["“"]([^"”"]+)["”"]/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(texto)) !== null) {
    // Texto antes do match → narrador
    if (match.index > lastIdx) {
      const before = texto.slice(lastIdx, match.index).trim();
      if (before) result.push({ text: before, voice: NARRADOR_VOICE });
    }
    // O match em si: pode incluir o nome+verbo (ex: "Sérgio diz:") + a fala
    const nome = match[1];
    const fala = match[2];

    // Coloca o "Nome:" no narrador, e a fala no NPC
    const introMatch = match[0].slice(0, match[0].indexOf(fala) - 1);
    if (introMatch.trim()) {
      result.push({ text: introMatch.trim(), voice: NARRADOR_VOICE });
    }
    result.push({ text: fala.trim(), voice: vozPraNpc(nome) });

    lastIdx = match.index + match[0].length;
  }

  // Resto
  if (lastIdx < texto.length) {
    const rest = texto.slice(lastIdx).trim();
    if (rest) result.push({ text: rest, voice: NARRADOR_VOICE });
  }

  if (result.length === 0) {
    result.push({ text: texto, voice: NARRADOR_VOICE });
  }

  return result;
}

async function fetchAudio(text: string, voice: OpenAIVoice): Promise<string> {
  const cacheKey = `${voice}:${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;

  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed: 0.95 }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}`);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  audioCache.set(cacheKey, url);
  return url;
}

async function tocarChunkAtual() {
  if (stopped) return;
  if (speakingChunkIdx >= chunks.length) return;

  const chunk = chunks[speakingChunkIdx];
  try {
    const url = await fetchAudio(chunk.text, chunk.voice);
    if (stopped) return;

    audioEl = new Audio(url);
    audioEl.onended = () => {
      speakingChunkIdx++;
      tocarChunkAtual();
    };
    audioEl.onerror = () => {
      // Pula esse chunk e tenta o próximo
      speakingChunkIdx++;
      tocarChunkAtual();
    };
    await audioEl.play();
  } catch {
    // Fallback Web Speech pro chunk
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(chunk.text);
      u.lang = "pt-BR";
      u.rate = 0.95;
      u.onend = () => {
        speakingChunkIdx++;
        tocarChunkAtual();
      };
      u.onerror = () => {
        speakingChunkIdx++;
        tocarChunkAtual();
      };
      window.speechSynthesis.speak(u);
    } else {
      speakingChunkIdx++;
      tocarChunkAtual();
    }
  }
}

export function ttsSpeak(text: string, opts?: { force?: boolean }) {
  if (typeof window === "undefined") return;
  if (!text.trim()) return;

  if (opts?.force) {
    ttsStop();
  }
  if (audioEl && !audioEl.paused) {
    return;
  }

  stopped = false;
  chunks = dividirEmChunks(text);
  speakingChunkIdx = 0;
  tocarChunkAtual();
}

export function ttsIsSpeaking(): boolean {
  return !!audioEl && !audioEl.paused;
}
