import { NextResponse } from "next/server";
import { DM_CORE, selectRelevantLore } from "@/lib/dm-prompt";

// Node runtime tem timeout 60s na Hobby (vs 25s no edge); preferimos pra GPT-5
export const runtime = "nodejs";
export const maxDuration = 60;

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

type ProviderConfig = {
  url: string;
  apiKey: string | undefined;
  model: string;
  name: "openai" | "groq" | "anthropic";
};

function pickProviders(): ProviderConfig[] {
  const desired = (process.env.DM_PROVIDER || "openai").toLowerCase();

  const configs: Record<string, ProviderConfig> = {
    openai: {
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: process.env.OPENAI_API_KEY,
      // gpt-5-mini é mais rápido e mais barato; ainda mantém qualidade alta
      model: process.env.DM_MODEL || "gpt-5-mini",
      name: "openai",
    },
    groq: {
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.DM_MODEL_FALLBACK || "llama-3.3-70b-versatile",
      name: "groq",
    },
    anthropic: {
      url: "https://api.anthropic.com/v1/messages",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.DM_MODEL || "claude-sonnet-4-6",
      name: "anthropic",
    },
  };

  const primary = configs[desired];
  const order: ProviderConfig[] = [];
  if (primary?.apiKey) order.push(primary);
  for (const key of ["openai", "groq", "anthropic"]) {
    const cfg = configs[key];
    if (cfg.apiKey && !order.find((p) => p.name === cfg.name)) {
      order.push(cfg);
    }
  }
  return order;
}

async function callOpenAI(cfg: ProviderConfig, messages: Msg[]): Promise<string> {
  const isGPT5 = cfg.model.startsWith("gpt-5");
  // reasoning_effort: low gera mais rápido (cabe em 25-50s) e ainda mantém qualidade boa
  const body = isGPT5
    ? {
        model: cfg.model,
        messages,
        max_completion_tokens: 3000,
        reasoning_effort: "low",
      }
    : {
        model: cfg.model,
        messages,
        max_tokens: 900,
        temperature: 0.92,
        top_p: 0.96,
        presence_penalty: 0.3,
        frequency_penalty: 0.2,
      };

  // Timeout client-side em 50s pra dar fallback antes do edge timeout
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 50_000);

  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      throw new Error(`${cfg.name} ${r.status}: ${errText.slice(0, 200)}`);
    }
    const data = await r.json();
    return data.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callAnthropic(cfg: ProviderConfig, systemPrompt: string, userMessages: Msg[]): Promise<string> {
  const body = {
    model: cfg.model,
    max_tokens: 900,
    temperature: 0.85,
    system: systemPrompt,
    messages: userMessages.map((m) => ({
      role: m.role === "system" ? "user" : m.role,
      content: m.content,
    })),
  };
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 50_000);
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "x-api-key": cfg.apiKey!,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      throw new Error(`anthropic ${r.status}: ${errText.slice(0, 200)}`);
    }
    const data = await r.json();
    return data.content?.[0]?.text || "";
  } finally {
    clearTimeout(tid);
  }
}

export async function POST(req: Request) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const { messages, context } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages vazio" }, { status: 400 });
    }

    const lastUserMsg = messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join(" ");
    const lore = selectRelevantLore(lastUserMsg);

    let ctxStr = "";
    if (context) {
      const parts: string[] = [];
      if (context.campaign_name) parts.push(`Campanha: ${context.campaign_name}`);
      if (context.current_location) parts.push(`Local: ${context.current_location}`);
      if (context.chapter) parts.push(`Capítulo: ${context.chapter}`);
      if (context.players?.length) {
        parts.push("Jogadores:");
        for (const p of context.players) {
          if (p.character) {
            parts.push(`- ${p.character.name} (${p.character.race}/${p.character.class}, HP ${p.character.hp}/${p.character.hp_max}) por ${p.nick}`);
          } else {
            parts.push(`- ${p.nick} (sem ficha)`);
          }
        }
      }
      ctxStr = "\n\n## CONTEXTO\n" + parts.join("\n");
    }

    const systemPrompt = `${DM_CORE}\n\n${lore}${ctxStr}`;
    const truncated = messages.slice(-12);

    const providers = pickProviders();
    if (providers.length === 0) {
      return NextResponse.json(
        { error: "Nenhum provedor configurado. Setar OPENAI_API_KEY ou GROQ_API_KEY." },
        { status: 500 }
      );
    }

    const errors: string[] = [];

    for (const cfg of providers) {
      try {
        let text: string;
        if (cfg.name === "anthropic") {
          text = await callAnthropic(cfg, systemPrompt, truncated);
        } else {
          const fullMessages: Msg[] = [
            { role: "system", content: systemPrompt },
            ...truncated,
          ];
          text = await callOpenAI(cfg, fullMessages);
        }

        // Se text veio vazio (modelo só fez reasoning), tenta próximo
        if (!text || text.trim().length < 10) {
          errors.push(`${cfg.name}/${cfg.model}: resposta vazia`);
          continue;
        }

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
          provider: cfg.name,
          model: cfg.model,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${cfg.name}/${cfg.model}: ${msg.slice(0, 100)}`);
        continue;
      }
    }

    return NextResponse.json(
      { error: "Todos os provedores falharam", details: errors },
      { status: 502 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // GARANTE que o response sempre é JSON válido, nunca texto solto
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
