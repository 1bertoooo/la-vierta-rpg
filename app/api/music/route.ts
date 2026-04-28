import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Tracks Pixabay — proxy server-side resolve CORS
const MOOD_TRACKS: Record<string, string> = {
  tavern: "https://cdn.pixabay.com/audio/2024/02/05/audio_e0fb0d80b9.mp3",
  dungeon: "https://cdn.pixabay.com/audio/2023/02/28/audio_99e9d4d4ca.mp3",
  forest: "https://cdn.pixabay.com/audio/2024/02/22/audio_5b0ee5c9dd.mp3",
  city: "https://cdn.pixabay.com/audio/2024/02/05/audio_e0fb0d80b9.mp3",
  desert: "https://cdn.pixabay.com/audio/2022/03/24/audio_d11e87a9ec.mp3",
  sea: "https://cdn.pixabay.com/audio/2022/03/15/audio_92a5f54849.mp3",
  snow: "https://cdn.pixabay.com/audio/2024/02/22/audio_5b0ee5c9dd.mp3",
  mountain: "https://cdn.pixabay.com/audio/2024/02/14/audio_e83d51c02b.mp3",
  palace: "https://cdn.pixabay.com/audio/2022/03/15/audio_92a5f54849.mp3",
  temple: "https://cdn.pixabay.com/audio/2023/02/28/audio_99e9d4d4ca.mp3",
  swamp: "https://cdn.pixabay.com/audio/2022/10/14/audio_dafd2d9bad.mp3",
  cave: "https://cdn.pixabay.com/audio/2023/02/28/audio_99e9d4d4ca.mp3",
  battle: "https://cdn.pixabay.com/audio/2023/07/30/audio_e1ff09da95.mp3",
  boss: "https://cdn.pixabay.com/audio/2024/02/14/audio_e83d51c02b.mp3",
  calm: "https://cdn.pixabay.com/audio/2024/02/22/audio_5b0ee5c9dd.mp3",
  mystery: "https://cdn.pixabay.com/audio/2022/10/14/audio_dafd2d9bad.mp3",
  romance: "https://cdn.pixabay.com/audio/2022/03/24/audio_d11e87a9ec.mp3",
  ritual: "https://cdn.pixabay.com/audio/2023/02/28/audio_99e9d4d4ca.mp3",
  tragic: "https://cdn.pixabay.com/audio/2022/03/24/audio_d11e87a9ec.mp3",
  victory: "https://cdn.pixabay.com/audio/2023/07/30/audio_e1ff09da95.mp3",
  chase: "https://cdn.pixabay.com/audio/2023/07/30/audio_e1ff09da95.mp3",
  horror: "https://cdn.pixabay.com/audio/2022/10/14/audio_dafd2d9bad.mp3",
  stealth: "https://cdn.pixabay.com/audio/2022/10/14/audio_dafd2d9bad.mp3",
  epic: "https://cdn.pixabay.com/audio/2024/02/14/audio_e83d51c02b.mp3",
  dread: "https://cdn.pixabay.com/audio/2022/10/14/audio_dafd2d9bad.mp3",
  crowd: "https://cdn.pixabay.com/audio/2024/02/05/audio_e0fb0d80b9.mp3",
  noble: "https://cdn.pixabay.com/audio/2022/03/15/audio_92a5f54849.mp3",
  prayer: "https://cdn.pixabay.com/audio/2024/02/22/audio_5b0ee5c9dd.mp3",
  memory: "https://cdn.pixabay.com/audio/2022/03/24/audio_d11e87a9ec.mp3",
  ascension: "https://cdn.pixabay.com/audio/2024/02/14/audio_e83d51c02b.mp3",
};

export async function GET(req: NextRequest) {
  const mood = req.nextUrl.searchParams.get("mood") || "tavern";
  const url = MOOD_TRACKS[mood];

  if (!url) {
    return new Response(JSON.stringify({ error: "mood inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaVierta/1.0)" },
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `upstream ${r.status}` }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    const audio = await r.arrayBuffer();
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD",
      },
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
  return GET(req);
}
