import { NextResponse } from "next/server";

export const runtime = "edge";

type Body = {
  text: string;
  voice?: "onyx" | "echo" | "fable" | "alloy" | "nova" | "shimmer";
  speed?: number;
};

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
    // Limite OpenAI: 4096 chars por call
    const cleanText = text.trim().slice(0, 4000);

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

    const audioBuf = await r.arrayBuffer();
    return new Response(audioBuf, {
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
