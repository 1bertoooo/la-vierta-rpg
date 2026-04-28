import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Transcrição de áudio do player via Whisper.
 * Recebe FormData com 'audio' (File). Retorna { text: string }.
 * Modelo: gpt-4o-mini-transcribe (mais barato e rápido que whisper-1).
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY ausente" }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("audio");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "campo 'audio' obrigatório" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "áudio vazio" }, { status: 400 });
    }
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "áudio muito grande (>25MB)" }, { status: 400 });
    }

    // Re-empacota com nome confiável (alguns browsers mandam blob sem name)
    const audioBlob = new Blob([await file.arrayBuffer()], { type: file.type || "audio/webm" });
    const ext = (file.type || "").includes("webm") ? "webm"
              : (file.type || "").includes("mp4") ? "m4a"
              : (file.type || "").includes("ogg") ? "ogg"
              : "webm";

    const fwd = new FormData();
    fwd.append("file", audioBlob, `acao.${ext}`);
    // gpt-4o-mini-transcribe é o mais econômico ($0.003/min); whisper-1 é fallback
    fwd.append("model", "gpt-4o-mini-transcribe");
    fwd.append("language", "pt");
    fwd.append("response_format", "json");

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fwd,
    });

    if (!r.ok) {
      const errBody = await r.text();
      // Fallback pra whisper-1 se o modelo novo não tá disponível
      if (r.status === 404 || r.status === 400) {
        const fwd2 = new FormData();
        fwd2.append("file", audioBlob, `acao.${ext}`);
        fwd2.append("model", "whisper-1");
        fwd2.append("language", "pt");
        fwd2.append("response_format", "json");
        const r2 = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: fwd2,
        });
        if (!r2.ok) {
          const e2 = await r2.text();
          return NextResponse.json({ error: `whisper-1 ${r2.status}: ${e2.slice(0, 200)}` }, { status: 502 });
        }
        const d2 = await r2.json();
        return NextResponse.json({ text: (d2.text || "").trim(), model: "whisper-1" });
      }
      return NextResponse.json({ error: `transcribe ${r.status}: ${errBody.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    return NextResponse.json({ text: (data.text || "").trim(), model: "gpt-4o-mini-transcribe" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
