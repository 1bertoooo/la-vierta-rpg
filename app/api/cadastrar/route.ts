import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cadastro server-side via service_role.
 * Bypassa o rate limit de signup público do Supabase (que estava bloqueando
 * usuários porque os emails sintéticos @lavierta.app pareciam abuso).
 *
 * Chama auth.admin.createUser que não tem rate limit por IP do cliente,
 * já marca email como confirmado, e seta metadata { nick }.
 */

const NICK_REGEX = /^[a-zA-Z0-9_-]{2,30}$/;

type Body = { nick: string; password: string };

export async function POST(req: NextRequest) {
  try {
    const { nick, password } = (await req.json()) as Body;
    if (!nick || !password) {
      return NextResponse.json({ error: "nick e password obrigatórios" }, { status: 400 });
    }
    const nickLimpo = nick.trim().toLowerCase();
    if (!NICK_REGEX.test(nickLimpo)) {
      return NextResponse.json({ error: "Nick: 2-30 caracteres, letras/números/_/-" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Senha mínima de 6 caracteres" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "service_role não configurado" }, { status: 500 });
    }
    const sb = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verifica se nick já existe
    const { data: existingByNick } = await sb.rpc("email_by_nick", { p_nick: nickLimpo });
    if (existingByNick) {
      return NextResponse.json({ error: "Esse nick já tá em uso" }, { status: 409 });
    }

    const email = `${nickLimpo}@lavierta.app`;

    // Cria via admin API — sem rate limit, email auto-confirmado
    const { data, error } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nick: nickLimpo },
    });

    if (error) {
      return NextResponse.json({
        error: error.message.includes("already") ? "Esse nick já existe" : error.message,
      }, { status: 400 });
    }

    // Garante que o profile foi criado (trigger normalmente faz, mas redundância)
    if (data.user) {
      await sb.from("profiles").upsert({
        id: data.user.id,
        email,
        nick: nickLimpo,
        role: "player",
      }, { onConflict: "id" });
    }

    return NextResponse.json({ ok: true, email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
