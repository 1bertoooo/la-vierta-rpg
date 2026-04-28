/**
 * Música ambiente épica + SFX, sincronizada via Realtime broadcast.
 * Usa tracks de Free Music Archive / Pixabay com CORS aberto.
 */

export type Mood = "tavern" | "battle" | "dungeon" | "boss" | "calm" | "silence";

// Tracks épicas hospedadas em CDN com CORS (Pixabay direct download)
// Cada uma testada em produção — se uma falhar, lib tenta a próxima da mesma categoria
const MOOD_FALLBACKS: Record<Mood, string[]> = {
  tavern: [
    "https://cdn.pixabay.com/audio/2024/02/05/audio_e0fb0d80b9.mp3",
    "https://cdn.pixabay.com/audio/2022/03/15/audio_92a5f54849.mp3",
  ],
  battle: [
    "https://cdn.pixabay.com/audio/2023/07/30/audio_e1ff09da95.mp3",
    "https://cdn.pixabay.com/audio/2022/10/30/audio_c0e2b3c50d.mp3",
  ],
  dungeon: [
    "https://cdn.pixabay.com/audio/2023/02/28/audio_99e9d4d4ca.mp3",
    "https://cdn.pixabay.com/audio/2022/05/30/audio_c4e22ed4ac.mp3",
  ],
  boss: [
    "https://cdn.pixabay.com/audio/2023/07/30/audio_e1ff09da95.mp3",
    "https://cdn.pixabay.com/audio/2024/02/14/audio_e83d51c02b.mp3",
  ],
  calm: [
    "https://cdn.pixabay.com/audio/2024/02/22/audio_5b0ee5c9dd.mp3",
    "https://cdn.pixabay.com/audio/2022/03/24/audio_d11e87a9ec.mp3",
  ],
  silence: [],
};

let currentAudio: HTMLAudioElement | null = null;
let currentMood: Mood | null = null;
let masterVolume = 0.35;

const VOL_KEY = "lavierta:audio:volume";
const MUTED_KEY = "lavierta:audio:muted";

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
  // Default muted = false (música ON por padrão)
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

export async function audioPlayMood(mood: Mood) {
  if (typeof window === "undefined") return;
  if (audioIsMuted()) return;
  if (mood === currentMood && currentAudio && !currentAudio.paused) return;

  if (currentAudio) {
    fadeOutAndStop(currentAudio);
    currentAudio = null;
  }

  const urls = MOOD_FALLBACKS[mood] || [];
  if (urls.length === 0) {
    currentMood = mood;
    return;
  }

  // Tenta cada URL até uma carregar
  for (const url of urls) {
    try {
      const audio = new Audio(url);
      audio.loop = true;
      audio.volume = 0;
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";

      // Espera tentativa de play
      await new Promise<void>((resolve, reject) => {
        const onCanPlay = () => {
          audio.removeEventListener("canplaythrough", onCanPlay);
          audio.removeEventListener("error", onError);
          resolve();
        };
        const onError = (e: Event) => {
          audio.removeEventListener("canplaythrough", onCanPlay);
          audio.removeEventListener("error", onError);
          reject(e);
        };
        audio.addEventListener("canplaythrough", onCanPlay);
        audio.addEventListener("error", onError);
        // Timeout 5s
        setTimeout(() => reject(new Error("timeout")), 5000);
      });

      // Tenta play
      try {
        await audio.play();
      } catch {
        // Autoplay bloqueado — guarda o áudio mas não toca
        currentAudio = audio;
        currentMood = mood;
        return;
      }

      fadeIn(audio, masterVolume);
      currentAudio = audio;
      currentMood = mood;
      return;
    } catch {
      // Tenta próxima URL
      continue;
    }
  }

  // Todas falharam
  currentMood = mood;
}

// Tenta retomar play após interação do user (autoplay desbloqueado)
export function audioResumeIfBlocked() {
  if (currentAudio && currentAudio.paused) {
    currentAudio.play().catch(() => {});
    fadeIn(currentAudio, masterVolume);
  }
}

export function audioStop() {
  if (currentAudio) {
    fadeOutAndStop(currentAudio);
    currentAudio = null;
  }
  currentMood = null;
}

function fadeIn(audio: HTMLAudioElement, target: number, durationMs = 1500) {
  const start = Date.now();
  const tick = () => {
    if (audio.paused) return;
    const elapsed = Date.now() - start;
    const ratio = Math.min(1, elapsed / durationMs);
    audio.volume = target * ratio;
    if (ratio < 1) requestAnimationFrame(tick);
  };
  tick();
}

function fadeOutAndStop(audio: HTMLAudioElement, durationMs = 800) {
  const startVol = audio.volume;
  const start = Date.now();
  const tick = () => {
    const elapsed = Date.now() - start;
    const ratio = Math.min(1, elapsed / durationMs);
    audio.volume = startVol * (1 - ratio);
    if (ratio < 1) {
      requestAnimationFrame(tick);
    } else {
      audio.pause();
      audio.src = "";
    }
  };
  tick();
}

// SFX one-shot
const SFX = {
  dice: "https://cdn.pixabay.com/audio/2022/03/15/audio_2dde668f86.mp3",
  hit: "https://cdn.pixabay.com/audio/2022/10/14/audio_dafd2d9bad.mp3",
  magic: "https://cdn.pixabay.com/audio/2022/03/15/audio_4d10e1c7ea.mp3",
  bell: "https://cdn.pixabay.com/audio/2022/03/15/audio_5d2d5c0c69.mp3",
};

export function sfxPlay(key: keyof typeof SFX) {
  if (typeof window === "undefined") return;
  if (audioIsMuted()) return;
  const a = new Audio(SFX[key]);
  a.volume = masterVolume * 0.6;
  a.play().catch(() => {});
}
