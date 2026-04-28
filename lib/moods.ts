/**
 * Lista canônica de moods de música. Usado tanto pelo client (lib/audio.ts)
 * quanto pelo server (/api/music). Mantém os dois em sync.
 */

export const MOOD_LIST = [
  // Locais
  "tavern", "dungeon", "forest", "city", "desert", "sea", "snow", "mountain",
  "palace", "temple", "swamp", "cave",
  // Estados
  "battle", "boss", "calm", "mystery", "romance", "ritual", "tragic", "victory",
  "chase", "horror", "stealth", "epic", "dread", "crowd", "noble", "prayer",
  "memory", "ascension", "silence",
] as const;

export type Mood = (typeof MOOD_LIST)[number];

export const VALID_MOODS = new Set<string>(MOOD_LIST);

export function isMood(m: string): m is Mood {
  return VALID_MOODS.has(m);
}
