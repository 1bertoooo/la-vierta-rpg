import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "low" | "medium" | "high";
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const BUCKET = "portraits";

function publicUrl(filename: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
}

async function uploadToBucket(filename: string, png: ArrayBuffer): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
        "Content-Type": "image/png",
        "x-upsert": "true",
      },
      body: png,
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const { prompt, size = "1024x1024", quality = "low" } = (await req.json()) as Body;
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt vazio" }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 500 });
    }

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 55_000);

    try {
      const r = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          prompt,
          n: 1,
          size,
          quality,
        }),
        signal: ctrl.signal,
      });

      const raw = await r.text();
      let data: { data?: { b64_json?: string }[]; error?: { message?: string } } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return NextResponse.json({ error: `resposta inválida ${r.status}` }, { status: 502 });
      }
      if (!r.ok) {
        return NextResponse.json({ error: data.error?.message || `OpenAI ${r.status}` }, { status: 502 });
      }
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) {
        return NextResponse.json({ error: "sem b64" }, { status: 502 });
      }

      // Decode b64 -> binary
      const binary = Buffer.from(b64, "base64");
      const filename = `portrait_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.png`;

      const uploaded = await uploadToBucket(filename, binary);
      if (uploaded) {
        return NextResponse.json({ url: publicUrl(filename) });
      }
      // Fallback: devolve b64 inline se upload falhar
      return NextResponse.json({ b64, mimeType: "image/png" });
    } finally {
      clearTimeout(tid);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
