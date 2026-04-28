"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, type Profile } from "@/lib/supabase/client";
import { setLastRoomCode } from "@/lib/player";
import { rolarDados, DADOS_PADRAO, type DiceRoll } from "@/lib/dados";
import { ttsSpeak, ttsStop, ttsIsEnabled, ttsSetEnabled } from "@/lib/tts";
import {
  audioInit,
  audioPlayMood,
  audioStop,
  audioIsMuted,
  audioSetMuted,
  audioSetVolume,
  audioGetVolume,
  type Mood,
} from "@/lib/audio";
import { CLASSES, RACAS, modAtributo } from "@/lib/lvs";
import { DM_OPENING_PROMPT } from "@/lib/dm-prompt";

type Player = {
  id: string;
  display_name: string;
  user_id: string | null;
  last_seen_at: string;
};

type Character = {
  id: string;
  user_id: string;
  name: string;
  race_key: string;
  class_key: string;
  level: number;
  for_attr: number;
  des_attr: number;
  con_attr: number;
  int_attr: number;
  sab_attr: number;
  car_attr: number;
  hp_max: number;
  hp_current: number;
  ac: number;
  portrait_url: string | null;
  background: string | null;
  spells: { nome: string; nivel: number; efeito: string }[];
  features: string[];
};

type Campaign = {
  id: string;
  name: string;
  code: string;
  lore_intro: string;
  current_chapter: number;
};

type LogEvent = {
  id: string;
  actor_type: "player" | "npc" | "dm" | "system";
  actor_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const SCROLL_BOTTOM_DELAY = 80;

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
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [myChar, setMyChar] = useState<Character | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEvent[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [acaoTexto, setAcaoTexto] = useState("");
  const [aguardandoIA, setAguardandoIA] = useState(false);

  const [ttsOn, setTtsOn] = useState(false);
  const [audioMuted, setAudioMuted] = useState(true);
  const [audioVol, setAudioVol] = useState(0.4);
  const [showFicha, setShowFicha] = useState(false);
  const [showDados, setShowDados] = useState(false);
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [pendingRoll, setPendingRoll] = useState<string | null>(null);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    const t = setTimeout(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, SCROLL_BOTTOM_DELAY);
    return () => clearTimeout(t);
  }, [log.length]);

  useEffect(() => {
    setTtsOn(ttsIsEnabled());
    audioInit();
    setAudioMuted(audioIsMuted());
    setAudioVol(audioGetVolume());
  }, []);

  // Carrega tudo
  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    let unsubs: (() => void)[] = [];

    (async () => {
      try {
        const {
          data: { user },
        } = await sb.auth.getUser();
        if (!user) {
          router.replace(`/login?next=${encodeURIComponent(`/sala/${code}`)}`);
          return;
        }

        const { data: profile } = await sb
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
        if (!profile) throw new Error("Perfil não encontrado.");
        if (cancelled) return;
        setMe(profile as Profile);

        const { data: camp, error: ce } = await sb
          .from("campaigns")
          .select("id, name, code, lore_intro, current_chapter")
          .eq("code", code)
          .single();
        if (ce || !camp) throw new Error("Sala não encontrada.");
        if (cancelled) return;
        setCampaign(camp);
        setLastRoomCode(camp.code);

        // Auto-join
        const { data: existing } = await sb
          .from("players")
          .select("id, display_name, user_id, last_seen_at")
          .eq("campaign_id", camp.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existing) {
          const nick = (profile as Profile).nick || (profile as Profile).email.split("@")[0];
          await sb.from("players").insert({
            campaign_id: camp.id,
            user_id: user.id,
            display_name: nick,
            client_id: user.id,
          });
        } else {
          await sb
            .from("players")
            .update({
              last_seen_at: new Date().toISOString(),
              display_name: (profile as Profile).nick || existing.display_name,
            })
            .eq("id", existing.id);
        }

        // Sessão atual (cria se não existe)
        const { data: sId } = await sb.rpc("get_or_create_current_session", {
          p_campaign_id: camp.id,
        });
        if (cancelled) return;
        setSessionId(sId as string);

        const reloadAll = async () => {
          const { data: list } = await sb
            .from("players")
            .select("id, display_name, user_id, last_seen_at")
            .eq("campaign_id", camp.id)
            .order("created_at", { ascending: true });
          if (!cancelled) setPlayers((list as Player[]) || []);

          const { data: chars } = await sb
            .from("characters")
            .select("*")
            .eq("campaign_id", camp.id);
          if (!cancelled) {
            const map: Record<string, Character> = {};
            for (const c of chars || []) map[c.user_id] = c as Character;
            setCharacters(map);
            setMyChar(map[user.id] || null);
          }

          if (sId) {
            const { data: events } = await sb
              .from("combat_log")
              .select("*")
              .eq("session_id", sId as string)
              .order("created_at", { ascending: true })
              .limit(200);
            if (!cancelled) setLog((events as LogEvent[]) || []);
          }
        };

        await reloadAll();

        // Realtime: players + combat_log
        const ch1 = sb
          .channel(`sala-players:${camp.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "players", filter: `campaign_id=eq.${camp.id}` },
            () => reloadAll()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${camp.id}` },
            () => reloadAll()
          )
          .subscribe();
        unsubs.push(() => sb.removeChannel(ch1));

        if (sId) {
          const ch2 = sb
            .channel(`sala-log:${sId}`)
            .on(
              "postgres_changes",
              { event: "INSERT", schema: "public", table: "combat_log", filter: `session_id=eq.${sId}` },
              (payload) => {
                const ev = payload.new as LogEvent;
                setLog((prev) => [...prev, ev]);
                // TTS pra narrações
                if (ev.actor_type === "dm" && ev.event_type === "narration" && ttsIsEnabled()) {
                  const txt = (ev.payload.text as string) || "";
                  ttsSpeak(txt);
                }
                // Captura ROLL pendente
                const directives = (ev.payload as { directives?: { roll?: string; music_mood?: string } })?.directives;
                if (ev.actor_type === "dm" && directives?.roll) {
                  setPendingRoll(directives.roll);
                }
                // Música ambiente dirigida pelo Mestre
                if (ev.actor_type === "dm" && directives?.music_mood) {
                  const m = directives.music_mood as Mood;
                  if (["tavern", "battle", "dungeon", "boss", "calm", "silence"].includes(m)) {
                    audioPlayMood(m);
                  }
                }
              }
            )
            .subscribe();
          unsubs.push(() => sb.removeChannel(ch2));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao entrar na sala";
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((f) => f());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function logEvent(payload: {
    actor_type: "player" | "npc" | "dm" | "system";
    actor_id?: string | null;
    event_type: string;
    payload: Record<string, unknown>;
  }) {
    if (!sessionId) return;
    const sb = getSupabase();
    await sb.from("combat_log").insert({
      session_id: sessionId,
      actor_type: payload.actor_type,
      actor_id: payload.actor_id ?? me?.id ?? null,
      event_type: payload.event_type,
      payload: payload.payload,
    });
  }

  async function chamarDM(prompt: string, isOpening = false) {
    if (!campaign || !sessionId || aguardandoIA) return;
    setAguardandoIA(true);

    // Loga ação do player primeiro (exceto opening)
    if (!isOpening) {
      await logEvent({
        actor_type: "player",
        event_type: "speak",
        payload: { text: prompt, nick: me?.nick || "viajante" },
      });
    }

    // Monta histórico das últimas N mensagens pra mandar pra IA
    const sb = getSupabase();
    const { data: recent } = await sb
      .from("combat_log")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);

    const messages = ((recent as LogEvent[]) || [])
      .reverse()
      .filter((e) => ["narration", "speak", "roll"].includes(e.event_type))
      .map((e) => ({
        role: e.actor_type === "dm" ? ("assistant" as const) : ("user" as const),
        content:
          e.actor_type === "dm"
            ? (e.payload.text as string) || ""
            : `[${e.payload.nick || "viajante"}]: ${(e.payload.text as string) || JSON.stringify(e.payload)}`,
      }));

    if (isOpening) {
      messages.push({ role: "user", content: prompt });
    } else if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      messages.push({
        role: "user",
        content: `[${me?.nick || "viajante"}]: ${prompt}`,
      });
    }

    // Contexto
    const playerCtx = players.map((p) => {
      const ch = characters[p.user_id || ""] || null;
      return {
        nick: p.display_name,
        character: ch
          ? {
              name: ch.name,
              race: RACAS.find((r) => r.key === ch.race_key)?.nome || ch.race_key,
              class: CLASSES.find((c) => c.key === ch.class_key)?.nome || ch.class_key,
              hp: ch.hp_current,
              hp_max: ch.hp_max,
            }
          : undefined,
      };
    });

    try {
      const r = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          context: {
            campaign_name: campaign.name,
            current_location: "Amarelinho",
            chapter: campaign.current_chapter,
            players: playerCtx,
          },
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Mestre IA fora do ar");

      // Limpa marcadores do texto pra exibir limpo
      const textLimpo = (data.text as string)
        .replace(/\[ROLL:[^\]]+\]/gi, "")
        .replace(/\[COMBATE INICIA\]/gi, "")
        .replace(/\[MUSICA:[^\]]+\]/gi, "")
        .trim();

      await logEvent({
        actor_type: "dm",
        event_type: "narration",
        payload: { text: textLimpo, directives: data.directives },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      await logEvent({
        actor_type: "system",
        event_type: "error",
        payload: { text: `Mestre se calou: ${msg}` },
      });
    } finally {
      setAguardandoIA(false);
    }
  }

  async function rolarDado(expr: string, contexto?: string) {
    const r = rolarDados(expr);
    if (!r) return;
    await logEvent({
      actor_type: "player",
      event_type: "roll",
      payload: {
        nick: me?.nick || "viajante",
        text: contexto ? `${contexto}: ${expr} → ${r.total}${r.critical ? " ⚜ CRÍTICO" : r.fumble ? " ☠ falha crítica" : ""}` : `${expr} → ${r.total}`,
        result: r,
      },
    });
    setShowDados(false);
    setPendingRoll(null);
  }

  function rolarComMod(expr: string, modKey?: "for" | "des" | "con" | "int" | "sab" | "car") {
    if (modKey && myChar) {
      const valor = myChar[`${modKey}_attr` as const];
      const mod = modAtributo(valor);
      const exprComMod = `${expr}${mod >= 0 ? `+${mod}` : `${mod}`}`;
      rolarDado(exprComMod, modKey.toUpperCase());
    } else {
      rolarDado(expr);
    }
  }

  async function enviarAcao(e?: React.FormEvent) {
    e?.preventDefault();
    const txt = acaoTexto.trim();
    if (!txt || aguardandoIA) return;
    setAcaoTexto("");
    await chamarDM(txt);
  }

  async function abrirCenaInicial() {
    if (!sessionId || aguardandoIA) return;
    // Primeira chamada do mestre — opening
    await chamarDM(DM_OPENING_PROMPT, true);
  }

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
      const { error } = await sb.rpc("reset_campaign", { campaign_uuid: campaign.id });
      if (error) throw error;
      setShowResetModal(false);
      setResetConfirm("");
      window.location.reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      setError(msg);
    } finally {
      setResetting(false);
    }
  }

  function toggleTTS() {
    const novo = !ttsOn;
    setTtsOn(novo);
    ttsSetEnabled(novo);
    if (!novo) ttsStop();
  }

  function toggleAudio() {
    const novo = !audioMuted;
    setAudioMuted(novo);
    audioSetMuted(novo);
    if (novo) audioStop();
    else audioPlayMood("tavern"); // padrão ao destrancar
  }

  function setVolume(v: number) {
    setAudioVol(v);
    audioSetVolume(v);
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

  // Sem personagem: tela de criação
  if (!myChar) {
    return (
      <main className="relative min-h-screen px-6 py-8 pergaminho-texture">
        <header className="max-w-5xl mx-auto flex items-center justify-between mb-8">
          <Link href="/" className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">
            ← La Vierta
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/conta" className="text-[var(--color-pergaminho)] hover:text-[var(--color-dourado)]">
              <span className="text-[var(--color-dourado)]">{me?.nick}</span>
              {me?.role === "admin" && <span className="ml-1 text-xs text-[var(--color-sangue)]">⚜</span>}
            </Link>
            <button onClick={logout} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-xs uppercase tracking-widest">
              Sair
            </button>
          </div>
        </header>

        <div className="max-w-2xl mx-auto epico-entrada text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] mb-2">
            Sala · {campaign?.code}
          </p>
          <h1 className="text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow mb-4">
            {campaign?.name}
          </h1>
          <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent mb-8" />

          <p className="text-[var(--color-pergaminho)] italic mb-12">{campaign?.lore_intro}</p>

          <div className="bg-[var(--color-vinho)]/20 border border-[var(--color-dourado)]/40 rounded-lg p-8 mb-8">
            <h2 className="text-2xl text-[var(--color-dourado)] mb-3 font-[family-name:var(--font-cinzel)]">
              Tu ainda não tens forma neste reino
            </h2>
            <p className="text-sm text-[var(--color-pergaminho)] mb-6">
              Antes de cruzar o portão da aventura, precisas escolher tua linhagem, classe e história.
            </p>
            <Link href={`/sala/${code}/personagem`}>
              <button className="btn-selo">Forjar viajante</button>
            </Link>
          </div>

          {players.length > 0 && (
            <section className="text-left">
              <h3 className="text-sm uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-3">
                Outros já chegaram
              </h3>
              <ul className="space-y-2">
                {players.map((p) => {
                  const ch = characters[p.user_id || ""];
                  return (
                    <li key={p.id} className="flex items-center gap-3 text-sm">
                      <span className="w-2 h-2 rounded-full bg-[var(--color-floresta)] brasa" />
                      <span className="text-[var(--color-pergaminho)]">
                        {p.display_name}
                        {ch && <span className="text-[var(--color-pergaminho-velho)] ml-2">— {ch.name}</span>}
                        {!ch && <span className="text-[var(--color-pedra)] italic ml-2">aguardando forma</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </main>
    );
  }

  // Sala completa (com personagem)
  const isAdmin = me?.role === "admin";

  return (
    <main className="min-h-screen pergaminho-texture flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--color-pergaminho-velho)]/20 px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/" className="text-xs uppercase tracking-[0.3em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">
          ← La Vierta
        </Link>
        <div className="flex-1 text-center">
          <span className="text-xs uppercase tracking-widest text-[var(--color-pedra)]">
            {campaign?.name} · Cap. {campaign?.current_chapter}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={toggleTTS}
            className={`text-xs uppercase tracking-widest transition ${
              ttsOn ? "text-[var(--color-dourado)]" : "text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]"
            }`}
            title="Voz do mestre"
          >
            {ttsOn ? "🔊" : "🔇"} Voz
          </button>
          <div className="relative">
            <button
              onClick={() => setShowAudioPanel((s) => !s)}
              className={`text-xs uppercase tracking-widest transition ${
                !audioMuted ? "text-[var(--color-dourado)]" : "text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]"
              }`}
              title="Música ambiente"
            >
              ♪
            </button>
            {showAudioPanel && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/40 rounded-lg p-3 z-30">
                <button onClick={toggleAudio} className="w-full text-left text-xs text-[var(--color-pergaminho)] mb-2 hover:text-[var(--color-dourado)]">
                  {audioMuted ? "▶ Tocar música" : "⏸ Silenciar"}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioVol}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-[10px] text-[var(--color-pedra)] mt-2">A música muda conforme a cena.</p>
              </div>
            )}
          </div>
          <Link href="/conta" className="text-[var(--color-pergaminho)] hover:text-[var(--color-dourado)]">
            <span className="text-[var(--color-dourado)]">{me?.nick}</span>
            {isAdmin && <span className="ml-1 text-xs text-[var(--color-sangue)]">⚜</span>}
          </Link>
          <button onClick={logout} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-xs uppercase tracking-widest">
            Sair
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto">
        {/* COLUNA ESQUERDA: Liga */}
        <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-[var(--color-pergaminho-velho)]/20 p-4">
          <h2 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-3">
            Liga
          </h2>
          <ul className="space-y-2">
            {players.map((p) => {
              const ch = characters[p.user_id || ""];
              const isMe = p.user_id === me?.id;
              return (
                <li key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded ${isMe ? "bg-[var(--color-vinho)]/20 border border-[var(--color-dourado)]/30" : ""}`}>
                  {ch?.portrait_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ch.portrait_url} alt={ch.name} className="w-8 h-8 rounded-full object-cover border border-[var(--color-dourado)]/40" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-[var(--color-pedra)]/40 flex items-center justify-center text-xs text-[var(--color-pergaminho-velho)]">{(ch?.name || p.display_name).slice(0, 1).toUpperCase()}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--color-pergaminho)] truncate">
                      {ch?.name || p.display_name}
                    </div>
                    {ch && (
                      <div className="text-[10px] text-[var(--color-pergaminho-velho)] uppercase tracking-wider">
                        {RACAS.find((r) => r.key === ch.race_key)?.nome.split(" ")[0]} · {CLASSES.find((c) => c.key === ch.class_key)?.nome}
                      </div>
                    )}
                  </div>
                  {ch && (
                    <div className="text-[10px] text-[var(--color-sangue)]">
                      {ch.hp_current}/{ch.hp_max}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {isAdmin && (
            <div className="mt-6 pt-4 border-t border-[var(--color-pergaminho-velho)]/20">
              <button
                onClick={() => setShowResetModal(true)}
                className="text-xs text-[var(--color-sangue)] hover:text-[var(--color-pergaminho)] uppercase tracking-widest"
              >
                ⚜ Resetar campanha
              </button>
            </div>
          )}
        </aside>

        {/* COLUNA CENTRAL: Log narrativo */}
        <section className="flex-1 flex flex-col min-h-[60vh] max-h-[calc(100vh-120px)] lg:max-h-[calc(100vh-60px)]">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {log.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[var(--color-pergaminho-velho)] italic mb-6">
                  A campanha ainda não começou. {isAdmin ? "Clica abaixo pra abrir a cena inicial." : "Aguardando o admin abrir a cena…"}
                </p>
                {isAdmin && (
                  <button
                    onClick={abrirCenaInicial}
                    disabled={aguardandoIA}
                    className="btn-selo disabled:opacity-50"
                  >
                    {aguardandoIA ? "Mestre invocando…" : "Abrir cena inicial"}
                  </button>
                )}
              </div>
            )}
            {log.map((ev) => (
              <LogEntry key={ev.id} ev={ev} characters={characters} myUserId={me?.id} />
            ))}
            {aguardandoIA && (
              <div className="text-[var(--color-dourado)] italic text-sm flex items-center gap-2">
                <span className="brasa">●</span> Mestre tece a próxima cena…
              </div>
            )}
            <div ref={logEndRef} />
          </div>

          {/* Input de ação */}
          <form onSubmit={enviarAcao} className="border-t border-[var(--color-pergaminho-velho)]/20 p-3 flex gap-2 bg-[var(--color-carvao)]/40">
            <button
              type="button"
              onClick={() => setShowDados(true)}
              className="px-3 py-2 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-dourado)] text-sm hover:border-[var(--color-dourado)] flex-shrink-0"
              title="Rolar dados"
            >
              🎲
            </button>
            {pendingRoll && (
              <button
                type="button"
                onClick={() => rolarComMod("1d20")}
                className="px-3 py-2 rounded bg-[var(--color-dourado)]/30 border border-[var(--color-dourado)] text-[var(--color-dourado-claro)] text-xs uppercase tracking-widest hover:bg-[var(--color-dourado)]/50 flex-shrink-0"
              >
                Rolar: {pendingRoll}
              </button>
            )}
            <input
              type="text"
              value={acaoTexto}
              onChange={(e) => setAcaoTexto(e.target.value)}
              placeholder="Descreve tua ação ou fala…"
              disabled={aguardandoIA}
              className="flex-1 px-3 py-2 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)] text-sm"
            />
            <button
              type="submit"
              disabled={!acaoTexto.trim() || aguardandoIA}
              className="px-4 py-2 rounded bg-[var(--color-vinho)] border border-[var(--color-dourado)] text-[var(--color-pergaminho)] text-xs uppercase tracking-widest hover:bg-[var(--color-sangue)] disabled:opacity-40 flex-shrink-0"
            >
              Falar
            </button>
          </form>
        </section>

        {/* COLUNA DIREITA: Ficha */}
        <aside className="lg:w-72 border-t lg:border-t-0 lg:border-l border-[var(--color-pergaminho-velho)]/20 p-4 overflow-y-auto">
          <button
            onClick={() => setShowFicha((s) => !s)}
            className="lg:hidden text-xs uppercase tracking-widest text-[var(--color-dourado)] mb-3"
          >
            {showFicha ? "▲" : "▼"} Ficha
          </button>
          <div className={`${showFicha ? "block" : "hidden"} lg:block`}>
            <Ficha char={myChar} />
          </div>
        </aside>
      </div>

      {/* Modal dados */}
      {showDados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
          <div className="bg-[var(--color-carvao)] border border-[var(--color-dourado)] rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl text-[var(--color-dourado)] mb-4 font-[family-name:var(--font-cinzel)]">Rolar dados</h2>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {DADOS_PADRAO.map((d) => (
                <button
                  key={d.label}
                  onClick={() => rolarDado(d.expr)}
                  className="px-3 py-2 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)] hover:text-[var(--color-dourado)]"
                >
                  {d.label}
                </button>
              ))}
            </div>
            {myChar && (
              <>
                <p className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-2">d20 + atributo</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {(["for", "des", "con", "int", "sab", "car"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => rolarComMod("1d20", k)}
                      className="px-2 py-1.5 rounded border border-[var(--color-pergaminho-velho)]/40 text-xs text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)]"
                    >
                      {k.toUpperCase()} ({modAtributo(myChar[`${k}_attr` as const]) >= 0 ? "+" : ""}
                      {modAtributo(myChar[`${k}_attr` as const])})
                    </button>
                  ))}
                </div>
              </>
            )}
            <button onClick={() => setShowDados(false)} className="btn-selo-secundario w-full text-xs">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Modal reset */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
          <div className="bg-[var(--color-carvao)] border border-[var(--color-sangue)] rounded-lg p-8 max-w-md w-full">
            <h2 className="text-2xl text-[var(--color-sangue)] mb-4 font-[family-name:var(--font-cinzel)]">
              Resetar campanha?
            </h2>
            <p className="text-[var(--color-pergaminho)] text-sm mb-4">
              Apaga personagens, sessões, NPCs, locais, quests, memórias. Os jogadores continuam, mas começam do zero.
            </p>
            <p className="text-[var(--color-pergaminho-velho)] text-xs mb-2">
              Digita <code className="text-[var(--color-sangue)]">RESETAR</code>:
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
                className="flex-1 px-4 py-2 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] rounded text-xs uppercase tracking-widest"
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

function LogEntry({
  ev,
  characters,
  myUserId,
}: {
  ev: LogEvent;
  characters: Record<string, Character>;
  myUserId: string | undefined;
}) {
  if (ev.actor_type === "dm") {
    const text = (ev.payload.text as string) || "";
    return (
      <div className="border-l-2 border-[var(--color-dourado)] pl-4 py-1">
        <p className="text-xs uppercase tracking-widest text-[var(--color-dourado)] mb-1">Mestre</p>
        <p className="text-[var(--color-pergaminho)] leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    );
  }
  if (ev.actor_type === "system") {
    const text = (ev.payload.text as string) || "";
    return (
      <p className="text-xs italic text-[var(--color-pedra)] text-center">{text}</p>
    );
  }
  if (ev.actor_type === "player") {
    const nick = (ev.payload.nick as string) || "viajante";
    const text = (ev.payload.text as string) || "";
    const isMe = ev.actor_id === myUserId;
    if (ev.event_type === "roll") {
      return (
        <div className="text-center py-1">
          <span className="text-xs text-[var(--color-pergaminho-velho)]">🎲 </span>
          <span className={`text-sm ${isMe ? "text-[var(--color-dourado)]" : "text-[var(--color-pergaminho)]"}`}>
            <strong>{nick}</strong>: {text}
          </span>
        </div>
      );
    }
    return (
      <div className={`pl-4 py-1 ${isMe ? "border-l-2 border-[var(--color-vinho)]" : "border-l-2 border-[var(--color-pergaminho-velho)]/30"}`}>
        <p className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">{nick}</p>
        <p className="text-[var(--color-pergaminho)] italic">"{text}"</p>
      </div>
    );
  }
  return null;
}

function Ficha({ char }: { char: Character }) {
  const raca = RACAS.find((r) => r.key === char.race_key);
  const classe = CLASSES.find((c) => c.key === char.class_key);
  return (
    <div className="space-y-4">
      {char.portrait_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={char.portrait_url}
          alt={char.name}
          className="w-full aspect-square object-cover rounded-lg border border-[var(--color-dourado)]/40"
        />
      )}
      <div>
        <h3 className="text-xl text-[var(--color-dourado-claro)] dourado-glow font-[family-name:var(--font-cinzel)]">
          {char.name}
        </h3>
        <p className="text-xs text-[var(--color-pergaminho-velho)] uppercase tracking-widest">
          {raca?.nome} · {classe?.nome} · Nível {char.level}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded p-2">
          <div className="text-xs text-[var(--color-pergaminho-velho)] uppercase">HP</div>
          <div className="text-lg text-[var(--color-sangue)] font-[family-name:var(--font-cinzel-decorative)]">
            {char.hp_current}/{char.hp_max}
          </div>
        </div>
        <div className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded p-2">
          <div className="text-xs text-[var(--color-pergaminho-velho)] uppercase">CA</div>
          <div className="text-lg text-[var(--color-dourado)] font-[family-name:var(--font-cinzel-decorative)]">
            {char.ac}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 text-center text-xs">
        {(["for", "des", "con", "int", "sab", "car"] as const).map((k) => {
          const v = char[`${k}_attr` as const];
          const m = modAtributo(v);
          return (
            <div key={k} className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded p-1.5">
              <div className="text-[10px] text-[var(--color-pergaminho-velho)] uppercase">{k}</div>
              <div className="text-sm text-[var(--color-pergaminho)]">{v}</div>
              <div className="text-[10px] text-[var(--color-dourado)]">{m >= 0 ? `+${m}` : m}</div>
            </div>
          );
        })}
      </div>

      {char.spells && char.spells.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">Magias</h4>
          <ul className="space-y-1">
            {char.spells.map((m, i) => (
              <li key={i} className="text-xs text-[var(--color-pergaminho)]">
                <span className="text-[var(--color-dourado)]">{m.nome}</span>
                <span className="text-[var(--color-pergaminho-velho)] ml-1">(N{m.nivel})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {char.features && char.features.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">Habilidades</h4>
          <ul className="space-y-1">
            {char.features.map((f, i) => (
              <li key={i} className="text-xs text-[var(--color-pergaminho)] italic">
                · {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {char.background && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">História</h4>
          <p className="text-xs text-[var(--color-pergaminho)] italic">{char.background}</p>
        </div>
      )}
    </div>
  );
}
