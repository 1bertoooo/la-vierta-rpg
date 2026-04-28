import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
  quality?: "low" | "medium" | "high";
};

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
    const { prompt, size = "1024x1024", quality = "low" } = body;
    if (!prompt?.trim()) {
      return NextResponse.json({ error: "prompt vazio" }, { status: 400 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada" }, { status: 500 });
    }

    // gpt-image-1 — modelo de imagem novo, qualidade alta, custo baixo (~$0.011 low)
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 50_000);

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
      let data: { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return NextResponse.json(
          { error: `resposta inválida ${r.status}: ${raw.slice(0, 100)}` },
          { status: 502 }
        );
      }

      if (!r.ok) {
        return NextResponse.json(
          { error: data.error?.message || `OpenAI ${r.status}` },
          { status: 502 }
        );
      }

      const item = data.data?.[0];
      if (!item) {
        return NextResponse.json({ error: "sem dados de imagem" }, { status: 502 });
      }

      // gpt-image-1 retorna b64_json por padrão
      if (item.b64_json) {
        return NextResponse.json({ b64: item.b64_json, mimeType: "image/png" });
      }
      if (item.url) {
        return NextResponse.json({ url: item.url });
      }
      return NextResponse.json({ error: "formato inesperado" }, { status: 502 });
    } finally {
      clearTimeout(tid);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
