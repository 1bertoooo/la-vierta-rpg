/**
 * Música ambiente — cobertura 100% das cenas.
 * 30+ moods + auto-detecção por keyword se a IA esquecer.
 */

export type Mood =
  // — Locais —
  | "tavern"      // taverna, bar, cantina
  | "dungeon"     // masmorra, ruínas, cripta
  | "forest"      // floresta, mata
  | "city"        // cidade, mercado, praça
  | "desert"      // deserto, dunas
  | "sea"         // mar, navio, oceano
  | "snow"        // gelo, montanha congelada
  | "mountain"    // montanhas, picos
  | "palace"      // palácio, corte real
  | "temple"      // templo sagrado
  | "swamp"       // pântano, manguezal
  | "cave"        // caverna profunda
  // — Estados / Tom —
  | "battle"      // combate corpo a corpo
  | "boss"        // chefão, vilão chega
  | "calm"        // descanso, viagem tranquila
  | "mystery"     // suspense, investigação
  | "romance"     // íntimo, amor
  | "ritual"      // magia, cerimônia
  | "tragic"      // morte, despedida
  | "victory"     // triunfo, celebração
  | "chase"       // perseguição, fuga
  | "horror"      // pesadelo, terror
  | "stealth"     // furtividade, infiltração
  | "epic"        // épico, jornada grandiosa
  | "dread"       // pavor, mau pressentimento
  | "crowd"       // multidão, festa, dança
  | "noble"       // corte, etiqueta, audiência
  | "prayer"      // oração, divino
  | "memory"      // flashback, lembrança
  | "ascension"   // revelação, ascensão
  | "silence";

// Proxy local — resolve CORS do Pixabay e cache no edge da Vercel
function moodUrl(mood: Mood): string {
  if (mood === "silence") return "";
  return `/api/music?mood=${mood}`;
}

/** Auto-detecta mood por keyword se a IA esquecer de marcar */
export function detectMoodFromText(text: string): Mood | null {
  const t = text.toLowerCase();

  // Boss / chefão
  if (/bruna a pandórica|pandórica|boss aparece|trono dela|olho vermelho|ECOA|presença esmagadora/i.test(t)) return "boss";
  // Combate
  if (/iniciativa|combate começa|ataca|investe|golpe|esquiva|sangue jorra|espada se choca|machado|mísseis/i.test(t)) return "battle";
  // Perseguição
  if (/foge|persegue|corre|atrás de ti|atras de ti|escapar|salta de telhado|atravessa beco|disparada/i.test(t)) return "chase";
  // Horror
  if (/sangue escorre|olhos no escuro|grito ecoa|risadinha desumana|carne se contorce|rosto sem olhos|ar gelado de medo/i.test(t)) return "horror";
  // Pavor / dread
  if (/pressentimento|algo errado|silêncio pesa|sombra cresce|ar fica denso|pulso acelera|frio na espinha/i.test(t)) return "dread";
  // Furtividade
  if (/furtivamente|silenciosamente|esgueirar|sussurra plano|à espreita|a espreita|pisada leve|sem barulho/i.test(t)) return "stealth";
  // Tragédia
  if (/morre|morto|último suspiro|funeral|despedida|chora ao ver|grita o nome|coração parte|cai sem vida/i.test(t)) return "tragic";
  // Vitória
  if (/vence|vitória|vitoria|triunfo|comemora|brinde|celebra|salva o dia|tomba o último|conquistou/i.test(t)) return "victory";
  // Romance
  if (/beija|olhar fixo|toque suave|coração acelera|íntimo|deita ao lado|abraça forte|cama|carícia|caricia/i.test(t)) return "romance";
  // Mistério
  if (/sussurro|mistério|misterio|sombra atrás|carta selada|cifra|pegada estranha|pista|investiga|enigma/i.test(t)) return "mystery";
  // Ritual
  if (/cânticos|cantico|invoca|círculo de sal|incenso|altar|cerimônia|cerimonia|conjura|salmodia|escreve runa/i.test(t)) return "ritual";
  // Templo / oração
  if (/reza|oração|oracao|divino|sagrad|deus de|abençoa|abencoa|prece|milagre/i.test(t)) return "prayer";
  // Memória / flashback
  if (/lembra-se|lembra de|flashback|ano anterior|criança|criança quando|antes da maldição|tempos atrás/i.test(t)) return "memory";
  // Ascensão / revelação
  if (/revela-se|verdade aparece|profecia se cumpre|coroa|ascende|chama branca|presença sagrada/i.test(t)) return "ascension";
  // Cidade / multidão
  if (/mercado|praça lotada|praca lotada|multidão|multidao|burburinho|cidade desperta|vendedores gritam/i.test(t)) return "crowd";
  // Corte nobre
  if (/corte|trono|rainha|rei|salão de|dama de|barão|baronato|nobre senhor|protocolo/i.test(t)) return "noble";
  // Palácio
  if (/palácio|palacio|salão dourado|tapeçaria|candelabro de cristal|escadaria de mármore/i.test(t)) return "palace";
  // Temple sagrado
  if (/templo|monastério|monasterio|capela|altar de|crucifixo|abadia/i.test(t)) return "temple";
  // Desert
  if (/deserto|areia|sol queima|duna|esfinge|palmeira morrendo|mira no horizonte/i.test(t)) return "desert";
  // Sea
  if (/mar|navio|oceano|vela ranja|gaivota|porto|maré|onda quebra/i.test(t)) return "sea";
  // Snow / gelo
  if (/neve|gelo|congelad|nevasca|frio cortante|montanha branca|geleira|pés azuis/i.test(t)) return "snow";
  // Montanha
  if (/montanha|pico|encosta|trilha íngreme|abismo|caverna alta/i.test(t)) return "mountain";
  // Pântano
  if (/pântano|pantano|lama|brejo|manguezal|sapo|mosquito|miasma/i.test(t)) return "swamp";
  // Caverna
  if (/caverna|gruta|estalactite|escuridão pura|escuridao pura|cavernoso/i.test(t)) return "cave";
  // Floresta
  if (/floresta|árvores|arvores|musgo|riacho|trilha|folhagem|cerrado|capim|cipó/i.test(t)) return "forest";
  // Dungeon / ruínas
  if (/masmorra|porão|porao|cripta|ruína|ruina|catacumb|esgoto|labirinto|subterrâneo/i.test(t)) return "dungeon";
  // Taverna
  if (/taverna|amarelinho|balcão|balcao|caneco|barzin|copo lascado|forró|forro|sanfona/i.test(t)) return "tavern";
  // Calmo / viagem
  if (/dorme|descans|fogueira|estrelas|amanhecer|silêncio cai|silencio cai|caminham por|viagem|travessia tranquila/i.test(t)) return "calm";
  // Épico genérico
  if (/destino|profecia|jornada|liga dos quatro|herói|heroi|salvar o reino|fragmento|maldição se quebra/i.test(t)) return "epic";

  return null;
}

let currentAudio: HTMLAudioElement | null = null;
let currentMood: Mood | null = null;
let masterVolume = 0.35;

const VOL_KEY = "lavierta:audio:volume";
const MUTED_KEY = "lavierta:audio:muted";

function log(...args: unknown[]) {
  if (typeof window !== "undefined") console.log("[audio]", ...args);
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
  if (audioIsMuted()) {
    log("muted, ignorando", mood);
    return;
  }
  if (mood === currentMood && currentAudio && !currentAudio.paused) return;

  log("trocando mood pra", mood);

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }

  const url = moodUrl(mood);
  if (!url) {
    currentMood = mood;
    return;
  }

  const audio = new Audio(url);
  audio.loop = true;
  audio.volume = masterVolume;
  // SEM crossOrigin — same-origin via /api/music
  audio.preload = "auto";
  audio.addEventListener("error", (e) => log("erro carregando", url, e));
  audio.addEventListener("playing", () => log("playing", mood));

  const p = audio.play();
  if (p && p.catch) p.catch((err) => log("autoplay bloqueado:", err.message));

  currentAudio = audio;
  currentMood = mood;
}

/** Inteligente: usa mood explícito da IA, ou detecta por texto, ou mantém */
export function audioPlayFromNarration(opts: { explicit_mood?: string | null; text?: string }) {
  if (audioIsMuted()) return;

  if (opts.explicit_mood) {
    const m = opts.explicit_mood.toLowerCase() as Mood;
    if (MOOD_TRACKS[m] !== undefined) {
      audioPlayMood(m);
      return;
    }
  }

  if (opts.text) {
    const detected = detectMoodFromText(opts.text);
    if (detected && detected !== currentMood) {
      log("mood auto-detectado:", detected);
      audioPlayMood(detected);
      return;
    }
  }

  if (!currentAudio || currentAudio.paused) {
    audioPlayMood("tavern");
  }
}

export function audioResumeIfBlocked() {
  if (currentAudio && currentAudio.paused && !audioIsMuted()) {
    log("retomando bloqueado");
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
