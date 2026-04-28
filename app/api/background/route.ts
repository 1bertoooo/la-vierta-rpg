import { NextResponse } from "next/server";

export const runtime = "edge";

type Body = {
  raca: string;
  classe: string;
  nome: string;
  sexo: string;
  respostas: Record<string, string>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const { raca, classe, nome, sexo, respostas } = body;

    const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY;
    const provider = process.env.OPENAI_API_KEY ? "openai" : "groq";
    const url = provider === "openai"
      ? "https://api.openai.com/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";
    const model = provider === "openai" ? "gpt-5-mini" : "llama-3.3-70b-versatile";

    if (!apiKey) {
      return NextResponse.json({ error: "Sem API key configurada" }, { status: 500 });
    }

    const respostasTexto = Object.entries(respostas)
      .filter(([, v]) => v && v.trim())
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n");

    const systemPrompt = `Tu és um escritor de fantasia épica brasileiro. Vai criar a história de fundo (background) de um personagem de RPG no mundo de **Vélreth** — um reino encantado quebrado pela Bruna a Pandórica.

## TOM
50% épico-clássico, 25% humor negro com referências ao grupo Élite (4 amigos: Humberto, Yumi, Luiz, Nelson), 15% sombrio-moral, 10% surto absurdo. Nunca cruel com o personagem; sempre auto-deprecativo.

## LUGARES (cite os relevantes ao background)
- Nilópolis Sagrada (capital natal), Porto Freguesia (templo de NA), Baixada Sombria, Amarelinho (taverna), Miguel-Couto (escola-fortaleza), Chinatown do Exílio (norte), Copacabana Maldita, Boate Gay de SP

## PESSOAS DE VÉLRETH (cite uma se fizer sentido)
Mestre Anderson (padrinho NA), Seu Sérgio do Brechó, Bia (princesa em perigo), Diego das Sombras, Bruna a Pandórica

## FORMATO
- 2-4 parágrafos, 200-400 palavras.
- Ficção em terceira pessoa, no passado.
- Termina com 1 motivação clara que empurra o personagem pra aventura.
- Pode incorporar bordões: "ó a empatia", "tô na reunião", "o bonzinho sempre toma no cu", "tu falou q n ia".`;

    const userPrompt = `Cria a história de fundo para:
- Nome: ${nome}
- Raça: ${raca}
- Classe: ${classe}
- Sexo/Gênero: ${sexo}

## RESPOSTAS DO JOGADOR
${respostasTexto || "(jogador não respondeu — invente algo coerente com a raça e classe)"}

Escreve a história agora, sem títulos nem bullets — só prosa fluida.`;

    const isGPT5 = model.startsWith("gpt-5");
    const reqBody = isGPT5
      ? {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: 1500,
          reasoning_effort: "low",
        }
      : {
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 800,
          temperature: 0.9,
        };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reqBody),
    });
    if (!r.ok) {
      const err = await r.text();
      return NextResponse.json({ error: `${provider} ${r.status}: ${err.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "";
    return NextResponse.json({ text, provider, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
