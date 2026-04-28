"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/sala/velreth-elite";

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (error) throw error;
      router.push(next);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao entrar";
      setErro(traduzirErro(msg));
      setLoading(false);
    }
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
          Portões de Vélreth
        </h1>
        <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent my-6" />
        <p className="text-[var(--color-pergaminho)] italic text-sm text-center mb-8">
          Apresenta tua marca de viajante.
        </p>

        <form onSubmit={entrar} className="space-y-4">
          <input
            type="email"
            required
            placeholder="teu.email@reino.lv"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="sua senha secreta"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
          />
          <button
            type="submit"
            disabled={loading}
            className="btn-selo w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Atravessando…" : "Atravessar o portão"}
          </button>

          {erro && (
            <p className="text-[var(--color-sangue)] text-sm text-center mt-4">{erro}</p>
          )}
        </form>

        <div className="mt-8 text-center text-sm">
          <p className="text-[var(--color-pergaminho-velho)]">
            Ainda não tens passagem?{" "}
            <Link
              href={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ""}`}
              className="text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)] underline underline-offset-4"
            >
              Forjar conta
            </Link>
          </p>
        </div>

        <p className="mt-12 text-xs text-center text-[var(--color-pedra)] tracking-wide">
          Apenas membros da Liga dos Quatro têm passagem.
        </p>
      </div>
    </main>
  );
}

function traduzirErro(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes("invalid login")) return "Email ou senha incorretos.";
  if (lower.includes("email not confirmed"))
    return "Email ainda não confirmado. Verifica tua caixa-mensageira.";
  if (lower.includes("too many"))
    return "Muitas tentativas. Espera um instante.";
  return msg;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
