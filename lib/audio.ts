/**
 * Música ambiente: simplificada, com debug e ativação manual.
 * URLs Pixabay funcionam mas precisam de gesto do user pra autoplay.
 */

export type Mood = "tavern" | "battle" | "dungeon" | "boss" | "calm" | "silence";

const MOOD_TRACKS: Record<Mood, string> = {
  tavern: "https://cdn.pixabay.com/audio/2024/02/05/audio_e0fb0d80b9.mp3",
  battle: "https://cdn.pixabay.com/audio/2023/07/30/audio_e1ff09da95.mp3",
  dungeon: "https://cdn.pixabay.com/audio/2023/02/28/audio_99e9d4d4ca.mp3",
  boss: "https://cdn.pixabay.com/audio/2024/02/14/audio_e83d51c02b.mp3",
  calm: "https://cdn.pixabay.com/audio/2024/02/22/audio_5b0ee5c9dd.mp3",
  silence: "",
};

let currentAudio: HTMLAudioElement | null = null;
let currentMood: Mood | null = null;
let masterVolume = 0.35;

const VOL_KEY = "lavierta:audio:volume";
const MUTED_KEY = "lavierta:audio:muted";

function log(...args: unknown[]) {
  if (typeof window !== "undefined") {
    console.log("[audio]", ...args);
  }
}

export function audioInit() {
  if (typeof window === "undefined") return;
  const v = localStorage.getItem(VOL_KEY);
  if (v) masterVolume = parseFloat(v);
}

export function audioSetVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (typeof window !== "undefined") localStorage.setItem(VOL_KEY, String(masterVolume));
  if (currentAudio) currentAudio.volume = masterVolume;
}

export function audioGetVolume(): number {
  return masterVolume;
}

export function audioIsMuted(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(MUTED_KEY);
  return v === "true";
}

export function audioSetMuted(m: boolean) {
  if (typeof window !== "undefined") localStorage.setItem(MUTED_KEY, m ? "true" : "false");
  if (m) audioStop();
}

export function audioGetCurrentMood(): Mood | null {
  return currentMood;
}

/**
 * IMPORTANTE: chame essa função SÍNCRONO dentro de um click handler do user
 * pra autoplay funcionar. Não use await antes dela.
 */
export function audioPlayMood(mood: Mood) {
  if (typeof window === "undefined") return;
  if (audioIsMuted()) {
    log("muted, ignorando", mood);
    return;
  }
  if (mood === currentMood && currentAudio && !currentAudio.paused) {
    log("já tocando", mood);
    return;
  }

  log("trocando mood pra", mood);

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }

  const url = MOOD_TRACKS[mood];
  if (!url) {
    currentMood = mood;
    return;
  }

  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = masterVolume;
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";

  audio.addEventListener("error", (e) => {
    log("erro carregando", url, e);
  });
  audio.addEventListener("canplay", () => {
    log("canplay", url);
  });
  audio.addEventListener("playing", () => {
    log("playing", url);
  });

  // Tenta tocar IMEDIATAMENTE — se for chamado de click handler funciona
  const p = audio.play();
  if (p && p.catch) {
    p.catch((err) => {
      log("autoplay bloqueado:", err.message);
      // Mantém o áudio carregado pra próxima tentativa do user
    });
  }

  currentAudio = audio;
  currentMood = mood;
}

/** Tenta retomar áudio bloqueado por autoplay — chame em qualquer click do user */
export function audioResumeIfBlocked() {
  if (currentAudio && currentAudio.paused && !audioIsMuted()) {
    log("tentando retomar audio bloqueado");
    currentAudio.play().catch((e) => log("ainda bloqueado:", e.message));
  }
}

export function audioStop() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  currentMood = null;
}

export function audioIsPlaying(): boolean {
  return !!(currentAudio && !currentAudio.paused);
}
