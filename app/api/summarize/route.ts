import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Sumário rolante de campanha — anti-voice-drift do LLM.
 *
 * Quando o log da sessão atinge 30+ eventos desde o último sumário, o frontend
 * chama esse endpoint. Ele puxa os últimos N eventos, pede pra gpt-4o-mini
 * compactar em um briefing denso (NPCs vivos/mortos, decisões, callbacks
 * pendentes, sementes plantadas, estado das stakes).
 *
 * O sumário fica em sessions.summary e é injetado no prompt da DM-IA pra
 * recuperar memória sem inflar o context window com 100+ mensagens.
 */

type Body = {
  session_id: string;
  campaign_id: string;
};

type LogEvent = {
  actor_type: string;
  event_type: string;
  payload: { text?: string; nick?: string };
  created_at: string;
};

export async function POST(req: NextRequest) {
  try {
    const { session_id, campaign_id } = (await req.json()) as Body;
    if (!session_id || !campaign_id) {
      return NextResponse.json({ error: "session_id e campaign_id obrigatórios" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "supabase não configurado" }, { status: 500 });
    }
    const sb = createClient(url, serviceKey);

    // Estado atual
    const { data: sess } = await sb.from("sessions")
      .select("summary, summary_event_count")
      .eq("id", session_id)
      .maybeSingle();
    const prevSummary = (sess as { summary?: string } | null)?.summary || "";

    // Últimos 50 eventos (depois cortamos o que faz sentido)
    const { data: events } = await sb.from("combat_log")
      .select("actor_type, event_type, payload, created_at")
      .eq("session_id", session_id)
      .order("created_at", { ascending: true })
      .limit(60);
    const evs = (events as LogEvent[]) || [];
    if (evs.length < 10) {
      return NextResponse.json({ skipped: "log curto demais" });
    }

    // Estado complementar
    const [npcsR, questsR, charsR] = await Promise.all([
      sb.from("npc_journal").select("name, appearance, bordao, relation").eq("campaign_id", campaign_id),
      sb.from("quests").select("title, status").eq("campaign_id", campaign_id),
      sb.from("characters").select("name, race, class, hp_current, hp_max, level, conditions").eq("campaign_id", campaign_id),
    ]);

    // Compacta o log num formato textual
    const logText = evs.slice(-40).map((e) => {
      if (e.actor_type === "dm") return `[Mestre]: ${(e.payload?.text || "").slice(0, 300)}`;
      if (e.actor_type === "player" && e.event_type === "speak") return `[${e.payload?.nick || "?"}]: ${(e.payload?.text || "").slice(0, 200)}`;
      if (e.actor_type === "player" && e.event_type === "roll") return `[${e.payload?.nick || "?"} 🎲]: ${(e.payload?.text || "").slice(0, 100)}`;
      if (e.actor_type === "system") return `[sistema]: ${(e.payload?.text || "").slice(0, 100)}`;
      return "";
    }).filter(Boolean).join("\n");

    const npcsTxt = ((npcsR.data as { name: string; appearance?: string; bordao?: string; relation?: number }[]) || [])
      .map((n) => `${n.name}${n.appearance ? ` (${n.appearance.slice(0, 60)})` : ""}${n.bordao ? ` "${n.bordao}"` : ""}${n.relation ? ` rel:${n.relation}` : ""}`)
      .join("; ") || "(nenhum)";
    const questsTxt = ((questsR.data as { title: string; status: string }[]) || [])
      .map((q) => `${q.status === "completed" ? "✓" : "○"} ${q.title}`)
      .join("; ") || "(nenhum)";
    const charsTxt = ((charsR.data as { name: string; race: string; class: string; hp_current: number; hp_max: number; level: number; conditions?: { name: string }[] }[]) || [])
      .map((c) => `${c.name} (${c.race}/${c.class} N${c.level} HP${c.hp_current}/${c.hp_max}${c.conditions?.length ? ` cond:${c.conditions.map((x) => x.name).join(",")}` : ""})`)
      .join("; ");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY ausente" }, { status: 500 });
    }

    const systemPrompt = `Você é o "Cronista" da campanha La Vierta — um arquivista que lê a sessão e escreve um briefing denso pra o Mestre IA usar como memória ativa. NÃO conta a história em prosa; LISTA fatos e ganchos pendentes. Português brasileiro.

Use seções obrigatórias:

**STATUS DOS PERSONAGENS**
**NPCs E RELAÇÕES** (vivos, mortos, atitude atual)
**DECISÕES IMPORTANTES TOMADAS**
**MISSÕES ATIVAS**
**SEMENTES PLANTADAS / CALLBACKS PENDENTES** (frases, objetos, símbolos lançados que ainda não pagaram)
**SEGREDOS REVELADOS / EM JOGO**
**TOM ATUAL** (mood, doom percebido)

Máx 350 palavras. Densidade > prosa. Use bullets curtos. Inclua NOMES e DETALHES — não generalize.`;

    const userPrompt = `## SUMÁRIO ANTERIOR (atualize se ainda válido):
${prevSummary || "(primeira vez)"}

## PERSONAGENS:
${charsTxt}

## NPCs CONHECIDOS:
${npcsTxt}

## QUESTS:
${questsTxt}

## EVENTOS DA SESSÃO (últimos 40):
${logText}

Reescreva o briefing completo, integrando o anterior com o que aconteceu de novo. Mantenha curto, denso, factual.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
        temperature: 0.4,
      }),
    });

    if (!r.ok) {
      const errBody = await r.text();
      return NextResponse.json({ error: `openai ${r.status}: ${errBody.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    const novoSumario = (data.choices?.[0]?.message?.content || "").trim();
    if (!novoSumario) {
      return NextResponse.json({ error: "sumário vazio" }, { status: 502 });
    }

    await sb.from("sessions").update({
      summary: novoSumario,
      summary_updated_at: new Date().toISOString(),
      summary_event_count: evs.length,
    }).eq("id", session_id);

    return NextResponse.json({
      ok: true,
      summary_length: novoSumario.length,
      events_summarized: evs.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
