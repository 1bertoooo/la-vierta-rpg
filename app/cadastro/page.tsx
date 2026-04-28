"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

const NICK_REGEX = /^[a-zA-Z0-9_-]{2,30}$/;

function CadastroInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/sala/velreth-elite";

  const [nick, setNick] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emailEnviado, setEmailEnviado] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const nickLimpo = nick.trim().toLowerCase();
    if (!NICK_REGEX.test(nickLimpo)) {
      setErro("Nick: 2 a 30 caracteres, só letras, números, _ ou -.");
      return;
    }

    setLoading(true);
    try {
      const sb = getSupabase();

      // Verifica se nick já existe
      const { data: existing } = await sb.rpc("email_by_nick", {
        p_nick: nickLimpo,
      });
      if (existing) {
        setErro("Esse nick já tá em uso. Escolhe outro.");
        setLoading(false);
        return;
      }

      // Email sintético baseado no nick
      const emailSintetico = `${nickLimpo}@lavierta.app`;

      const { data, error } = await sb.auth.signUp({
        email: emailSintetico,
        password: senha,
        options: {
          data: { nick: nickLimpo },
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}/sala/velreth-elite`
              : undefined,
        },
      });
      if (error) throw error;

      if (data.session) {
        router.push(next);
        router.refresh();
        return;
      }

      // Email confirmation pode estar habilitada — mas como o email é sintético, não vai chegar.
      // Tenta logar direto:
      const { error: loginErr } = await sb.auth.signInWithPassword({
        email: emailSintetico,
        password: senha,
      });
      if (!loginErr) {
        router.push(next);
        router.refresh();
        return;
      }
      setEmailEnviado(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar conta";
      setErro(traduzirErro(msg));
      setLoading(false);
    }
  }

  if (emailEnviado) {
    return (
      <main className="relative flex-1 flex items-center justify-center px-6 pergaminho-texture">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.8)_100%)]" />
        <div className="relative z-10 w-full max-w-md epico-entrada text-center">
          <h1 className="text-3xl md:text-4xl text-[var(--color-dourado-claro)] dourado-glow mb-6">
            Conta forjada
          </h1>
          <div className="bg-[var(--color-floresta)]/20 border border-[var(--color-dourado)]/50 rounded p-6">
            <p className="text-[var(--color-pergaminho)] mb-2">
              Conta criada como{" "}
              <span className="text-[var(--color-dourado)]">{nick}</span>.
            </p>
            <p className="text-sm text-[var(--color-pergaminho-velho)]">
              Vai pra Entrar e usa teu nick + senha.
            </p>
          </div>
          <Link href="/login" className="btn-selo inline-block mt-8">
            Entrar agora
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex-1 flex items-center justify-center px-6 pergaminho-texture">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.8)_100%)]" />

      <div className="relative z-10 w-full max-w-md epico-entrada">
        <Link
          href="/"
          className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] transition"
        >
          ← Voltar
        </Link>
        <h1 className="mt-6 text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow text-center">
          Forjar Conta
        </h1>
        <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent my-6" />
        <p className="text-[var(--color-pergaminho)] italic text-sm text-center mb-8">
          Escolhe teu nome verdadeiro neste reino.
        </p>

        <form onSubmit={cadastrar} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
              Nick (teu nome neste reino)
            </label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={30}
              autoComplete="username"
              placeholder="ex: yumi, luiz, nelson"
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
            />
            <p className="text-xs text-[var(--color-pedra)] mt-1.5">
              Só letras, números, _ ou -. Vai ser teu login.
            </p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
              Senha (mín. 6)
            </label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="•••••••"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-selo w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Forjando…" : "Forjar conta"}
          </button>

          {erro && (
            <p className="text-[var(--color-sangue)] text-sm text-center mt-4">{erro}</p>
          )}
        </form>

        <div className="mt-8 text-center text-sm">
          <p className="text-[var(--color-pergaminho-velho)]">
            Já tens passagem?{" "}
            <Link
              href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)] underline underline-offset-4"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function traduzirErro(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("already registered") || lower.includes("user already"))
    return "Esse nick já tem conta — vai pra Entrar.";
  if (lower.includes("password") && lower.includes("short"))
    return "Senha muito curta (mín. 6 caracteres).";
  if (lower.includes("nick") && lower.includes("unique"))
    return "Esse nick já existe — escolhe outro.";
  return msg;
}

export default function CadastroPage() {
  return (
    <Suspense fallback={null}>
      <CadastroInner />
    </Suspense>
  );
}
