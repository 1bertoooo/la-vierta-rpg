import { NextRequest } from "next/server";
import { VALID_MOODS } from "@/lib/moods";

export const runtime = "nodejs";
export const maxDuration = 30;

// Tracks Kevin MacLeod (Incompetech, CC BY 4.0) — Pixabay começou retornando 403
// Atribuição embutida no jogo (créditos no footer da landing).
// Cada URL foi verificada (200 OK) antes de adicionar.
const BASE = "https://incompetech.com/music/royalty-free/mp3-royaltyfree";
const MOOD_TRACKS: Record<string, string> = {
  // Locais
  tavern:    `${BASE}/Folk%20Round.mp3`,
  dungeon:   `${BASE}/Dark%20Times.mp3`,
  forest:    `${BASE}/Hidden%20Wonders.mp3`,
  city:      `${BASE}/Achaidh%20Cheide.mp3`,
  desert:    `${BASE}/Tafi%20Maradi.mp3`,
  sea:       `${BASE}/Sad%20Trio.mp3`,
  snow:      `${BASE}/Long%20Note%20Three.mp3`,
  mountain:  `${BASE}/Ascending%20the%20Vale.mp3`,
  palace:    `${BASE}/Egmont%20Overture.mp3`,
  temple:    `${BASE}/Echoes%20of%20Time.mp3`,
  swamp:     `${BASE}/Anguish.mp3`,
  cave:      `${BASE}/Ossuary%201%20-%20A%20Beginning.mp3`,
  // Estados
  battle:    `${BASE}/Crusade%20-%20Heavy%20Industry.mp3`,
  boss:      `${BASE}/Hitman.mp3`,
  calm:      `${BASE}/Easy%20Lemon.mp3`,
  mystery:   `${BASE}/Investigations.mp3`,
  romance:   `${BASE}/Anamalie.mp3`,
  ritual:    `${BASE}/Echoes%20of%20Time.mp3`,
  tragic:    `${BASE}/Decline.mp3`,
  victory:   `${BASE}/Heroic%20Age.mp3`,
  chase:     `${BASE}/Volatile%20Reaction.mp3`,
  horror:    `${BASE}/Anguish.mp3`,
  stealth:   `${BASE}/Spy%20Glass.mp3`,
  epic:      `${BASE}/The%20Path%20of%20the%20Goblin%20King.mp3`,
  dread:     `${BASE}/Decline.mp3`,
  crowd:     `${BASE}/Tafi%20Maradi.mp3`,
  noble:     `${BASE}/Lord%20of%20the%20Land.mp3`,
  prayer:    `${BASE}/Long%20Note%20Three.mp3`,
  memory:    `${BASE}/Hidden%20Wonders.mp3`,
  ascension: `${BASE}/Adventure%20Meme.mp3`,
};

export async function GET(req: NextRequest) {
  const mood = req.nextUrl.searchParams.get("mood") || "tavern";
  if (!VALID_MOODS.has(mood)) {
    return new Response(JSON.stringify({ error: "mood inválido", mood }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = MOOD_TRACKS[mood] || MOOD_TRACKS.tavern;

  try {
    // Repassa Range request do browser pro upstream (suporte a seek e streaming)
    const range = req.headers.get("range");
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; LaVierta/1.0)",
    };
    if (range) upstreamHeaders["Range"] = range;

    const r = await fetch(url, { headers: upstreamHeaders });
    if (!r.ok && r.status !== 206) {
      return new Response(JSON.stringify({ error: `upstream ${r.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // STREAM em vez de carregar tudo em memória.
    // Browser começa a tocar assim que tiver bytes suficientes (1-2 segundos).
    const headers: Record<string, string> = {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD",
      "Accept-Ranges": "bytes",
    };
    const cl = r.headers.get("content-length");
    if (cl) headers["Content-Length"] = cl;
    const cr = r.headers.get("content-range");
    if (cr) headers["Content-Range"] = cr;

    return new Response(r.body, {
      status: r.status,
      headers,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function HEAD(req: NextRequest) {
  // HEAD: só checa upstream sem stream, retorna headers
  const mood = req.nextUrl.searchParams.get("mood") || "tavern";
  if (!VALID_MOODS.has(mood)) return new Response(null, { status: 400 });
  const url = MOOD_TRACKS[mood] || MOOD_TRACKS.tavern;
  try {
    const r = await fetch(url, { method: "HEAD", headers: { "User-Agent": "Mozilla/5.0" } });
    return new Response(null, {
      status: r.status,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": r.headers.get("content-length") || "0",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
