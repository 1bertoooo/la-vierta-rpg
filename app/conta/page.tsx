"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabase, type Profile } from "@/lib/supabase/client";

export default function ContaPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Edição de nick
  const [nick, setNick] = useState("");
  const [savingNick, setSavingNick] = useState(false);
  const [nickMsg, setNickMsg] = useState<string | null>(null);

  // Mudar senha
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [savingSenha, setSavingSenha] = useState(false);
  const [senhaMsg, setSenhaMsg] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const { data } = await sb
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setProfile(data as Profile);
        setNick((data as Profile).nick || "");
      }
      setLoading(false);
    })();
  }, [router]);

  async function salvarNick(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || nick.trim().length < 2) return;
    setSavingNick(true);
    setNickMsg(null);
    try {
      const sb = getSupabase();
      const { error } = await sb
        .from("profiles")
        .update({ nick: nick.trim() })
        .eq("id", profile.id);
      if (error) throw error;
      setProfile({ ...profile, nick: nick.trim() });
      setNickMsg("Nick atualizado.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      setNickMsg(
        msg.toLowerCase().includes("unique")
          ? "Esse nick já está em uso."
          : msg
      );
    } finally {
      setSavingNick(false);
    }
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    if (novaSenha.length < 6) {
      setSenhaMsg("Senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setSenhaMsg("As senhas não conferem.");
      return;
    }
    setSavingSenha(true);
    setSenhaMsg(null);
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      setNovaSenha("");
      setConfirmarSenha("");
      setSenhaMsg("Senha trocada.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      setSenhaMsg(msg);
    } finally {
      setSavingSenha(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center pergaminho-texture">
        <p className="text-[var(--color-pergaminho-velho)] italic">Carregando perfil…</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen px-6 py-8 pergaminho-texture">
      <div className="max-w-2xl mx-auto epico-entrada">
        <div className="flex items-center justify-between mb-12">
          <Link
            href="/sala/velreth-elite"
            className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]"
          >
            ← Voltar à Sala
          </Link>
          <span className="text-xs text-[var(--color-pedra)]">
            {profile?.email}
            {profile?.role === "admin" && (
              <span className="ml-2 text-[var(--color-sangue)]">⚜ Admin</span>
            )}
          </span>
        </div>

        <h1 className="text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow mb-2">
          Tua conta
        </h1>
        <div className="w-24 h-px bg-gradient-to-r from-[var(--color-dourado)] to-transparent mb-8" />

        {/* Nick */}
        <section className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-6 mb-6">
          <h2 className="text-xl text-[var(--color-dourado)] mb-4 font-[family-name:var(--font-cinzel)]">
            Nick de viajante
          </h2>
          <form onSubmit={salvarNick} className="space-y-3">
            <input
              type="text"
              minLength={2}
              maxLength={30}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)]"
            />
            <button
              type="submit"
              disabled={savingNick || nick.trim() === (profile?.nick || "").trim()}
              className="btn-selo-secundario disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingNick ? "Salvando…" : "Salvar nick"}
            </button>
            {nickMsg && (
              <p
                className={`text-sm ${
                  nickMsg.toLowerCase().includes("atualizado")
                    ? "text-[var(--color-dourado)]"
                    : "text-[var(--color-sangue)]"
                }`}
              >
                {nickMsg}
              </p>
            )}
          </form>
        </section>

        {/* Senha */}
        <section className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-6">
          <h2 className="text-xl text-[var(--color-dourado)] mb-4 font-[family-name:var(--font-cinzel)]">
            Trocar senha
          </h2>
          <form onSubmit={trocarSenha} className="space-y-3">
            <input
              type="password"
              minLength={6}
              required
              placeholder="Nova senha (mín. 6)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)]"
            />
            <input
              type="password"
              minLength={6}
              required
              placeholder="Confirmar nova senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)]"
            />
            <button
              type="submit"
              disabled={savingSenha}
              className="btn-selo-secundario disabled:opacity-50"
            >
              {savingSenha ? "Trocando…" : "Trocar senha"}
            </button>
            {senhaMsg && (
              <p
                className={`text-sm ${
                  senhaMsg.toLowerCase().includes("trocada")
                    ? "text-[var(--color-dourado)]"
                    : "text-[var(--color-sangue)]"
                }`}
              >
                {senhaMsg}
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
