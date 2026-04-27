/**
 * Identificação de player sem auth.
 * client_id é gerado uma vez no navegador e fica no localStorage.
 * Pra cada sala (campaign), o player se associa ao display_name escolhido.
 */

const CLIENT_ID_KEY = "lavierta:clientId";
const LAST_ROOM_KEY = "lavierta:lastRoomCode";
const PLAYER_NAME_KEY = (campaignId: string) => `lavierta:player:${campaignId}:name`;

export function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export function getLastRoomCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_ROOM_KEY);
}

export function setLastRoomCode(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ROOM_KEY, code);
}

export function getPlayerNameForRoom(campaignId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PLAYER_NAME_KEY(campaignId));
}

export function setPlayerNameForRoom(campaignId: string, name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PLAYER_NAME_KEY(campaignId), name);
}

export const SUGESTOES_NOMES = [
  "Humberto",
  "Yumi",
  "Luiz",
  "Nelson",
];
