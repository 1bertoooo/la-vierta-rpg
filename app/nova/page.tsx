"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import { setLastRoomCode } from "@/lib/player";

const LORE_INTRO_PADRAO =
  "Uma nova fenda se abriu em Vélreth. A Liga dos Quatro da Élite é convocada novamente — desta vez, para reescrever a história. O passado fica para trás. O que importa é o que vem agora.";

function gerarCodigo() {
  const palavras = ["chama", "lua", "lobo", "espada", "raio", "neve", "sangue", "cinza"];
  const p = palavras[Math.floor(Math.random() * palavras.length)];
  const n = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${p}-${n}`;
}

export default function NovaSalaPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setNome("Nova Aventura");
  }, []);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setCriando(true);
    setErro(null);
    try {
      const sb = getSupabase();
      const code = gerarCodigo().toLowerCase();
      const { data, error } = await sb
        .from("campaigns")
        .insert({
          name: nome.trim(),
          code,
          lore_intro: LORE_INTRO_PADRAO,
        })
        .select("code")
        .single();
      if (error) throw error;
      setLastRoomCode(data.code);
      router.push(`/sala/${data.code}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar sala";
      setErro(msg);
      setCriando(false);
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
          Nova Aventura
        </h1>
        <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent my-6" />
        <p className="text-[var(--color-pergaminho)] italic text-sm text-center mb-8">
          Uma nova sala, um novo mundo. Os antigos heróis ficam guardados — esta é uma página
          em branco.
        </p>

        <form onSubmit={criar} className="space-y-4">
          <input
            type="text"
            required
            minLength={2}
            maxLength={60}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da campanha"
            className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
            disabled={criando}
          />

          <button
            type="submit"
            disabled={criando}
            className="btn-selo w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {criando ? "Forjando reino…" : "Forjar nova sala"}
          </button>

          {erro && (
            <p className="text-[var(--color-sangue)] text-sm text-center mt-4">{erro}</p>
          )}
        </form>

        <p className="mt-8 text-xs text-center text-[var(--color-pedra)] tracking-wide">
          A sala antiga continua existindo — você pode voltar a ela depois pela URL.
        </p>
      </div>
    </main>
  );
}
