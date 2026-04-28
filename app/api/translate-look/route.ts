import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { text: string };

export async function POST(req: Request) {
  try {
    const { text } = (await req.json()) as Body;
    if (!text?.trim()) return NextResponse.json({ translated: "" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ translated: text });

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Translate the user's Portuguese physical description of an RPG character into a concise English Stable Diffusion prompt. Keep it under 25 words, comma-separated keywords. Focus on visual traits (hair color, eye color, skin tone, scars, tattoos, clothing details, build). Discard non-visual info. Output ONLY the English keywords, no explanations, no quotes.",
          },
          { role: "user", content: text.trim().slice(0, 500) },
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!r.ok) {
      // Fallback: retorna texto original
      return NextResponse.json({ translated: text });
    }
    const data = await r.json();
    const translated = (data.choices?.[0]?.message?.content || text).trim();
    return NextResponse.json({ translated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ translated: "", error: msg }, { status: 500 });
  }
}
