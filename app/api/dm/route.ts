import { NextResponse } from "next/server";
import { DM_SYSTEM_PROMPT } from "@/lib/dm-prompt";

export const runtime = "edge";

type Msg = { role: "user" | "assistant" | "system"; content: string };

type Body = {
  messages: Msg[];
  context?: {
    campaign_name?: string;
    current_location?: string;
    chapter?: number;
    players?: { nick: string; character?: { name: string; race: string; class: string; hp: number; hp_max: number } }[];
  };
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { messages, context } = body;
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY missing" }, { status: 500 });
    }

    // Monta system prompt + contexto da sala
    let systemPrompt = DM_SYSTEM_PROMPT;
    if (context) {
      const ctxParts: string[] = ["", "## CONTEXTO ATUAL"];
      if (context.campaign_name) ctxParts.push(`Campanha: ${context.campaign_name}`);
      if (context.current_location) ctxParts.push(`Local: ${context.current_location}`);
      if (context.chapter) ctxParts.push(`Capítulo: ${context.chapter}`);
      if (context.players?.length) {
        ctxParts.push("Jogadores presentes:");
        for (const p of context.players) {
          if (p.character) {
            ctxParts.push(
              `- ${p.character.name} (${p.character.race}/${p.character.class}, HP ${p.character.hp}/${p.character.hp_max}) — controlado por ${p.nick}`
            );
          } else {
            ctxParts.push(`- ${p.nick} (sem personagem ainda)`);
          }
        }
      }
      systemPrompt += "\n" + ctxParts.join("\n");
    }

    const fullMessages: Msg[] = [
      { role: "system", content: systemPrompt },
      ...messages.slice(-30), // últimas 30 mensagens
    ];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: fullMessages,
        temperature: 0.85,
        max_tokens: 600,
        top_p: 0.95,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      return NextResponse.json(
        { error: `Groq API error: ${groqResponse.status} ${errText}` },
        { status: 502 }
      );
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content || "";

    // Extrai diretivas
    const rollMatch = text.match(/\[ROLL:\s*([^\]]+)\]/i);
    const combateInicia = /\[COMBATE INICIA\]/i.test(text);
    const musicMatch = text.match(/\[MUSICA:\s*([^\]]+)\]/i);

    return NextResponse.json({
      text,
      directives: {
        roll: rollMatch ? rollMatch[1].trim() : null,
        combat_start: combateInicia,
        music_mood: musicMatch ? musicMatch[1].trim() : null,
      },
      usage: data.usage,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
