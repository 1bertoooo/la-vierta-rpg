"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import {
  getOrCreateClientId,
  getPlayerNameForRoom,
  setPlayerNameForRoom,
  setLastRoomCode,
  SUGESTOES_NOMES,
} from "@/lib/player";

type Player = {
  id: string;
  display_name: string;
  client_id: string;
  last_seen_at: string;
};

type Campaign = {
  id: string;
  name: string;
  code: string;
  lore_intro: string;
};

export default function SalaPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [me, setMe] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Tela "Quem você é?"
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        // 1. Carrega a sala (campaign) pelo code
        const { data: camp, error: ce } = await sb
          .from("campaigns")
          .select("id, name, code, lore_intro")
          .eq("code", code)
          .single();

        if (ce || !camp) {
          throw new Error("Sala não encontrada. Verifique o código.");
        }
        if (cancelled) return;
        setCampaign(camp);
        setLastRoomCode(camp.code);

        // 2. Verifica se já jogamos nessa sala (localStorage tem nome)
        const clientId = getOrCreateClientId();
        const savedName = getPlayerNameForRoom(camp.id);

        // 3. Tenta achar player existente pelo client_id
        const { data: existing } = await sb
          .from("players")
          .select("id, display_name, client_id, last_seen_at")
          .eq("campaign_id", camp.id)
          .eq("client_id", clientId)
          .maybeSingle();

        if (existing) {
          // Atualiza last_seen
          await sb
            .from("players")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("id", existing.id);
          setMe(existing as Player);
          setPlayerNameForRoom(camp.id, existing.display_name);
        } else if (savedName) {
          // Tem nome salvo mas não tem player — cria
          await joinRoom(camp.id, savedName, clientId);
        } else {
          // Primeira vez — pede nome
          setShowJoinForm(true);
        }

        // 4. Lista de jogadores online
        const { data: list } = await sb
          .from("players")
          .select("id, display_name, client_id, last_seen_at")
          .eq("campaign_id", camp.id)
          .order("created_at", { ascending: true });
        if (!cancelled) setPlayers((list as Player[]) || []);

        // 5. Realtime: quem entra/sai
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
            async () => {
              const { data: list2 } = await sb
                .from("players")
                .select("id, display_name, client_id, last_seen_at")
                .eq("campaign_id", camp.id)
                .order("created_at", { ascending: true });
              if (!cancelled) setPlayers((list2 as Player[]) || []);
            }
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

  async function joinRoom(campaignId: string, name: string, clientId: string) {
    const sb = getSupabase();
    const { data, error: pe } = await sb
      .from("players")
      .insert({
        campaign_id: campaignId,
        display_name: name.trim(),
        client_id: clientId,
      })
      .select()
      .single();
    if (pe) throw pe;
    setPlayerNameForRoom(campaignId, name.trim());
    setMe(data as Player);
    setShowJoinForm(false);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign || !joinName.trim()) return;
    setJoining(true);
    try {
      await joinRoom(campaign.id, joinName.trim(), getOrCreateClientId());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao entrar";
      setError(msg);
    } finally {
      setJoining(false);
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

  if (showJoinForm) {
    return (
      <main className="flex-1 flex items-center justify-center px-6 pergaminho-texture">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.8)_100%)]" />
        <div className="relative z-10 w-full max-w-md epico-entrada">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] text-center mb-4">
            {campaign?.name}
          </p>
          <h1 className="text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow text-center mb-2">
            Quem és tu?
          </h1>
          <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent my-6" />
          <p className="text-[var(--color-pergaminho)] italic text-sm text-center mb-8">
            Diga teu nome ao guardião do portão.
          </p>

          <form onSubmit={handleJoin} className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-center mb-4">
              {SUGESTOES_NOMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setJoinName(n)}
                  className="px-3 py-1.5 rounded text-sm border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)] hover:text-[var(--color-dourado)] transition"
                >
                  {n}
                </button>
              ))}
            </div>

            <input
              type="text"
              required
              minLength={2}
              maxLength={30}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="ou outro nome…"
              className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] placeholder:text-[var(--color-pedra)] font-[family-name:var(--font-lora)] focus:outline-none focus:border-[var(--color-dourado)] transition"
              disabled={joining}
            />

            <button
              type="submit"
              disabled={joining || !joinName.trim()}
              className="btn-selo w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joining ? "Atravessando o portão…" : "Atravessar o portão"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  // Lobby da sala
  return (
    <main className="relative min-h-screen px-6 py-12 pergaminho-texture">
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
                    me?.id === p.id ? "bg-[var(--color-vinho)]/30 border border-[var(--color-dourado)]/50" : ""
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-[var(--color-floresta)] brasa" />
                  <span className="text-[var(--color-pergaminho)]">
                    {p.display_name}
                    {me?.id === p.id && (
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
              Manda esse link pros outros 3 — a sala não fecha:
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
            campanha narrada pelo Mestre IA. Por enquanto, a sala existe e nunca fecha — basta
            voltar quando quiserem retomar.
          </p>
        </div>

        <div className="mt-8 flex justify-between items-center text-xs text-[var(--color-pedra)]">
          <Link href="/" className="hover:text-[var(--color-dourado)] transition">
            ← Voltar ao reino
          </Link>
          <span className="tracking-widest">Versão 0.2 · Alpha</span>
        </div>
      </div>
    </main>
  );
}
