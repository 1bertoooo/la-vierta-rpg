import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  text: string;
  voice?: "onyx" | "echo" | "fable" | "alloy" | "nova" | "shimmer";
  speed?: number;
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BUCKET = "tts-cache";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function publicUrl(filename: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
}

async function existsInCache(filename: string): Promise<boolean> {
  if (!SUPABASE_URL) return false;
  try {
    const r = await fetch(publicUrl(filename), { method: "HEAD" });
    return r.ok;
  } catch {
    return false;
  }
}

async function uploadToCache(filename: string, audio: ArrayBuffer): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
      },
      body: audio,
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { text, voice = "onyx", speed = 0.95 } = (await req.json()) as Body;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 500 });
    }
    if (!text?.trim()) {
      return NextResponse.json({ error: "texto vazio" }, { status: 400 });
    }
    const cleanText = text.trim().slice(0, 4000);

    // 1. Hash do conteúdo (text + voice + speed) — define o nome do arquivo
    const hash = await sha256Hex(`${voice}|${speed}|${cleanText}`);
    const filename = `${hash}.mp3`;

    // 2. Cache hit: retorna URL pública direto
    const cached = await existsInCache(filename);
    if (cached) {
      return NextResponse.json({
        url: publicUrl(filename),
        cached: true,
      });
    }

    // 3. Cache miss: gera no OpenAI
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: cleanText,
        voice,
        response_format: "mp3",
        speed,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      return NextResponse.json({ error: `tts: ${r.status} ${err.slice(0, 200)}` }, { status: 502 });
    }
    const audio = await r.arrayBuffer();

    // 4. Salva no cache (best-effort — se falhar, ainda retorna o áudio)
    const uploaded = await uploadToCache(filename, audio);

    if (uploaded) {
      return NextResponse.json({
        url: publicUrl(filename),
        cached: false,
      });
    }

    // 5. Fallback: se upload falhou, retorna áudio inline (cliente baixa direto)
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
