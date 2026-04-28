"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { getLastRoomCode } from "@/lib/player";

const SALA_PADRAO = "velreth-elite";

export default function Home() {
  const [logged, setLogged] = useState<boolean | null>(null);
  const [lastRoom, setLastRoom] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    sb.auth.getUser().then(({ data }) => setLogged(!!data.user));
    setLastRoom(getLastRoomCode());

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setLogged(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const sala = lastRoom || SALA_PADRAO;

  return (
    <main className="relative flex-1 overflow-hidden flex flex-col items-center justify-center px-6 pergaminho-texture">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full bg-[var(--color-dourado)] brasa" style={{ animationDelay: "0s" }} />
        <div className="absolute top-1/3 right-1/3 w-1.5 h-1.5 rounded-full bg-[var(--color-sangue)] brasa" style={{ animationDelay: "1s" }} />
        <div className="absolute bottom-1/3 left-1/2 w-2 h-2 rounded-full bg-[var(--color-dourado-claro)] brasa" style={{ animationDelay: "2s" }} />
        <div className="absolute top-1/2 right-1/4 w-1 h-1 rounded-full bg-[var(--color-pergaminho-velho)] brasa" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-2/3 left-1/3 w-1.5 h-1.5 rounded-full bg-[var(--color-dourado)] brasa" style={{ animationDelay: "0.5s" }} />
      </div>

      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.7)_100%)]" />

      <div className="relative z-10 text-center epico-entrada max-w-3xl">
        <p className="text-[var(--color-pergaminho-velho)] text-xs md:text-sm tracking-[0.4em] uppercase mb-6">
          A Liga dos Quatro da Élite apresenta
        </p>

        <h1 className="text-6xl md:text-8xl lg:text-9xl font-bold text-[var(--color-dourado-claro)] dourado-glow mb-2 leading-none">
          La Vierta
        </h1>

        <p className="text-2xl md:text-3xl text-[var(--color-pergaminho)] italic mb-8 font-[family-name:var(--font-cinzel)] tracking-widest">
          O RPG
        </p>

        <div className="w-32 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent mb-8" />

        <p className="text-base md:text-lg text-[var(--color-pergaminho)] leading-relaxed mb-12 max-w-xl mx-auto">
          No princípio, o reino de{" "}
          <span className="text-[var(--color-dourado)]">Vélreth</span> vivia em harmonia.
          Até que <span className="text-[var(--color-sangue)] italic">Bruna, a Pandórica</span>,
          abriu a Caixa dos Sentimentos Não-Ditos. Desde então, cidades choram à noite,
          ex-amantes voltam sem avisar, e os artefatos sagrados são fragmentos de mensagens
          não-respondidas.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          {logged === null ? (
            <div className="h-[58px]" />
          ) : logged ? (
            <Link href={`/sala/${sala}`}>
              <button className="btn-selo">Retornar à Aventura</button>
            </Link>
          ) : (
            <>
              <Link href={`/login?next=${encodeURIComponent(`/sala/${sala}`)}`}>
                <button className="btn-selo">Entrar</button>
              </Link>
              <Link href={`/cadastro?next=${encodeURIComponent(`/sala/${sala}`)}`}>
                <button className="btn-selo-secundario">Forjar Conta</button>
              </Link>
            </>
          )}
        </div>

        <p className="mt-12 text-xs text-[var(--color-pedra)] tracking-widest">
          Versão 0.3 · Alpha · Apenas para a Élite
        </p>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 text-center text-xs text-[var(--color-pedra)]/60 z-10">
        Feito para Humberto, Yumi, Luiz e Nelson
      </footer>
    </main>
  );
}
