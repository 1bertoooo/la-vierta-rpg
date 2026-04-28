/**
 * TTS humano via OpenAI:
 * - Narrador (Mestre): onyx — masculina grave, épica
 * - NPCs: voz + speed configuráveis por nome
 * - Bruna a Pandórica: nova + speed 1.18 (aguda, rápida — meiga-irritante)
 */

type OpenAIVoice = "onyx" | "echo" | "fable" | "alloy" | "nova" | "shimmer";

type VoiceConfig = { voice: OpenAIVoice; speed?: number };

const NARRADOR_VOICE: VoiceConfig = { voice: "onyx", speed: 0.95 };

const NPC_VOICES: VoiceConfig[] = [
  { voice: "echo", speed: 0.95 },
  { voice: "fable", speed: 0.95 },
  { voice: "alloy", speed: 0.95 },
  { voice: "nova", speed: 0.95 },
  { voice: "shimmer", speed: 0.95 },
];

// NPCs com voz fixa pra consistência narrativa
const NPC_VOICE_OVERRIDE: Record<string, VoiceConfig> = {
  // Bruna — "fina, meiga, irritante" — aguda + rápida
  "bruna": { voice: "nova", speed: 1.2 },
  "bruna a pandórica": { voice: "nova", speed: 1.2 },
  "bruna a pandorica": { voice: "nova", speed: 1.2 },
  "pandórica": { voice: "nova", speed: 1.2 },
  "pandorica": { voice: "nova", speed: 1.2 },
  "bruna lavierta": { voice: "nova", speed: 1.2 },

  // Mestres / aliados
  "anderson": { voice: "fable", speed: 0.92 },
  "mestre anderson": { voice: "fable", speed: 0.92 },
  "padrinho anderson": { voice: "fable", speed: 0.92 },
  "sergio": { voice: "echo", speed: 0.88 },
  "seu sergio": { voice: "echo", speed: 0.88 },
  "seu sérgio": { voice: "echo", speed: 0.88 },
  "walber": { voice: "alloy", speed: 0.95 },
  "bia": { voice: "shimmer", speed: 1.0 },
  "bia, a triste": { voice: "shimmer", speed: 0.92 },

  // Vilões / antagonistas
  "diego": { voice: "echo", speed: 1.05 },
  "diego das sombras": { voice: "echo", speed: 1.05 },
  "victor": { voice: "echo", speed: 0.95 },
  "victor de chifrinho": { voice: "echo", speed: 0.95 },
  "letícia": { voice: "shimmer", speed: 1.1 },
  "leticia": { voice: "shimmer", speed: 1.1 },
  "punheticia": { voice: "shimmer", speed: 1.1 },
  "punhetícia": { voice: "shimmer", speed: 1.1 },
  "janaína": { voice: "shimmer", speed: 1.05 },
  "janaina": { voice: "shimmer", speed: 1.05 },
  "joseph pussy": { voice: "alloy", speed: 0.95 },
  "joseph pussies": { voice: "alloy", speed: 0.95 },
};

function vozPraNpc(nome: string): VoiceConfig {
  const key = nome.trim().toLowerCase();
  if (NPC_VOICE_OVERRIDE[key]) return NPC_VOICE_OVERRIDE[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return NPC_VOICES[h % NPC_VOICES.length];
}

let audioEl: HTMLAudioElement | null = null;
let speakingChunkIdx = 0;
let chunks: { text: string; voice: OpenAIVoice; speed: number }[] = [];
let stopped = false;

const TTS_KEY = "lavierta:tts:enabled";
const audioCache: Map<string, string> = new Map();

export function ttsIsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(TTS_KEY);
  // Default ligado: só desliga se user explicitamente clicou pra desligar
  if (v === null) return true;
  return v === "true";
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
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function ttsPause() {
  if (audioEl && !audioEl.paused) audioEl.pause();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.pause();
  }
}

export function ttsResume() {
  if (audioEl && audioEl.paused) audioEl.play().catch(() => {});
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.resume();
  }
}

export function ttsIsPaused(): boolean {
  if (audioEl) return audioEl.paused && audioEl.currentTime > 0 && !audioEl.ended;
  if (typeof window !== "undefined" && window.speechSynthesis) {
    return window.speechSynthesis.paused;
  }
  return false;
}

/**
 * Detecta falas em "Nome: \"...\"" e divide o texto em chunks com vozes.
 */
function dividirEmChunks(texto: string): { text: string; voice: OpenAIVoice; speed: number }[] {
  const result: { text: string; voice: OpenAIVoice; speed: number }[] = [];
  const re = /([A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(?:\s+[a-záéíóúâêôãõç]+)*)(?:\s*[:,]?\s*)["“"]([^"”"]+)["”"]/g;

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(texto)) !== null) {
    if (match.index > lastIdx) {
      const before = texto.slice(lastIdx, match.index).trim();
      if (before) result.push({ text: before, voice: NARRADOR_VOICE.voice, speed: NARRADOR_VOICE.speed || 0.95 });
    }
    const nome = match[1];
    const fala = match[2];
    const intro = match[0].slice(0, match[0].indexOf(fala) - 1);
    if (intro.trim()) {
      result.push({ text: intro.trim(), voice: NARRADOR_VOICE.voice, speed: NARRADOR_VOICE.speed || 0.95 });
    }
    const cfg = vozPraNpc(nome);
    result.push({ text: fala.trim(), voice: cfg.voice, speed: cfg.speed || 0.95 });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < texto.length) {
    const rest = texto.slice(lastIdx).trim();
    if (rest) result.push({ text: rest, voice: NARRADOR_VOICE.voice, speed: NARRADOR_VOICE.speed || 0.95 });
  }
  if (result.length === 0) {
    result.push({ text: texto, voice: NARRADOR_VOICE.voice, speed: NARRADOR_VOICE.speed || 0.95 });
  }
  return result;
}

async function fetchAudio(text: string, voice: OpenAIVoice, speed: number): Promise<string> {
  const cacheKey = `${voice}:${speed}:${text}`;
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;

  const r = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, speed }),
  });
  if (!r.ok) throw new Error(`tts ${r.status}`);

  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await r.json();
    if (data.url) {
      audioCache.set(cacheKey, data.url);
      pruneCache();
      return data.url;
    }
    throw new Error(data.error || "sem url");
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  audioCache.set(cacheKey, url);
  pruneCache();
  return url;
}

// Guard contra recursão infinita em caso de falha em loop (B13)
let consecutiveErrors = 0;

async function tocarChunkAtual() {
  if (stopped) return;
  if (speakingChunkIdx >= chunks.length) return;
  if (consecutiveErrors > 5) {
    // Aborta — algo tá quebrado em loop
    consecutiveErrors = 0;
    return;
  }

  const chunk = chunks[speakingChunkIdx];

  // Pré-busca o PRÓXIMO chunk em paralelo (enquanto este toca)
  const proxIdx = speakingChunkIdx + 1;
  if (proxIdx < chunks.length) {
    const prox = chunks[proxIdx];
    fetchAudio(prox.text, prox.voice, prox.speed).catch(() => null);
  }

  try {
    const url = await fetchAudio(chunk.text, chunk.voice, chunk.speed);
    if (stopped) return;
    audioEl = new Audio(url);
    audioEl.onended = () => {
      consecutiveErrors = 0;
      speakingChunkIdx++;
      tocarChunkAtual();
    };
    audioEl.onerror = () => {
      consecutiveErrors++;
      speakingChunkIdx++;
      tocarChunkAtual();
    };
    await audioEl.play();
    consecutiveErrors = 0;
  } catch {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(chunk.text);
      u.lang = "pt-BR";
      u.rate = chunk.speed;
      u.onend = () => { speakingChunkIdx++; tocarChunkAtual(); };
      u.onerror = () => { consecutiveErrors++; speakingChunkIdx++; tocarChunkAtual(); };
      window.speechSynthesis.speak(u);
    } else {
      consecutiveErrors++;
      speakingChunkIdx++;
      tocarChunkAtual();
    }
  }
}

async function preloadChunks(text: string) {
  const cs = dividirEmChunks(text);
  // Streaming: só pré-carrega o PRIMEIRO chunk (latência inicial mínima).
  // Os subsequentes carregam em background enquanto o anterior toca (no tocarChunkAtual).
  if (cs.length === 0) return;
  await fetchAudio(cs[0].text, cs[0].voice, cs[0].speed).catch(() => null);
  if (cs.length > 1) {
    // Background prefetch do segundo (não bloqueia)
    fetchAudio(cs[1].text, cs[1].voice, cs[1].speed).catch(() => null);
  }
}

// LRU simples pra audioCache (B14): limita 100 entradas e revoga URLs antigos
const MAX_CACHE = 100;
function pruneCache() {
  if (audioCache.size <= MAX_CACHE) return;
  const excess = audioCache.size - MAX_CACHE;
  let i = 0;
  for (const [k, url] of audioCache) {
    if (i >= excess) break;
    if (url.startsWith("blob:")) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    audioCache.delete(k);
    i++;
  }
}

export function ttsSpeak(text: string, opts?: { force?: boolean; playAt?: number }) {
  if (typeof window === "undefined") return;
  if (!text.trim()) return;

  if (opts?.force) ttsStop();
  if (audioEl && !audioEl.paused && !opts?.playAt) return;

  stopped = false;
  chunks = dividirEmChunks(text);
  speakingChunkIdx = 0;

  if (opts?.playAt) {
    preloadChunks(text).then(() => {
      const remaining = Math.max(0, opts.playAt! - Date.now());
      setTimeout(() => {
        if (!stopped) tocarChunkAtual();
      }, remaining);
    });
    return;
  }

  tocarChunkAtual();
}

export function ttsIsSpeaking(): boolean {
  return !!audioEl && !audioEl.paused;
}
