"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, type Profile } from "@/lib/supabase/client";
import { setLastRoomCode } from "@/lib/player";

type Player = {
  id: string;
  display_name: string;
  user_id: string | null;
  last_seen_at: string;
};

type Campaign = {
  id: string;
  name: string;
  code: string;
  lore_intro: string;
  current_chapter: number;
};

export default function SalaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  const [me, setMe] = useState<Profile | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Reset modal
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        // 1. Verifica auth
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user) {
          router.replace(`/login?next=${encodeURIComponent(`/sala/${code}`)}`);
          return;
        }

        // 2. Carrega profile
        const { data: profile } = await sb
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;
        if (!profile) throw new Error("Perfil não encontrado.");
        setMe(profile as Profile);

        // 3. Carrega sala
        const { data: camp, error: ce } = await sb
          .from("campaigns")
          .select("id, name, code, lore_intro, current_chapter")
          .eq("code", code)
          .single();
        if (ce || !camp) throw new Error("Sala não encontrada. Verifique o código.");
        if (cancelled) return;
        setCampaign(camp);
        setLastRoomCode(camp.code);

        // 4. Auto-join: se não tem player nesta sala, cria
        const { data: existing } = await sb
          .from("players")
          .select("id, display_name, user_id, last_seen_at")
          .eq("campaign_id", camp.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existing) {
          const nick =
            (profile as Profile).nick ||
            (profile as Profile).email.split("@")[0];
          await sb.from("players").insert({
            campaign_id: camp.id,
            user_id: user.id,
            display_name: nick,
            client_id: user.id, // legado: usar user_id como client_id também
          });
        } else {
          // Atualiza last_seen e display_name caso o nick tenha mudado
          await sb
            .from("players")
            .update({
              last_seen_at: new Date().toISOString(),
              display_name:
                (profile as Profile).nick || existing.display_name,
            })
            .eq("id", existing.id);
        }

        // 5. Lista players
        const reload = async () => {
          const { data: list } = await sb
            .from("players")
            .select("id, display_name, user_id, last_seen_at")
            .eq("campaign_id", camp.id)
            .order("created_at", { ascending: true });
          if (!cancelled) setPlayers((list as Player[]) || []);
        };
        await reload();

        // 6. Realtime
        const channel = sb
          .channel(`sala:${camp.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "players",
              filter: `campaign_id=eq.${camp.id}`,
            },
            () => reload()
          )
          .subscribe();
        unsubscribe = () => {
          sb.removeChannel(channel);
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao entrar na sala";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function logout() {
    const sb = getSupabase();
    await sb.auth.signOut();
    router.push("/");
  }

  async function resetar() {
    if (!campaign || resetConfirm !== "RESETAR") return;
    setResetting(true);
    try {
      const sb = getSupabase();
      const { error } = await sb.rpc("reset_campaign", {
        campaign_uuid: campaign.id,
      });
      if (error) throw error;
      setShowResetModal(false);
      setResetConfirm("");
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao resetar";
      setError(msg);
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center pergaminho-texture">
        <p className="text-[var(--color-pergaminho-velho)] italic">Convocando os antigos…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6 pergaminho-texture text-center">
        <h2 className="text-3xl text-[var(--color-sangue)] mb-4">Pergaminho rasgado</h2>
        <p className="text-[var(--color-pergaminho)] mb-8 max-w-md">{error}</p>
        <Link href="/">
          <button className="btn-selo">Voltar ao Reino</button>
        </Link>
      </main>
    );
  }

  const isAdmin = me?.role === "admin";

  return (
    <main className="relative min-h-screen px-6 py-8 pergaminho-texture">
      {/* Header */}
      <header className="max-w-5xl mx-auto flex items-center justify-between mb-12">
        <Link href="/" className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] transition">
          ← La Vierta
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/conta" className="text-[var(--color-pergaminho)] hover:text-[var(--color-dourado)] transition">
            <span className="text-[var(--color-dourado)]">{me?.nick || me?.email.split("@")[0]}</span>
            {isAdmin && <span className="ml-1 text-xs text-[var(--color-sangue)]">⚜</span>}
          </Link>
          <button onClick={logout} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] transition text-xs uppercase tracking-widest">
            Sair
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto epico-entrada">
        <p className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] mb-2">
          Sala · <span className="text-[var(--color-dourado)]">{campaign?.code}</span>
        </p>
        <h1 className="text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow mb-4">
          {campaign?.name}
        </h1>
        <div className="w-24 h-px bg-gradient-to-r from-[var(--color-dourado)] to-transparent mb-8" />

        <p className="text-[var(--color-pergaminho)] italic text-base md:text-lg leading-relaxed max-w-3xl mb-12">
          {campaign?.lore_intro}
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-6">
            <h2 className="text-2xl text-[var(--color-dourado)] mb-4 font-[family-name:var(--font-cinzel)]">
              Liga atual
            </h2>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded ${
                    p.user_id === me?.id
                      ? "bg-[var(--color-vinho)]/30 border border-[var(--color-dourado)]/50"
                      : ""
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[var(--color-floresta)] brasa" />
                  <span className="text-[var(--color-pergaminho)]">
                    {p.display_name}
                    {p.user_id === me?.id && (
                      <span className="text-[var(--color-dourado)] text-xs ml-2 italic">(tu)</span>
                    )}
                  </span>
                </li>
              ))}
              {players.length === 0 && (
                <li className="text-[var(--color-pedra)] italic text-sm">Sala vazia.</li>
              )}
            </ul>
          </section>

          <section className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-6">
            <h2 className="text-2xl text-[var(--color-dourado)] mb-4 font-[family-name:var(--font-cinzel)]">
              Compartilhar
            </h2>
            <p className="text-sm text-[var(--color-pergaminho)] mb-3">
              Manda esse link pros outros — a sala não fecha:
            </p>
            <code className="block bg-[var(--color-carvao)] p-3 rounded text-xs text-[var(--color-dourado)] break-all border border-[var(--color-pergaminho-velho)]/20">
              {typeof window !== "undefined" ? window.location.href : ""}
            </code>
            <button
              onClick={() => {
                if (typeof window !== "undefined") {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="mt-4 text-xs text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)] tracking-widest uppercase"
            >
              Copiar pergaminho ↗
            </button>
          </section>
        </div>

        <div className="mt-12 p-6 border border-[var(--color-dourado)]/30 rounded-lg bg-[var(--color-vinho)]/10">
          <h3 className="text-xl text-[var(--color-dourado)] mb-2 font-[family-name:var(--font-cinzel)]">
            Próxima etapa
          </h3>
          <p className="text-[var(--color-pergaminho)] text-sm">
            Em breve: criação de personagem (raça, classe, atributos, retrato) e o início da
            campanha narrada pelo Mestre IA.
          </p>
        </div>

        {isAdmin && (
          <section className="mt-8 p-6 border border-[var(--color-sangue)]/40 rounded-lg bg-[var(--color-sangue)]/10">
            <h3 className="text-lg text-[var(--color-sangue)] mb-3 font-[family-name:var(--font-cinzel)] flex items-center gap-2">
              <span>⚜</span> Painel do Admin
            </h3>
            <p className="text-sm text-[var(--color-pergaminho)] mb-4">
              Resetar campanha apaga personagens, sessões, NPCs, locais, quests e memórias da IA.
              <strong className="text-[var(--color-sangue)]"> Não pode desfazer.</strong> Os
              jogadores continuam na sala.
            </p>
            <button
              onClick={() => setShowResetModal(true)}
              className="px-4 py-2 bg-[var(--color-sangue)]/30 border border-[var(--color-sangue)] text-[var(--color-pergaminho)] hover:bg-[var(--color-sangue)] transition text-xs uppercase tracking-widest rounded"
            >
              Resetar campanha
            </button>
          </section>
        )}

        <div className="mt-8 text-right text-xs text-[var(--color-pedra)] tracking-widest">
          Versão 0.3 · Alpha · Capítulo {campaign?.current_chapter}
        </div>
      </div>

      {/* Modal de reset */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
          <div className="bg-[var(--color-carvao)] border border-[var(--color-sangue)] rounded-lg p-8 max-w-md w-full">
            <h2 className="text-2xl text-[var(--color-sangue)] mb-4 font-[family-name:var(--font-cinzel)]">
              Resetar campanha?
            </h2>
            <p className="text-[var(--color-pergaminho)] text-sm mb-4">
              Isso apaga o progresso todo: personagens, sessões, NPCs, locais, quests, memórias.
              Os jogadores continuam, mas começam do zero.
            </p>
            <p className="text-[var(--color-pergaminho-velho)] text-xs mb-2">
              Digita <code className="text-[var(--color-sangue)]">RESETAR</code> pra confirmar:
            </p>
            <input
              type="text"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--color-carvao)] border border-[var(--color-sangue)]/50 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-sangue)]"
              autoFocus
            />
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirm("");
                }}
                disabled={resetting}
                className="flex-1 px-4 py-2 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] rounded text-xs uppercase tracking-widest hover:border-[var(--color-dourado)]"
              >
                Cancelar
              </button>
              <button
                onClick={resetar}
                disabled={resetting || resetConfirm !== "RESETAR"}
                className="flex-1 px-4 py-2 bg-[var(--color-sangue)] text-[var(--color-pergaminho)] rounded text-xs uppercase tracking-widest disabled:opacity-40"
              >
                {resetting ? "Resetando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
