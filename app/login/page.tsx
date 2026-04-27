"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) throw authError;
      setStatus("sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setError(msg);
      setStatus("error");
    }
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 pergaminho-texture">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.8)_100%)]" />

      <div className="relative z-10 w-full max-w-md epico-entrada">
        <div className="text-center mb-8">
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] transition"
          >
            ← Voltar
          </Link>
          <h1 className="mt-6 text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow">
            Portões de Vélreth
          </h1>
          <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent my-6" />
          <p className="text-[var(--color-pergaminho)] italic text-sm">
            Apresenta o pergaminho com tua marca, viajante.
          </p>
        </div>

        {status === "sent" ? (
          <div className="bg-[var(--color-floresta)]/20 border border-[var(--color-dourado)]/50 rounded p-6 text-center">
            <p className="text-[var(--color-dourado-claro)] mb-2 font-[family-name:var(--font-cinzel)] tracking-wide">
              Pergaminho enviado.
            </p>
            <p className="text-sm text-[var(--color-pergaminho)]">
              Verifica tua caixa-mensageira (<span className="text-[var(--color-dourado)]">{email}</span>) — o portal aguarda.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teu.email@reino.lv"
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
              disabled={status === "loading"}
            />

            <button
              type="submit"
              disabled={status === "loading"}
              className="btn-selo w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Selando o pergaminho..." : "Enviar pergaminho"}
            </button>

            {error && (
              <p className="text-[var(--color-sangue)] text-sm text-center mt-4">
                {error}
              </p>
            )}
          </form>
        )}

        <p className="mt-8 text-xs text-center text-[var(--color-pedra)] tracking-wide">
          Apenas membros da Liga dos Quatro têm passagem.
        </p>
      </div>
    </main>
  );
}
