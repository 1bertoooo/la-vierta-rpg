/**
 * Sistema de áudio: música ambiente loop + SFX one-shot.
 * Usa Web Audio API nativa (sem dependência externa).
 */

export type Mood = "tavern" | "battle" | "dungeon" | "boss" | "calm" | "silence";

// URLs de música ambiente (hospedadas em CDNs free / Pixabay)
// Pra MVP, uso URLs públicas direto. Depois pode hospedar próprio.
export const MOOD_TRACKS: Record<Mood, string | null> = {
  tavern: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_92a5f54849.mp3",
  battle: "https://cdn.pixabay.com/download/audio/2022/10/30/audio_c0e2b3c50d.mp3",
  dungeon: "https://cdn.pixabay.com/download/audio/2022/05/30/audio_c4e22ed4ac.mp3",
  boss: "https://cdn.pixabay.com/download/audio/2024/02/14/audio_e83d51c02b.mp3",
  calm: "https://cdn.pixabay.com/download/audio/2022/03/24/audio_d11e87a9ec.mp3",
  silence: null,
};

let currentAudio: HTMLAudioElement | null = null;
let currentMood: Mood | null = null;
let masterVolume = 0.4;

const VOL_KEY = "lavierta:audio:volume";
const MUTED_KEY = "lavierta:audio:muted";
const MOOD_KEY = "lavierta:audio:mood";

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
  return localStorage.getItem(MUTED_KEY) === "true";
}

export function audioSetMuted(m: boolean) {
  if (typeof window !== "undefined") localStorage.setItem(MUTED_KEY, m ? "true" : "false");
  if (m) audioStop();
}

export function audioGetCurrentMood(): Mood | null {
  return currentMood;
}

export function audioPlayMood(mood: Mood) {
  if (typeof window === "undefined") return;
  if (audioIsMuted()) return;
  if (mood === currentMood) return;

  if (currentAudio) {
    fadeOutAndStop(currentAudio);
    currentAudio = null;
  }

  const url = MOOD_TRACKS[mood];
  if (!url) {
    currentMood = mood;
    return;
  }

  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = 0;
  audio.crossOrigin = "anonymous";

  audio.addEventListener("canplaythrough", () => {
    audio.play().catch(() => {
      // Autoplay bloqueado — vai precisar interação do user
    });
  });
  audio.load();

  fadeIn(audio, masterVolume);

  currentAudio = audio;
  currentMood = mood;
  if (typeof window !== "undefined") localStorage.setItem(MOOD_KEY, mood);
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
  dice: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_2dde668f86.mp3",
  hit: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_5a5b39e32f.mp3",
  magic: "https://cdn.pixabay.com/download/audio/2022/03/15/audio_4d10e1c7ea.mp3",
};

export function sfxPlay(key: keyof typeof SFX) {
  if (typeof window === "undefined") return;
  if (audioIsMuted()) return;
  const a = new Audio(SFX[key]);
  a.volume = masterVolume * 0.6;
  a.play().catch(() => {});
}
