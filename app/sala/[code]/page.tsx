"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase, type Profile } from "@/lib/supabase/client";
import { setLastRoomCode } from "@/lib/player";
import { rolarDados, DADOS_PADRAO } from "@/lib/dados";
import { ttsSpeak, ttsStop, ttsIsEnabled, ttsSetEnabled, ttsPause, ttsResume, ttsIsPaused } from "@/lib/tts";
import { CLASSES, RACAS, modAtributo } from "@/lib/lvs";
import { DM_OPENING_PROMPT } from "@/lib/dm-prompt";
import {
  audioInit,
  audioPlayMood,
  audioPlayFromNarration,
  audioStop,
  audioIsMuted,
  audioSetMuted,
  audioSetVolume,
  audioGetVolume,
  audioResumeIfBlocked,
  audioIsPlaying,
  sfxInit,
  sfxPlay,
  sfxSetVolume,
  sfxGetVolume,
  type SFX,
} from "@/lib/audio";
import { parseDirectives, stripDirectives, type Directive } from "@/lib/directives";
import type { Vantage } from "@/lib/dados";

type Player = {
  id: string;
  display_name: string;
  user_id: string | null;
  last_seen_at: string;
};

type InventoryItem = {
  id: string;
  nome: string;
  tipo: string;
  desc?: string;
  consumivel?: boolean;
  qtd?: number;
};

type Character = {
  id: string;
  user_id: string;
  name: string;
  race: string;
  class: string;
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
  inventory: InventoryItem[];
  // Mecânicas avançadas — opcionais (default em runtime se ausente)
  spell_slots?: Record<string, { max: number; used: number }>;
  death_saves?: { successes: number; failures: number; stable: boolean };
  conditions?: { name: string; source?: string; expires_at?: string }[];
  xp?: number;
  inspiration?: boolean;
  hit_dice_current?: number | null;
  exhaustion?: number;
  speed?: number;
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

type NotaItem = {
  id: string;
  campaign_id: string;
  user_id: string | null;
  scope: "self" | "party" | "dm";
  title: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type QuestItem = {
  id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  status: "active" | "completed" | "failed";
  created_at: string;
};

type NpcItem = {
  id: string;
  campaign_id: string;
  name: string;
  appearance: string | null;
  bordao: string | null;
  faction: string | null;
  relation: number;
  first_met_at: string;
  last_seen_at: string | null;
  notes: string | null;
  portrait_url: string | null;
};

type IniciativaItem = {
  id: string;
  session_id: string;
  actor_type: "player" | "npc" | "enemy";
  actor_id: string;
  display_name: string;
  initiative: number;
  position: number;
  hp_current: number | null;
  hp_max: number | null;
  ac: number | null;
  is_current: boolean;
};

const SCROLL_DELAY = 80;

export default function SalaPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();

  const [me, setMe] = useState<Profile | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [myChar, setMyChar] = useState<Character | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [currentTurnUserId, setCurrentTurnUserId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [acaoTexto, setAcaoTexto] = useState("");
  const [aguardandoIA, setAguardandoIA] = useState(false);

  const [ttsOn, setTtsOn] = useState(false);
  const [audioMuted, setAudioMuted] = useState(true);
  const [audioVol, setAudioVol] = useState(0.35);
  const [showFicha, setShowFicha] = useState(false);
  const [showLiga, setShowLiga] = useState(false);
  const [showDados, setShowDados] = useState(false);
  const [showAudioPanel, setShowAudioPanel] = useState(false);
  const [pendingRoll, setPendingRoll] = useState<{ raw: string; rolled: boolean } | null>(null);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");

  // Visualizar ficha de outro player
  const [fichaVendo, setFichaVendo] = useState<string | null>(null); // user_id sendo visualizado
  // TTS pause state
  const [ttsPaused, setTtsPaused] = useState(false);
  // Música tocando
  const [musicaTocando, setMusicaTocando] = useState(false);
  // Mestre escrevendo: aparece entre chegada da resposta e início da narração (sincroniza texto com áudio)
  const [mestreEscrevendo, setMestreEscrevendo] = useState(false);
  // Volume SFX (separado da música)
  const [sfxVol, setSfxVol] = useState(0.45);
  // Toast de "tua vez"
  const [tuaVezToast, setTuaVezToast] = useState(false);
  // Vantagem/desvantagem da próxima rolagem
  const [vantageMode, setVantageMode] = useState<Vantage>("normal");
  // Pergaminhos (notas + quests + NPCs)
  const [showPergaminhos, setShowPergaminhos] = useState(false);
  const [notas, setNotas] = useState<NotaItem[]>([]);
  const [quests, setQuests] = useState<QuestItem[]>([]);
  const [npcsConhecidos, setNpcsConhecidos] = useState<NpcItem[]>([]);
  // Iniciativa (combate) — tracker visual no topo do log durante combate
  const [iniciativa, setIniciativa] = useState<IniciativaItem[]>([]);
  const [emCombate, setEmCombate] = useState(false);
  // Pendência de ataque do mestre [ATTACK: ...] — botão pra rolar
  const [pendingAttack, setPendingAttack] = useState<{ alvo: string; dice: string; ac?: number } | null>(null);
  // NPC recém-encontrado — modal épico com flair
  const [npcRecemConhecido, setNpcRecemConhecido] = useState<NpcItem | null>(null);
  // Tempo do dia e clima
  const [timeOfDay, setTimeOfDay] = useState<string>("day");
  const [weather, setWeather] = useState<string>("clear");
  // Doom clocks (Vincent Baker / John Harper)
  const [doomClocks, setDoomClocks] = useState<Record<string, { max: number; current: number; label?: string }>>({
    doom:        { max: 12, current: 0, label: "A Vierta acorda" },
    arco:        { max: 8,  current: 0, label: "Arco atual" },
    situacional: { max: 6,  current: 0, label: "Pressão imediata" },
  });
  // Aside privado pra mim (info que personagem viu, outros não)
  const [asideRecebido, setAsideRecebido] = useState<string | null>(null);
  // Anti-flicker / cleanup do timeout do mestre
  const mestreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Channel pra broadcast "Mestre invocando" entre clients (não-DB, mais rápido)
  // Tipo escapa do supabase (RealtimeChannel) — mantemos como ref opaco
  const dmChannelRef = useRef<{ send: (args: { type: string; event: string; payload?: Record<string, unknown> }) => unknown } | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, SCROLL_DELAY);
    return () => clearTimeout(t);
  }, [log.length]);

  useEffect(() => {
    setTtsOn(ttsIsEnabled());
    audioInit();
    sfxInit();
    setAudioMuted(audioIsMuted());
    setAudioVol(audioGetVolume());
    setSfxVol(sfxGetVolume());

    // Tenta retomar audio em qualquer click do user (autoplay-bypass)
    const onAnyClick = () => audioResumeIfBlocked();
    document.addEventListener("click", onAnyClick);
    return () => {
      document.removeEventListener("click", onAnyClick);
      // Cleanup de timeout pendente (evita setState em componente desmontado)
      if (mestreTimeoutRef.current) {
        clearTimeout(mestreTimeoutRef.current);
        mestreTimeoutRef.current = null;
      }
    };
  }, []);

  // Heartbeat: pinga last_seen_at a cada 30s pra outros saberem que tô online
  useEffect(() => {
    if (!me?.id || !campaign?.id) return;
    const sb = getSupabase();
    const ping = async () => {
      try {
        await sb.from("players")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("campaign_id", campaign.id)
          .eq("user_id", me.id);
      } catch {}
    };
    ping(); // imediato
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [me?.id, campaign?.id]);

  // Esc fecha modais abertos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showDados) setShowDados(false);
      else if (showPergaminhos) setShowPergaminhos(false);
      else if (fichaVendo) setFichaVendo(null);
      else if (showAudioPanel) setShowAudioPanel(false);
      else if (showResetModal) setShowResetModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDados, showPergaminhos, fichaVendo, showAudioPanel, showResetModal]);

  // "Tua vez" — toca som + vibration + toast quando turno fica meu
  const turnoAnteriorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!me?.id || !currentTurnUserId) return;
    if (turnoAnteriorRef.current === currentTurnUserId) return;
    turnoAnteriorRef.current = currentTurnUserId;
    if (currentTurnUserId === me.id) {
      sfxPlay("turn");
      setTuaVezToast(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        try { navigator.vibrate([60, 40, 60]); } catch {}
      }
      setTimeout(() => setTuaVezToast(false), 3500);
    }
  }, [currentTurnUserId, me?.id]);

  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    (async () => {
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) {
          router.replace(`/login?next=${encodeURIComponent(`/sala/${code}`)}`);
          return;
        }
        const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
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
          await sb.from("players").update({
            last_seen_at: new Date().toISOString(),
            display_name: (profile as Profile).nick || existing.display_name,
          }).eq("id", existing.id);
        }

        // Sessão — RPC atômico (idempotente, evita criar duplicada quando 2 abrem ao mesmo tempo)
        let sId: string | null = null;
        const { data: rpcSId, error: rpcErr } = await sb.rpc("get_or_create_current_session", { p_campaign_id: camp.id });
        if (!rpcErr && rpcSId) {
          sId = rpcSId as string;
        } else {
          // Fallback se RPC ainda não existe
          const { data: existingSession } = await sb
            .from("sessions")
            .select("id, current_turn_player_id")
            .eq("campaign_id", camp.id)
            .is("ended_at", null)
            .order("started_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (existingSession) {
            sId = (existingSession as { id: string }).id;
          } else {
            const { data: newSess } = await sb
              .from("sessions")
              .insert({ campaign_id: camp.id, session_number: 1, music_mood: "tavern" })
              .select("id")
              .maybeSingle();
            if (newSess) sId = (newSess as { id: string }).id;
          }
        }
        if (cancelled) return;
        setSessionId(sId);

        const reloadAll = async () => {
          const { data: list } = await sb.from("players").select("id, display_name, user_id, last_seen_at").eq("campaign_id", camp.id).order("created_at", { ascending: true });
          if (!cancelled) setPlayers((list as Player[]) || []);

          const { data: chars } = await sb.from("characters").select("*").eq("campaign_id", camp.id);
          if (!cancelled) {
            const map: Record<string, Character> = {};
            for (const c of chars || []) map[c.user_id] = c as Character;
            setCharacters(map);
            setMyChar(map[user.id] || null);
          }

          if (sId) {
            const { data: events } = await sb.from("combat_log").select("*").eq("session_id", sId as string).order("created_at", { ascending: true }).limit(200);
            if (!cancelled) setLog((events as LogEvent[]) || []);

            const { data: sess } = await sb.from("sessions").select("current_turn_player_id, in_combat, time_of_day, weather, doom_clocks").eq("id", sId).maybeSingle();
            if (!cancelled && sess) {
              const s = sess as { current_turn_player_id: string | null; in_combat?: boolean; time_of_day?: string; weather?: string; doom_clocks?: Record<string, { max: number; current: number; label?: string }> };
              setCurrentTurnUserId(s.current_turn_player_id);
              setEmCombate(!!s.in_combat);
              if (s.time_of_day) setTimeOfDay(s.time_of_day);
              if (s.weather) setWeather(s.weather);
              if (s.doom_clocks) setDoomClocks(s.doom_clocks);
            }

            // Iniciativa do combate atual (resilient se tabela ainda não migrada)
            const iniRes = await sb.from("combat_initiative").select("*").eq("session_id", sId as string).order("position", { ascending: true }).then((r) => r, () => ({ data: null }));
            if (!cancelled) setIniciativa((iniRes.data as IniciativaItem[]) || []);
          }

          // Pergaminhos: notas + quests + NPCs (não dependem de sessão).
          // Resilient: se tabelas novas ainda não foram migradas, vazia é ok.
          const [notasR, questsR, npcsR] = await Promise.all([
            sb.from("notes").select("*").eq("campaign_id", camp.id).order("pinned", { ascending: false }).order("updated_at", { ascending: false }).then((r) => r, () => ({ data: null })),
            sb.from("quests").select("*").eq("campaign_id", camp.id).order("created_at", { ascending: false }).then((r) => r, () => ({ data: null })),
            sb.from("npc_journal").select("*").eq("campaign_id", camp.id).order("last_seen_at", { ascending: false, nullsFirst: false }).then((r) => r, () => ({ data: null })),
          ]);
          if (!cancelled) {
            setNotas((notasR.data as NotaItem[]) || []);
            setQuests((questsR.data as QuestItem[]) || []);
            setNpcsConhecidos((npcsR.data as NpcItem[]) || []);
          }
        };

        await reloadAll();

        const ch1 = sb.channel(`sala-${camp.id}`).on(
          "postgres_changes", { event: "*", schema: "public", table: "players", filter: `campaign_id=eq.${camp.id}` }, () => reloadAll()
        ).on(
          "postgres_changes", { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${camp.id}` }, () => reloadAll()
        ).on(
          "postgres_changes", { event: "*", schema: "public", table: "notes", filter: `campaign_id=eq.${camp.id}` },
          async () => {
            const { data } = await sb.from("notes").select("*").eq("campaign_id", camp.id).order("pinned", { ascending: false }).order("updated_at", { ascending: false });
            if (!cancelled) setNotas((data as NotaItem[]) || []);
          }
        ).on(
          "postgres_changes", { event: "*", schema: "public", table: "quests", filter: `campaign_id=eq.${camp.id}` },
          async () => {
            const { data } = await sb.from("quests").select("*").eq("campaign_id", camp.id).order("created_at", { ascending: false });
            if (!cancelled) setQuests((data as QuestItem[]) || []);
          }
        ).on(
          "postgres_changes", { event: "*", schema: "public", table: "npc_journal", filter: `campaign_id=eq.${camp.id}` },
          async (payload) => {
            const { data } = await sb.from("npc_journal").select("*").eq("campaign_id", camp.id).order("last_seen_at", { ascending: false, nullsFirst: false });
            if (!cancelled) setNpcsConhecidos((data as NpcItem[]) || []);
            // Primeiro encontro: payload.eventType === 'INSERT' → mostra card épico
            if (payload.eventType === "INSERT" && payload.new) {
              const novo = payload.new as NpcItem;
              if (!cancelled) setNpcRecemConhecido(novo);
              sfxPlay("bell");
            }
          }
        ).subscribe();
        unsubs.push(() => sb.removeChannel(ch1));

        if (sId) {
          const ch2 = sb.channel(`log-${sId}`).on(
            "postgres_changes", { event: "INSERT", schema: "public", table: "combat_log", filter: `session_id=eq.${sId}` },
            (payload) => {
              const ev = payload.new as LogEvent;
              const isDmNarration = ev.actor_type === "dm" && ev.event_type === "narration";

              // Parse diretivas do texto (novo formato unificado)
              const txt = (ev.payload.text as string) || "";
              const directivesParsed = isDmNarration ? parseDirectives(txt) : [];

              const rollDir = directivesParsed.find((d) => d.kind === "roll");
              const musicDir = directivesParsed.find((d) => d.kind === "music");

              // Helper de adição com de-dup por id (evita reentrega em reconexão)
              const addLog = (newEv: LogEvent) =>
                setLog((prev) => (prev.some((e) => e.id === newEv.id) ? prev : [...prev, newEv]));

              if (isDmNarration) {
                const playAt = ev.payload.play_at as number | undefined;
                const created = new Date(ev.created_at).getTime();
                // Usa server timestamp (created_at) + offset fixo, robusto a clock skew
                const targetAt = playAt ?? created + 4000;
                const delay = Math.max(0, targetAt - Date.now());

                // TTS sincronizado
                if (ttsIsEnabled()) ttsSpeak(txt, { playAt: targetAt });

                // Música pelo diretivo OU auto-detect (ambos ou nenhum funciona)
                audioPlayFromNarration({ explicit_mood: musicDir?.mood ?? null, text: txt });

                // Aplica diretivas mecânicas (HP, SFX, NPC, QUEST etc)
                aplicarDiretivas(directivesParsed, delay);

                if (delay > 200) {
                  setMestreEscrevendo(true);
                  setAguardandoIA(false);
                  if (mestreTimeoutRef.current) clearTimeout(mestreTimeoutRef.current);
                  mestreTimeoutRef.current = setTimeout(() => {
                    addLog(ev);
                    setMestreEscrevendo(false);
                    if (rollDir) setPendingRoll({
                      raw: `${rollDir.attr || "1d20"}${rollDir.dc ? ` DC ${rollDir.dc}` : ""}${rollDir.vantage && rollDir.vantage !== "normal" ? ` ${rollDir.vantage === "advantage" ? "vantagem" : "desvantagem"}` : ""}`,
                      rolled: false,
                    });
                    if (rollDir?.vantage === "advantage") setVantageMode("advantage");
                    else if (rollDir?.vantage === "disadvantage") setVantageMode("disadvantage");
                    mestreTimeoutRef.current = null;
                  }, delay);
                } else {
                  addLog(ev);
                  setAguardandoIA(false);
                  if (rollDir) setPendingRoll({
                    raw: `${rollDir.attr || "1d20"}${rollDir.dc ? ` DC ${rollDir.dc}` : ""}`,
                    rolled: false,
                  });
                }
              } else {
                addLog(ev);
              }
            }
          ).on(
            "postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${sId}` },
            (payload) => {
              const sess = payload.new as { current_turn_player_id: string | null; music_mood?: string; in_combat?: boolean; time_of_day?: string; weather?: string; doom_clocks?: Record<string, { max: number; current: number; label?: string }> };
              setCurrentTurnUserId(sess.current_turn_player_id);
              if (typeof sess.in_combat === "boolean") setEmCombate(sess.in_combat);
              if (sess.time_of_day) setTimeOfDay(sess.time_of_day);
              if (sess.weather) setWeather(sess.weather);
              if (sess.doom_clocks) setDoomClocks(sess.doom_clocks);
            }
          ).on(
            "postgres_changes", { event: "*", schema: "public", table: "combat_initiative", filter: `session_id=eq.${sId}` },
            async () => {
              const { data } = await sb.from("combat_initiative").select("*").eq("session_id", sId as string).order("position", { ascending: true });
              if (!cancelled) setIniciativa((data as IniciativaItem[]) || []);
            }
          ).subscribe();
          unsubs.push(() => sb.removeChannel(ch2));

          // Channel separado pra broadcast "Mestre invocando" (sem ir ao DB)
          const ch3 = sb.channel(`dm-thinking-${sId}`, { config: { broadcast: { self: false } } })
            .on("broadcast", { event: "thinking-start" }, () => {
              // Outro player chamou DM — mostra loader pra mim também
              setMestreEscrevendo(true);
              if (mestreTimeoutRef.current) clearTimeout(mestreTimeoutRef.current);
              mestreTimeoutRef.current = setTimeout(() => {
                setMestreEscrevendo(false);
                mestreTimeoutRef.current = null;
              }, 60000); // safety: limpa em 60s caso DM nunca responda
            })
            .on("broadcast", { event: "thinking-stop" }, () => {
              // O loader vai parar naturalmente quando DM narration chegar (com play_at).
              // Aqui só liberamos pro caso de erro.
              if (mestreTimeoutRef.current) clearTimeout(mestreTimeoutRef.current);
              mestreTimeoutRef.current = setTimeout(() => {
                setMestreEscrevendo(false);
                mestreTimeoutRef.current = null;
              }, 1500);
            })
            .subscribe();
          dmChannelRef.current = ch3 as unknown as typeof dmChannelRef.current;
          unsubs.push(() => { sb.removeChannel(ch3); dmChannelRef.current = null; });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro";
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

  // Primeira vez que entra com música tocando ainda muteada: liga música depois do 1º click
  useEffect(() => {
    if (!audioMuted && !audioIsMuted()) {
      // Se mood tá certo mas áudio parado, force replay
      audioResumeIfBlocked();
    }
  }, [audioMuted]);

  async function logEvent(payload: { actor_type: "player" | "npc" | "dm" | "system"; actor_id?: string | null; event_type: string; payload: Record<string, unknown> }) {
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

  /** Avança turno via RPC atômico — evita race condition entre clients */
  async function setTurnoProximo() {
    if (!sessionId || players.length === 0) return;
    const sb = getSupabase();
    // Tenta RPC novo (atômico); fallback pra UPDATE se RPC ainda não existe
    const { error } = await sb.rpc("advance_turn", { p_session_id: sessionId });
    if (error) {
      // Fallback (migration 0009 não rodada ainda)
      const playersComUserId = players.filter((p) => p.user_id);
      if (playersComUserId.length === 0) return;
      const idxAtual = playersComUserId.findIndex((p) => p.user_id === currentTurnUserId);
      const proxIdx = idxAtual === -1 ? 0 : (idxAtual + 1) % playersComUserId.length;
      const proxUserId = playersComUserId[proxIdx].user_id;
      await sb.from("sessions").update({ current_turn_player_id: proxUserId }).eq("id", sessionId);
    }
  }

  /** Aplica diretivas mecânicas que vieram do Mestre (HP, SFX, NPC, QUEST etc) */
  function aplicarDiretivas(dirs: Directive[], delayMs: number) {
    const sb = getSupabase();
    for (const d of dirs) {
      switch (d.kind) {
        case "sfx": {
          // SFX toca sincronizado com o áudio (mesmo delay)
          setTimeout(() => sfxPlay(d.sfx as SFX), Math.max(0, delayMs));
          break;
        }
        case "hp": {
          // Aplica HP delta no character do nick alvo (case-insensitive).
          // Faz query ao banco (não a state) pra evitar stale closure.
          if (!campaign) break;
          setTimeout(async () => {
            const targetLower = d.target.toLowerCase();
            const { data: ps } = await sb.from("players")
              .select("user_id, display_name")
              .eq("campaign_id", campaign.id);
            const alvo = (ps || []).find((p) => ((p as { display_name?: string }).display_name || "").toLowerCase() === targetLower) as { user_id?: string } | undefined;
            if (!alvo?.user_id) return;
            const { data: ch } = await sb.from("characters")
              .select("id, hp_current, hp_max")
              .eq("campaign_id", campaign.id)
              .eq("user_id", alvo.user_id)
              .maybeSingle();
            if (!ch) return;
            const chTyped = ch as { id: string; hp_current: number; hp_max: number };
            const novoHp = Math.max(0, Math.min(chTyped.hp_max, chTyped.hp_current + d.delta));
            await sb.from("characters").update({ hp_current: novoHp }).eq("id", chTyped.id);
            if (d.delta < 0) sfxPlay("hit");
            else if (d.delta > 0) sfxPlay("heal");
            if (novoHp === 0) sfxPlay("death");
          }, Math.max(0, delayMs));
          break;
        }
        case "quest": {
          if (!campaign) break;
          setTimeout(async () => {
            if (d.action === "add") {
              await sb.from("quests").insert({
                campaign_id: campaign.id,
                title: d.title.slice(0, 200),
                status: "active",
              });
              sfxPlay("page");
            } else if (d.action === "done") {
              await sb.from("quests")
                .update({ status: "completed", completed_at: new Date().toISOString() })
                .eq("campaign_id", campaign.id)
                .eq("title", d.title.slice(0, 200));
              sfxPlay("level");
            }
          }, Math.max(0, delayMs));
          break;
        }
        case "npc": {
          if (!campaign || !d.name) break;
          setTimeout(async () => {
            await sb.from("npc_journal").upsert({
              campaign_id: campaign.id,
              name: d.name.slice(0, 80),
              appearance: d.appearance?.slice(0, 200) || null,
              bordao: d.bordao?.slice(0, 200) || null,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: "campaign_id,name" });
            sfxPlay("bell");
          }, Math.max(0, delayMs));
          break;
        }
        case "reward": {
          // Reward é registrada no log, aplicação manual depois
          if (d.amount) setTimeout(() => sfxPlay("coins"), Math.max(0, delayMs));
          break;
        }
        case "combat": {
          if (d.phase === "start") {
            setTimeout(() => sfxPlay("sword"), Math.max(0, delayMs));
            setTimeout(async () => {
              if (sessionId) await sb.from("sessions").update({ in_combat: true }).eq("id", sessionId);
            }, Math.max(0, delayMs));
          } else {
            setTimeout(async () => {
              if (sessionId) await sb.from("sessions").update({ in_combat: false }).eq("id", sessionId);
            }, Math.max(0, delayMs));
          }
          break;
        }
        case "initiative": {
          setTimeout(async () => {
            sfxPlay("sword");
            if (!sessionId || !campaign) return;
            // Auto-popula iniciativa pra todos os players da campanha (rolagem 1d20+modDES)
            const { data: ps } = await sb.from("players")
              .select("user_id, display_name")
              .eq("campaign_id", campaign.id);
            const validPs = (ps || []).filter((p) => (p as { user_id?: string }).user_id);
            const { data: chs } = await sb.from("characters")
              .select("user_id, name, hp_current, hp_max, ac, des_attr")
              .eq("campaign_id", campaign.id);
            const charMap = new Map<string, { name: string; hp_current: number; hp_max: number; ac: number; des_attr: number }>();
            for (const c of chs || []) charMap.set((c as { user_id: string }).user_id, c as never);
            // Limpa iniciativa anterior
            await sb.from("combat_initiative").delete().eq("session_id", sessionId);
            // Insere cada player com sua iniciativa rolada
            const rows = validPs.map((p, i) => {
              const pp = p as { user_id: string; display_name: string };
              const ch = charMap.get(pp.user_id);
              const desMod = ch ? Math.floor((ch.des_attr - 10) / 2) : 0;
              const ini = 1 + Math.floor(Math.random() * 20) + desMod;
              return {
                session_id: sessionId,
                actor_type: "player",
                actor_id: pp.user_id,
                display_name: ch?.name || pp.display_name,
                initiative: ini,
                position: i, // será reordenado abaixo
                hp_current: ch?.hp_current ?? null,
                hp_max: ch?.hp_max ?? null,
                ac: ch?.ac ?? null,
                is_current: false,
              };
            });
            // Ordena por iniciativa desc
            rows.sort((a, b) => b.initiative - a.initiative);
            rows.forEach((r, i) => {
              r.position = i;
              r.is_current = i === 0;
            });
            await sb.from("combat_initiative").insert(rows);
            await sb.from("sessions").update({ in_combat: true }).eq("id", sessionId);
          }, Math.max(0, delayMs));
          break;
        }
        case "attack": {
          // Player que tá pegando essa diretiva pode rolar o ataque
          if (d.dice) {
            setTimeout(() => {
              setPendingAttack({ alvo: d.alvo || "alvo", dice: d.dice!, ac: d.ac });
              sfxPlay("sword");
            }, Math.max(0, delayMs));
          }
          break;
        }
        case "level": {
          setTimeout(() => sfxPlay("level"), Math.max(0, delayMs));
          break;
        }
        case "clock": {
          if (!sessionId) break;
          setTimeout(async () => {
            // Lê o estado atual, atualiza, escreve de volta (best-effort, sem CAS)
            const { data: sess } = await sb.from("sessions")
              .select("doom_clocks")
              .eq("id", sessionId)
              .maybeSingle();
            const clocks = (sess as { doom_clocks?: Record<string, { max: number; current: number; label?: string }> } | null)?.doom_clocks || doomClocks;
            const c = clocks[d.name];
            if (!c) return;
            let novo = d.op === "set" ? d.value : c.current + d.value;
            novo = Math.max(0, Math.min(c.max, novo));
            const updated = { ...clocks, [d.name]: { ...c, current: novo } };
            await sb.from("sessions").update({ doom_clocks: updated }).eq("id", sessionId);
            // Trovão se chegou no max (doom realizado)
            if (novo >= c.max && d.name === "doom") sfxPlay("thunder");
            else sfxPlay("page");
          }, Math.max(0, delayMs));
          break;
        }
        case "aside": {
          // Aside privado — só o player alvo recebe (lateral, em modal)
          if (!me?.nick || d.target.toLowerCase() !== me.nick.toLowerCase()) break;
          setTimeout(() => {
            setAsideRecebido(d.text);
            sfxPlay("bell");
          }, Math.max(0, delayMs));
          break;
        }
        case "xp": {
          if (!campaign) break;
          setTimeout(async () => {
            const targetLower = d.target.toLowerCase();
            const { data: ps } = await sb.from("players")
              .select("user_id, display_name")
              .eq("campaign_id", campaign.id);
            const alvo = (ps || []).find((p) => ((p as { display_name?: string }).display_name || "").toLowerCase() === targetLower) as { user_id?: string } | undefined;
            if (!alvo?.user_id) return;
            const { data: ch } = await sb.from("characters")
              .select("id, xp")
              .eq("campaign_id", campaign.id)
              .eq("user_id", alvo.user_id)
              .maybeSingle();
            if (!ch) return;
            const chTyped = ch as { id: string; xp: number | null };
            const novoXp = (chTyped.xp || 0) + d.amount;
            await sb.from("characters").update({ xp: novoXp }).eq("id", chTyped.id);
            sfxPlay("coins");
          }, Math.max(0, delayMs));
          break;
        }
        case "inspiration": {
          setTimeout(() => sfxPlay("bell"), Math.max(0, delayMs));
          break;
        }
        case "time":
        case "weather": {
          if (sessionId) {
            setTimeout(async () => {
              const update: Record<string, string> = {};
              if (d.kind === "time") update.time_of_day = d.value;
              else update.weather = d.value;
              await sb.from("sessions").update(update).eq("id", sessionId);
            }, Math.max(0, delayMs));
          }
          break;
        }
      }
    }
  }

  async function chamarDM(prompt: string, isOpening = false) {
    if (!campaign || !sessionId || aguardandoIA) return;

    // Lock atômico: previne 2 jogadores chamarem DM simultaneamente.
    // Se RPC ainda não migrou, ignora e segue (degradação graciosa).
    const sb = getSupabase();
    try {
      const { data: locked } = await sb.rpc("try_lock_dm", { p_session_id: sessionId });
      if (locked === false) {
        await logEvent({
          actor_type: "system",
          event_type: "info",
          payload: { text: "Mestre já está invocando outra cena — aguarda." },
        });
        return;
      }
    } catch {} // RPC não existe ainda — fallback OK

    setAguardandoIA(true);

    // Broadcast: outros clientes mostram loader também (não só quem mandou)
    try {
      dmChannelRef.current?.send({ type: "broadcast", event: "thinking-start" });
    } catch {}

    if (!isOpening) {
      await logEvent({
        actor_type: "player",
        event_type: "speak",
        payload: { text: prompt, nick: me?.nick || "viajante" },
      });
    }

    const { data: recent } = await sb.from("combat_log").select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(15);

    const messages = ((recent as LogEvent[]) || [])
      .reverse()
      .filter((e) => ["narration", "speak", "roll"].includes(e.event_type))
      .map((e) => ({
        role: e.actor_type === "dm" ? ("assistant" as const) : ("user" as const),
        content: e.actor_type === "dm"
          ? (e.payload.text as string) || ""
          : `[${e.payload.nick || "viajante"}]: ${(e.payload.text as string) || JSON.stringify(e.payload)}`,
      }));

    if (isOpening) {
      messages.push({ role: "user", content: prompt });
    } else if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      messages.push({ role: "user", content: `[${me?.nick || "viajante"}]: ${prompt}` });
    }

    const playerCtx = players.map((p) => {
      const ch = characters[p.user_id || ""] || null;
      return {
        nick: p.display_name,
        character: ch ? {
          name: ch.name,
          race: RACAS.find((r) => r.key === ch.race)?.nome || ch.race,
          class: CLASSES.find((c) => c.key === ch.class)?.nome || ch.class,
          hp: ch.hp_current, hp_max: ch.hp_max,
        } : undefined,
      };
    });

    try {
      // Contexto rico — clocks, quests ativas, NPCs conhecidos, ambiente
      const activeQuests = quests.filter((q) => q.status === "active").slice(0, 8).map((q) => q.title);
      const knownNpcs = npcsConhecidos.slice(0, 12).map((n) => ({
        name: n.name,
        appearance: n.appearance || undefined,
        bordao: n.bordao || undefined,
        relation: n.relation,
      }));
      const clocksState: Record<string, string> = {};
      for (const [k, v] of Object.entries(doomClocks)) {
        clocksState[k] = `${v.current}/${v.max}${v.label ? ` (${v.label})` : ""}`;
      }

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
            active_quests: activeQuests,
            known_npcs: knownNpcs,
            clocks: clocksState,
            time_of_day: timeOfDay,
            weather: weather,
            in_combat: emCombate,
          },
        }),
      });
      // Captura resposta como texto antes de parsear — pra não dar JSON parse error
      const raw = await r.text();
      let data: { error?: string; details?: string[]; text?: string; directives?: { roll?: string; music_mood?: string }; provider?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        // Resposta veio como HTML/texto — provavelmente timeout ou crash da Vercel
        throw new Error(`resposta inválida do servidor (${r.status}): ${raw.slice(0, 100)}`);
      }
      if (!r.ok) {
        const detail = data.details ? ` — ${data.details.join(" | ")}` : "";
        throw new Error((data.error || "Mestre fora") + detail);
      }
      if (!data.text) {
        throw new Error("Mestre não respondeu (texto vazio)");
      }

      // O texto cru vai pro DB com diretivas embutidas — o realtime parser cuida.
      // Mas mantemos uma versão limpa pra exibir (pra evitar [TAG] aparecer pro player).
      const textComDirs = (data.text as string).trim();

      // Sincronização: marca timestamp futuro de 5s pra todos os clients tocarem juntos
      const playAt = Date.now() + 5000;
      await logEvent({
        actor_type: "dm",
        event_type: "narration",
        payload: {
          text: textComDirs, // texto cru com diretivas — parser do client extrai
          directives: data.directives,
          provider: data.provider,
          play_at: playAt,
        },
      });

      // Avança turno automaticamente após resposta da IA (se não pediu roll)
      const dirs = parseDirectives(textComDirs);
      const pediuRoll = dirs.some((d) => d.kind === "roll" || d.kind === "attack" || d.kind === "initiative");
      if (!isOpening && !pediuRoll) {
        await setTurnoProximo();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      await logEvent({
        actor_type: "system",
        event_type: "error",
        payload: { text: `Mestre se calou: ${msg}` },
      });
      try {
        dmChannelRef.current?.send({ type: "broadcast", event: "thinking-stop" });
      } catch {}
    } finally {
      setAguardandoIA(false);
      // Libera o lock independente de sucesso/falha
      try {
        if (sessionId) await sb.rpc("release_dm_lock", { p_session_id: sessionId });
      } catch {}
    }
  }

  async function rolarDado(expr: string, contexto?: string, vantage: Vantage = "normal") {
    const efetivaVantage = vantage !== "normal" ? vantage : vantageMode;
    const r = rolarDados(expr, efetivaVantage);
    if (!r) return;
    sfxPlay("dice");
    if (r.critical) sfxPlay("crit");
    else if (r.fumble) sfxPlay("fumble");
    const vantageStr = r.bothD20
      ? ` (${r.vantage === "advantage" ? "vantagem" : "desvantagem"}: ${r.bothD20[0]} ${r.vantage === "advantage" ? "↑" : "↓"} ${r.bothD20[1]})`
      : "";
    await logEvent({
      actor_type: "player",
      event_type: "roll",
      payload: {
        nick: me?.nick || "viajante",
        text: contexto
          ? `${contexto}: ${expr}${vantageStr} → ${r.total}${r.critical ? " ⚜ CRÍTICO" : r.fumble ? " ☠ falha crítica" : ""}`
          : `${expr}${vantageStr} → ${r.total}`,
        result: r,
      },
    });
    setShowDados(false);
    if (pendingRoll) setPendingRoll({ ...pendingRoll, rolled: true });
    setVantageMode("normal"); // reseta após rolar
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

  async function usarItem(item: InventoryItem) {
    if (!myChar || !item.consumivel) return;
    const sb = getSupabase();
    // Loga o uso
    await logEvent({
      actor_type: "player",
      event_type: "speak",
      payload: { text: `Usa: ${item.nome} — ${item.desc || ""}`, nick: me?.nick || "viajante" },
    });
    // Remove do inventário
    const novoInventario = myChar.inventory.filter((i) => i.id !== item.id);
    await sb.from("characters").update({ inventory: novoInventario }).eq("id", myChar.id);
    // Cura instantânea pra poção de cura
    if (item.id === "pocao-cura") {
      const cura = 6 + Math.floor(Math.random() * 5) + Math.floor(Math.random() * 5);
      const novoHP = Math.min(myChar.hp_max, myChar.hp_current + cura);
      await sb.from("characters").update({ hp_current: novoHP }).eq("id", myChar.id);
      await logEvent({
        actor_type: "system",
        event_type: "heal",
        payload: { text: `${myChar.name} curou ${cura} HP (${myChar.hp_current} → ${novoHP})` },
      });
    }
  }

  async function enviarAcao(e?: React.FormEvent) {
    e?.preventDefault();
    const txt = acaoTexto.trim().slice(0, 1000); // hard limit 1000 chars
    if (!txt || aguardandoIA) return;
    if (!ehMeuTurno) return;
    setAcaoTexto("");
    await chamarDM(txt);
  }

  async function abrirCenaInicial() {
    if (!sessionId || aguardandoIA) return;
    // O click do admin é uma user gesture — libera autoplay do browser.
    // Auto-liga TTS + música. Pra desligar, o player clica nos toggles.
    if (!ttsIsEnabled()) {
      ttsSetEnabled(true);
      setTtsOn(true);
    }
    if (audioIsMuted()) {
      audioSetMuted(false);
      setAudioMuted(false);
    }
    // Música começa SÍNCRONO dentro do click handler (autoplay-friendly)
    audioPlayMood("tavern");
    setMusicaTocando(true);

    await chamarDM(DM_OPENING_PROMPT, true);
    if (players.length > 0) {
      const sb = getSupabase();
      const primeiro = players.find((p) => p.user_id);
      if (primeiro) {
        await sb.from("sessions").update({ current_turn_player_id: primeiro.user_id }).eq("id", sessionId);
      }
    }
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
      setError(e instanceof Error ? e.message : "Erro");
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
    if (novo) {
      audioStop();
      setMusicaTocando(false);
    } else {
      // Importante: chamar audioPlayMood SÍNCRONO dentro do click handler
      audioPlayMood("tavern");
      setTimeout(() => setMusicaTocando(audioIsPlaying()), 500);
    }
  }

  function toggleTtsPause() {
    if (ttsIsPaused()) {
      ttsResume();
      setTtsPaused(false);
    } else {
      ttsPause();
      setTtsPaused(true);
    }
  }

  function setVolume(v: number) {
    setAudioVol(v);
    audioSetVolume(v);
  }

  function replayUltimaNarracao() {
    const ultimas = log.filter((e) => e.actor_type === "dm" && e.event_type === "narration");
    const ultima = ultimas[ultimas.length - 1];
    if (ultima) {
      ttsSpeak((ultima.payload.text as string) || "", { force: true });
    }
  }

  function replayNarracao(text: string) {
    ttsSpeak(text, { force: true });
  }

  if (loading) {
    return <main className="flex-1 flex items-center justify-center pergaminho-texture">
      <p className="text-[var(--color-pergaminho-velho)] italic">Convocando os antigos…</p>
    </main>;
  }

  if (error) {
    return <main className="flex-1 flex flex-col items-center justify-center px-6 pergaminho-texture text-center">
      <h2 className="text-3xl text-[var(--color-sangue)] mb-4">Pergaminho rasgado</h2>
      <p className="text-[var(--color-pergaminho)] mb-8 max-w-md">{error}</p>
      <Link href="/"><button className="btn-selo">Voltar ao Reino</button></Link>
    </main>;
  }

  if (!myChar) {
    return (
      <main className="relative min-h-screen px-6 py-8 pergaminho-texture">
        <header className="max-w-5xl mx-auto flex items-center justify-between mb-8">
          <Link href="/" className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">← La Vierta</Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/conta" className="text-[var(--color-pergaminho)] hover:text-[var(--color-dourado)]">
              <span className="text-[var(--color-dourado)]">{me?.nick}</span>
              {me?.role === "admin" && <span className="ml-1 text-xs text-[var(--color-sangue)]">⚜</span>}
            </Link>
            <button onClick={logout} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-xs uppercase tracking-widest">Sair</button>
          </div>
        </header>
        <div className="max-w-2xl mx-auto epico-entrada text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] mb-2">Sala · {campaign?.code}</p>
          <h1 className="text-4xl md:text-5xl text-[var(--color-dourado-claro)] dourado-glow mb-4">{campaign?.name}</h1>
          <div className="w-24 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent mb-8" />
          <p className="text-[var(--color-pergaminho)] italic mb-12">{campaign?.lore_intro}</p>
          <div className="bg-[var(--color-vinho)]/20 border border-[var(--color-dourado)]/40 rounded-lg p-8 mb-8">
            <h2 className="text-2xl text-[var(--color-dourado)] mb-3 font-[family-name:var(--font-cinzel)]">Tu ainda não tens forma</h2>
            <p className="text-sm text-[var(--color-pergaminho)] mb-6">
              Antes de cruzar o portão da aventura, precisas escolher tua linhagem, classe e história.
            </p>
            <Link href={`/sala/${code}/personagem`}><button className="btn-selo">Forjar viajante</button></Link>
          </div>
        </div>
      </main>
    );
  }

  const isAdmin = me?.role === "admin";
  const ehMeuTurno = !currentTurnUserId || currentTurnUserId === me?.id;

  // Overlay visual de tempo/clima (não-intrusivo, fica acima do conteúdo)
  const ambienteOverlay = (() => {
    const overlays: string[] = [];
    if (timeOfDay === "night") overlays.push("bg-blue-950/30");
    else if (timeOfDay === "dusk") overlays.push("bg-orange-900/15");
    else if (timeOfDay === "dawn") overlays.push("bg-rose-900/10");
    if (weather === "rain") overlays.push("ambiente-chuva");
    else if (weather === "storm") overlays.push("ambiente-tempestade");
    else if (weather === "fog") overlays.push("ambiente-nevoa");
    else if (weather === "snow") overlays.push("ambiente-neve");
    return overlays.join(" ");
  })();

  return (
    <main className={`min-h-screen pergaminho-texture flex flex-col relative ${ambienteOverlay}`}>
      {/* Camada visual ambiente (overlay) */}
      {ambienteOverlay && (
        <div className="pointer-events-none fixed inset-0 z-[5] mix-blend-multiply transition-opacity duration-1000" />
      )}
      <header className="border-b border-[var(--color-pergaminho-velho)]/20 px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 flex-wrap">
        <Link href="/" className="text-[10px] sm:text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">← <span className="hidden sm:inline">La Vierta</span></Link>
        <div className="flex-1 text-center min-w-0 hidden sm:block">
          <span className="text-xs uppercase tracking-widest text-[var(--color-pedra)] truncate block">
            {campaign?.name} · Cap. {campaign?.current_chapter}
            <span className="ml-3 text-[var(--color-pergaminho-velho)]" title={`${timeOfDay} · ${weather}`}>
              {timeOfDay === "night" ? "🌙" : timeOfDay === "dusk" ? "🌅" : timeOfDay === "dawn" ? "🌄" : "☀"}
              {weather === "rain" ? " ☔" : weather === "storm" ? " ⛈" : weather === "snow" ? " ❄" : weather === "fog" ? " 🌫" : ""}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-sm">
          <button onClick={toggleTTS} title="Voz do mestre"
            className={`text-xs uppercase tracking-widest transition ${ttsOn ? "text-[var(--color-dourado)]" : "text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]"}`}>
            {ttsOn ? "🔊" : "🔇"}
          </button>
          <button onClick={toggleTtsPause} title={ttsPaused ? "Continuar narração" : "Pausar narração"}
            className="text-xs text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">
            {ttsPaused ? "▶" : "⏸"}
          </button>
          <button onClick={replayUltimaNarracao} title="Repetir última narração"
            className="text-xs text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">↻</button>
          <button onClick={() => setShowPergaminhos(true)} title="Pergaminhos: notas, missões, NPCs"
            className="text-xs text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] relative">
            📜
            {(quests.filter((q) => q.status === "active").length > 0) && (
              <span className="absolute -top-1 -right-2 bg-[var(--color-dourado)] text-[var(--color-carvao)] text-[8px] rounded-full px-1 leading-none py-0.5">
                {quests.filter((q) => q.status === "active").length}
              </span>
            )}
          </button>
          <div className="relative">
            <button onClick={() => setShowAudioPanel((s) => !s)} title="Música"
              className={`text-xs uppercase tracking-widest transition ${musicaTocando ? "text-[var(--color-dourado)] animate-pulse" : "text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]"}`}>
              {musicaTocando ? "♪" : "♫"}
            </button>
            {showAudioPanel && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-[var(--color-carvao)] border border-[var(--color-dourado)]/60 rounded-lg p-4 z-30 shadow-xl">
                <button
                  onClick={toggleAudio}
                  className={`w-full px-3 py-2 rounded text-xs uppercase tracking-widest mb-3 transition ${
                    musicaTocando
                      ? "bg-[var(--color-vinho)]/40 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)]"
                      : "bg-[var(--color-vinho)] border border-[var(--color-dourado)] text-[var(--color-pergaminho)]"
                  }`}
                >
                  {audioMuted ? "▶ Tocar música" : musicaTocando ? "⏸ Silenciar" : "▶ Retomar (autoplay bloqueado — clica)"}
                </button>
                <label className="text-[10px] uppercase tracking-widest text-[var(--color-pergaminho-velho)] block mb-1">Música</label>
                <input type="range" min="0" max="1" step="0.05" value={audioVol} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full" />
                <label className="text-[10px] uppercase tracking-widest text-[var(--color-pergaminho-velho)] block mb-1 mt-3">SFX</label>
                <input type="range" min="0" max="1" step="0.05" value={sfxVol} onChange={(e) => { const v = parseFloat(e.target.value); setSfxVol(v); sfxSetVolume(v); }} className="w-full" />
                <p className="text-[10px] text-[var(--color-pedra)] mt-3 italic">A trilha muda conforme a cena.</p>
              </div>
            )}
          </div>
          <Link href="/conta" className="text-[var(--color-pergaminho)] hover:text-[var(--color-dourado)]">
            <span className="text-[var(--color-dourado)]">{me?.nick}</span>
            {isAdmin && <span className="ml-1 text-xs text-[var(--color-sangue)]">⚜</span>}
          </Link>
          <button onClick={logout} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-xs uppercase tracking-widest">Sair</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto">
        {/* Liga */}
        <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-[var(--color-pergaminho-velho)]/20 p-3 sm:p-4">
          <button
            onClick={() => setShowLiga((s) => !s)}
            className="lg:hidden w-full flex items-baseline justify-between text-xs uppercase tracking-widest text-[var(--color-dourado)] mb-2"
          >
            <span>Liga ({players.filter((p) => p.last_seen_at && Date.now() - new Date(p.last_seen_at).getTime() < 60000).length} online)</span>
            <span>{showLiga ? "▲" : "▼"}</span>
          </button>
          <div className={`${showLiga ? "block" : "hidden"} lg:block`}>
          <h2 className="hidden lg:block text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-3">Liga</h2>
          <ul className="space-y-2">
            {players.map((p) => {
              const ch = characters[p.user_id || ""];
              const isMe = p.user_id === me?.id;
              const ehTurnoDele = currentTurnUserId === p.user_id;
              // Online se atualizou last_seen_at nos últimos 60s
              const lastSeen = p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
              const online = Date.now() - lastSeen < 60000;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => p.user_id && ch && setFichaVendo(p.user_id)}
                    disabled={!ch}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded transition text-left ${
                      isMe ? "bg-[var(--color-vinho)]/20 border border-[var(--color-dourado)]/30" : "border border-transparent hover:border-[var(--color-pergaminho-velho)]/30"
                    } ${ehTurnoDele ? "ring-2 ring-[var(--color-dourado)]/60" : ""} ${ch ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="relative flex-shrink-0">
                      {ch?.portrait_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={ch.portrait_url} alt={ch.name} className={`w-8 h-8 rounded-full object-cover border border-[var(--color-dourado)]/40 ${!online ? "grayscale opacity-60" : ""}`} loading="lazy" />
                      ) : (
                        <span className="w-8 h-8 rounded-full bg-[var(--color-pedra)]/40 flex items-center justify-center text-xs text-[var(--color-pergaminho-velho)]">
                          {(ch?.name || p.display_name).slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[var(--color-carvao)] ${online ? "bg-emerald-500" : "bg-[var(--color-pedra)]"}`}
                        title={online ? "Online" : "Offline"}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--color-pergaminho)] truncate flex items-center gap-1">
                        {ch?.name || p.display_name}
                        {ehTurnoDele && <span className="text-[var(--color-dourado)] text-[10px]">▸</span>}
                      </div>
                      {ch && (
                        <div className="text-[10px] text-[var(--color-pergaminho-velho)] uppercase tracking-wider">
                          {RACAS.find((r) => r.key === ch.race)?.nome.split(" ")[0]} · {CLASSES.find((c) => c.key === ch.class)?.nome}
                        </div>
                      )}
                    </div>
                    {ch && <div className="text-[10px] text-[var(--color-sangue)]">{ch.hp_current}/{ch.hp_max}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-[var(--color-pedra)] mt-2 italic">Clica num para ver ficha</p>

          {isAdmin && (
            <div className="mt-6 pt-4 border-t border-[var(--color-pergaminho-velho)]/20 space-y-2">
              <button onClick={setTurnoProximo} className="text-xs text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)] uppercase tracking-widest block">
                ▸ Passar turno
              </button>
              <button onClick={() => setShowResetModal(true)} className="text-xs text-[var(--color-sangue)] hover:text-[var(--color-pergaminho)] uppercase tracking-widest block">
                ⚜ Resetar campanha
              </button>
            </div>
          )}
          </div>
        </aside>

        {/* Log */}
        <section className="flex-1 flex flex-col min-h-[60vh] max-h-[calc(100vh-120px)] lg:max-h-[calc(100vh-60px)]">
          {/* Doom clocks — sempre visível (Vincent Baker) */}
          <ClocksBar clocks={doomClocks} />
          {/* Tracker de iniciativa — só aparece em combate */}
          {emCombate && iniciativa.length > 0 && (
            <IniciativaTracker iniciativa={iniciativa} myUserId={me?.id} isAdmin={isAdmin} />
          )}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {log.length === 0 && (
              <div className="text-center py-12">
                <p className="text-[var(--color-pergaminho-velho)] italic mb-6">
                  A campanha ainda não começou. {isAdmin ? "Clica abaixo pra abrir a cena inicial." : "Aguardando o admin abrir a cena…"}
                </p>
                {isAdmin && (
                  <button onClick={abrirCenaInicial} disabled={aguardandoIA} className="btn-selo disabled:opacity-50">
                    {aguardandoIA ? "Mestre invocando…" : "Abrir cena inicial"}
                  </button>
                )}
              </div>
            )}
            {log.map((ev) => (
              <LogEntry key={ev.id} ev={ev} myUserId={me?.id} onReplay={replayNarracao} />
            ))}
            {(aguardandoIA || mestreEscrevendo) && (
              <MestreInvocando estagio={mestreEscrevendo ? "narrando" : "tecendo"} />
            )}
            <div ref={logEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={enviarAcao} className="border-t border-[var(--color-pergaminho-velho)]/20 p-3 flex gap-2 bg-[var(--color-carvao)]/40">
            <button type="button" onClick={() => setShowDados(true)} title="Rolar dados"
              className="px-3 py-2 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-dourado)] text-sm hover:border-[var(--color-dourado)] flex-shrink-0">
              🎲
            </button>
            {pendingRoll && !pendingRoll.rolled && ehMeuTurno && (
              <button type="button" onClick={() => {
                // Parse atributo da diretriz (FOR/DES/CON/INT/SAB/CAR ou STR/DEX/etc)
                const m = pendingRoll.raw.match(/\b(for|des|con|int|sab|car|str|dex|wis|cha)\b/i);
                let attrKey: "for" | "des" | "con" | "int" | "sab" | "car" | undefined;
                if (m) {
                  const a = m[1].toLowerCase();
                  attrKey = (a === "str" ? "for" : a === "dex" ? "des" : a === "wis" ? "sab" : a === "cha" ? "car" : a) as typeof attrKey;
                }
                rolarComMod("1d20", attrKey);
              }}
                className="px-3 py-2 rounded bg-[var(--color-dourado)]/30 border border-[var(--color-dourado)] text-[var(--color-dourado-claro)] text-xs uppercase tracking-widest hover:bg-[var(--color-dourado)]/50 flex-shrink-0">
                Rolar: {pendingRoll.raw}
              </button>
            )}
            {pendingAttack && ehMeuTurno && (
              <button type="button" onClick={async () => {
                // Rola ataque + compara com AC
                const r = rolarDados(pendingAttack.dice, vantageMode);
                if (!r) return;
                sfxPlay("dice");
                if (r.critical) sfxPlay("crit");
                else if (r.fumble) sfxPlay("fumble");
                const hit = pendingAttack.ac !== undefined ? r.total >= pendingAttack.ac : true;
                const resultStr = pendingAttack.ac !== undefined
                  ? `${r.total} vs CA ${pendingAttack.ac} → ${r.critical ? "⚜ CRÍTICO" : hit ? "✓ ACERTOU" : r.fumble ? "☠ ERROU CRÍTICO" : "✗ errou"}`
                  : `${r.total}`;
                if (hit) sfxPlay("hit");
                await logEvent({
                  actor_type: "player",
                  event_type: "roll",
                  payload: {
                    nick: me?.nick || "viajante",
                    text: `Ataque em ${pendingAttack.alvo}: ${pendingAttack.dice} → ${resultStr}`,
                    result: r,
                  },
                });
                setPendingAttack(null);
                setVantageMode("normal");
              }}
                className="px-3 py-2 rounded bg-[var(--color-sangue)]/30 border border-[var(--color-sangue)] text-[var(--color-pergaminho)] text-xs uppercase tracking-widest hover:bg-[var(--color-sangue)]/50 flex-shrink-0">
                ⚔ Atacar {pendingAttack.alvo}
              </button>
            )}
            <input
              type="text"
              value={acaoTexto}
              maxLength={1000}
              onChange={(e) => setAcaoTexto(e.target.value.slice(0, 1000))}
              placeholder={ehMeuTurno ? "Tua vez. Descreve a ação…" : `Aguardando ${players.find((p) => p.user_id === currentTurnUserId)?.display_name || "outro jogador"}…`}
              disabled={aguardandoIA || !ehMeuTurno}
              className="flex-1 px-3 py-2 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)] text-sm disabled:opacity-50"
            />
            {acaoTexto.length > 800 && (
              <span className="text-[10px] text-[var(--color-pergaminho-velho)] self-center hidden sm:inline">
                {acaoTexto.length}/1000
              </span>
            )}
            <button type="submit" disabled={!acaoTexto.trim() || aguardandoIA || !ehMeuTurno}
              className="px-4 py-2 rounded bg-[var(--color-vinho)] border border-[var(--color-dourado)] text-[var(--color-pergaminho)] text-xs uppercase tracking-widest hover:bg-[var(--color-sangue)] disabled:opacity-40 flex-shrink-0">
              Falar
            </button>
          </form>
        </section>

        {/* Ficha */}
        <aside className="lg:w-72 border-t lg:border-t-0 lg:border-l border-[var(--color-pergaminho-velho)]/20 p-4 overflow-y-auto">
          <button onClick={() => setShowFicha((s) => !s)} className="lg:hidden text-xs uppercase tracking-widest text-[var(--color-dourado)] mb-3">
            {showFicha ? "▲" : "▼"} Ficha
          </button>
          <div className={`${showFicha ? "block" : "hidden"} lg:block`}>
            <Ficha char={myChar} onUsarItem={usarItem} />
          </div>
        </aside>
      </div>

      {/* Modal dados */}
      {showDados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6" onClick={() => setShowDados(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--color-carvao)] border border-[var(--color-dourado)] rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl text-[var(--color-dourado)] mb-4 font-[family-name:var(--font-cinzel)]">Rolar dados</h2>

            {/* Vantagem / Normal / Desvantagem */}
            <div className="grid grid-cols-3 gap-1 mb-4 p-1 bg-[var(--color-carvao)]/80 rounded border border-[var(--color-pergaminho-velho)]/20">
              {([
                { v: "advantage", label: "Vantagem", cor: "text-emerald-400 border-emerald-400/60" },
                { v: "normal",    label: "Normal",   cor: "text-[var(--color-pergaminho)] border-[var(--color-pergaminho-velho)]/40" },
                { v: "disadvantage", label: "Desvantagem", cor: "text-red-400 border-red-400/60" },
              ] as const).map((opt) => (
                <button
                  key={opt.v}
                  onClick={() => setVantageMode(opt.v)}
                  className={`px-2 py-1.5 rounded text-[10px] uppercase tracking-widest border ${
                    vantageMode === opt.v ? `${opt.cor} bg-[var(--color-vinho)]/30` : "text-[var(--color-pergaminho-velho)] border-transparent hover:border-[var(--color-pergaminho-velho)]/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {DADOS_PADRAO.map((d) => (
                <button key={d.label} onClick={() => rolarDado(d.expr)}
                  className="px-3 py-2 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)] hover:text-[var(--color-dourado)]">
                  {d.label}
                </button>
              ))}
            </div>
            <p className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-2">d20 + atributo</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["for", "des", "con", "int", "sab", "car"] as const).map((k) => (
                <button key={k} onClick={() => rolarComMod("1d20", k)}
                  className="px-2 py-1.5 rounded border border-[var(--color-pergaminho-velho)]/40 text-xs text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)]">
                  {k.toUpperCase()} ({modAtributo(myChar[`${k}_attr` as const]) >= 0 ? "+" : ""}{modAtributo(myChar[`${k}_attr` as const])})
                </button>
              ))}
            </div>
            <button onClick={() => setShowDados(false)} className="btn-selo-secundario w-full text-xs">Fechar</button>
          </div>
        </div>
      )}

      {/* Modal ficha de outro player */}
      {fichaVendo && characters[fichaVendo] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6" onClick={() => setFichaVendo(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[var(--color-carvao)] border border-[var(--color-dourado)] rounded-lg p-6 max-w-md w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-xl text-[var(--color-dourado)] font-[family-name:var(--font-cinzel)]">Ficha</h2>
              <button onClick={() => setFichaVendo(null)} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-xl leading-none">×</button>
            </div>
            <Ficha char={characters[fichaVendo]} compact={fichaVendo !== me?.id} onUsarItem={fichaVendo === me?.id ? usarItem : undefined} />
          </div>
        </div>
      )}

      {/* Toast: TUA VEZ */}
      {tuaVezToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] pointer-events-none animate-[tuaVez_3.5s_ease-out]">
          <div className="bg-gradient-to-r from-[var(--color-vinho)] via-[var(--color-dourado)]/90 to-[var(--color-vinho)] border-2 border-[var(--color-dourado)] rounded-lg px-8 py-3 shadow-2xl">
            <p className="text-2xl text-[var(--color-carvao)] font-[family-name:var(--font-cinzel)] uppercase tracking-widest font-bold">
              Tua vez, {me?.nick}
            </p>
          </div>
          <style jsx>{`
            @keyframes tuaVez {
              0%   { opacity: 0; transform: translate(-50%, -20px) scale(0.85); }
              10%  { opacity: 1; transform: translate(-50%, 0) scale(1.05); }
              20%  { transform: translate(-50%, 0) scale(1); }
              80%  { opacity: 1; transform: translate(-50%, 0) scale(1); }
              100% { opacity: 0; transform: translate(-50%, -10px) scale(0.95); }
            }
          `}</style>
        </div>
      )}

      {/* Modal NPC recém-conhecido — flair épico no primeiro encontro */}
      {npcRecemConhecido && (
        <NpcEncontroModal npc={npcRecemConhecido} onClose={() => setNpcRecemConhecido(null)} />
      )}

      {/* Aside privado: info que só meu personagem viu */}
      {asideRecebido && (
        <AsidePrivadoModal text={asideRecebido} onClose={() => setAsideRecebido(null)} />
      )}

      {/* Modal Pergaminhos: notas + quests + NPCs */}
      {showPergaminhos && me && campaign && (
        <Pergaminhos
          campaignId={campaign.id}
          userId={me.id}
          isAdmin={isAdmin}
          notas={notas}
          quests={quests}
          npcs={npcsConhecidos}
          onClose={() => setShowPergaminhos(false)}
        />
      )}

      {/* Modal reset */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6">
          <div className="bg-[var(--color-carvao)] border border-[var(--color-sangue)] rounded-lg p-8 max-w-md w-full">
            <h2 className="text-2xl text-[var(--color-sangue)] mb-4 font-[family-name:var(--font-cinzel)]">Resetar campanha?</h2>
            <p className="text-[var(--color-pergaminho)] text-sm mb-4">
              Apaga personagens, sessões, NPCs, locais, quests, memórias.
            </p>
            <p className="text-[var(--color-pergaminho-velho)] text-xs mb-2">
              Digita <code className="text-[var(--color-sangue)]">RESETAR</code>:
            </p>
            <input type="text" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[var(--color-carvao)] border border-[var(--color-sangue)]/50 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-sangue)]" autoFocus />
            <div className="mt-6 flex gap-3">
              <button onClick={() => { setShowResetModal(false); setResetConfirm(""); }} disabled={resetting}
                className="flex-1 px-4 py-2 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] rounded text-xs uppercase tracking-widest">Cancelar</button>
              <button onClick={resetar} disabled={resetting || resetConfirm !== "RESETAR"}
                className="flex-1 px-4 py-2 bg-[var(--color-sangue)] text-[var(--color-pergaminho)] rounded text-xs uppercase tracking-widest disabled:opacity-40">
                {resetting ? "Resetando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function LogEntry({ ev, myUserId, onReplay }: { ev: LogEvent; myUserId: string | undefined; onReplay: (text: string) => void }) {
  if (ev.actor_type === "dm") {
    const textRaw = (ev.payload.text as string) || "";
    // Remove diretivas [TAG] e [TAG: ...] da exibição (continuam sendo processadas)
    const text = stripDirectives(textRaw);
    const provider = (ev.payload.provider as string) || "";
    return (
      <div className="border-l-2 border-[var(--color-dourado)] pl-4 py-1 group">
        <div className="flex items-baseline gap-2">
          <p className="text-xs uppercase tracking-widest text-[var(--color-dourado)]">Mestre</p>
          {provider && <span className="text-[9px] text-[var(--color-pedra)] uppercase">✦ {provider}</span>}
          <button onClick={() => onReplay(text)} className="text-xs text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] opacity-0 group-hover:opacity-100 transition" title="Ouvir de novo">↻</button>
        </div>
        <p className="text-[var(--color-pergaminho)] leading-relaxed whitespace-pre-wrap">{text}</p>
      </div>
    );
  }
  if (ev.actor_type === "system") {
    const text = (ev.payload.text as string) || "";
    return <p className="text-xs italic text-[var(--color-pedra)] text-center">{text}</p>;
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
        <p className="text-[var(--color-pergaminho)] italic">&quot;{text}&quot;</p>
      </div>
    );
  }
  return null;
}

function Ficha({ char, onUsarItem, compact }: { char: Character; onUsarItem?: (item: InventoryItem) => void; compact?: boolean }) {
  const raca = RACAS.find((r) => r.key === char.race);
  const classe = CLASSES.find((c) => c.key === char.class);
  const portraitSize = compact ? "w-20 h-20" : "w-32 h-32";
  const isCaster = ["mago", "clerigo", "bardo"].includes(char.class);
  const isDying = char.hp_current === 0;
  const ds = char.death_saves || { successes: 0, failures: 0, stable: false };
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {char.portrait_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={char.portrait_url} alt={char.name} className={`${portraitSize} object-cover rounded-lg border ${isDying ? "border-[var(--color-sangue)]/70 grayscale" : "border-[var(--color-dourado)]/40"} flex-shrink-0`} />
        )}
        <div className="flex-1 min-w-0">
          <h3 className={`text-lg dourado-glow font-[family-name:var(--font-cinzel)] leading-tight ${isDying ? "text-[var(--color-sangue)]" : "text-[var(--color-dourado-claro)]"}`}>{char.name}</h3>
          <p className="text-xs text-[var(--color-pergaminho-velho)] uppercase tracking-widest mt-1">
            {raca?.nome} · {classe?.nome}
          </p>
          <p className="text-xs text-[var(--color-pergaminho-velho)]">Nível {char.level}{char.inspiration && <span className="ml-2 text-[var(--color-dourado)]">✨ Inspiração</span>}</p>
        </div>
      </div>

      {/* Condições ativas */}
      {char.conditions && char.conditions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {char.conditions.map((c, i) => (
            <span key={i} className="text-[10px] uppercase tracking-widest bg-[var(--color-vinho)]/40 border border-[var(--color-sangue)]/50 text-[var(--color-pergaminho)] px-2 py-0.5 rounded">
              {c.name}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className={`bg-[var(--color-carvao)]/60 border rounded p-2 ${isDying ? "border-[var(--color-sangue)] animate-pulse" : "border-[var(--color-pergaminho-velho)]/30"}`}>
          <div className="text-xs text-[var(--color-pergaminho-velho)] uppercase">HP</div>
          <div className="text-lg text-[var(--color-sangue)] font-[family-name:var(--font-cinzel-decorative)]">{char.hp_current}/{char.hp_max}</div>
        </div>
        <div className="bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 rounded p-2">
          <div className="text-xs text-[var(--color-pergaminho-velho)] uppercase">CA</div>
          <div className="text-lg text-[var(--color-dourado)] font-[family-name:var(--font-cinzel-decorative)]">{char.ac}</div>
        </div>
      </div>

      {/* Death saves quando HP=0 */}
      {isDying && !ds.stable && (
        <DeathSavesUI charId={char.id} ds={ds} />
      )}
      {isDying && ds.stable && (
        <div className="text-center text-xs text-[var(--color-pergaminho-velho)] italic border border-[var(--color-pergaminho-velho)]/30 rounded p-2">
          Estável. Aguardando cura.
        </div>
      )}

      {/* Spell slots se caster */}
      {!compact && isCaster && (
        <SpellSlots char={char} />
      )}

      {/* Botões de descanso (só na própria ficha, não em compact) */}
      {!compact && (
        <RestButtons char={char} />
      )}

      {/* XP + level up (só na própria ficha) */}
      {!compact && typeof char.xp === "number" && (
        <XpProgress char={char} />
      )}

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

      {!compact && char.inventory && char.inventory.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">Inventário</h4>
          <ul className="space-y-1">
            {char.inventory.map((item, i) => (
              <li key={item.id || i} className="text-xs text-[var(--color-pergaminho)] flex items-start gap-2 bg-[var(--color-carvao)]/40 rounded p-1.5">
                <div className="flex-1">
                  <div className="text-[var(--color-dourado)]">{item.nome}</div>
                  {item.desc && <div className="text-[10px] text-[var(--color-pergaminho-velho)] italic">{item.desc}</div>}
                </div>
                {item.consumivel && onUsarItem && (
                  <button onClick={() => onUsarItem(item)} className="text-[10px] uppercase tracking-widest text-[var(--color-sangue)] hover:text-[var(--color-pergaminho)] px-2 py-0.5 border border-[var(--color-sangue)]/40 rounded">
                    Usar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {char.spells && char.spells.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">Magias</h4>
          <ul className="space-y-1">
            {char.spells.map((m, i) => (
              <li key={i} className="text-xs text-[var(--color-pergaminho)]">
                <span className="text-[var(--color-dourado)]">{m.nome}</span>
                <span className="text-[var(--color-pergaminho-velho)] ml-1">(N{m.nivel})</span>
                {m.efeito && <div className="text-[10px] text-[var(--color-pergaminho-velho)] italic ml-2">{m.efeito}</div>}
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
              <li key={i} className="text-xs text-[var(--color-pergaminho)] italic">· {f}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && char.background && (
        <div>
          <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">História</h4>
          <p className="text-xs text-[var(--color-pergaminho)] italic whitespace-pre-wrap leading-relaxed">{char.background}</p>
        </div>
      )}
    </div>
  );
}

/**
 * ClocksBar — Doom clocks visíveis (Vincent Baker / John Harper).
 * Mostra 3 relógios com segmentos preenchidos. Ameaça implícita.
 */
function ClocksBar({ clocks }: { clocks: Record<string, { max: number; current: number; label?: string }> }) {
  const order = ["doom", "arco", "situacional"];
  const visible = order.filter((k) => clocks[k] && clocks[k].max > 0);
  if (visible.length === 0) return null;
  return (
    <div className="border-b border-[var(--color-pergaminho-velho)]/15 px-3 sm:px-4 py-1.5 bg-[var(--color-carvao)]/30 flex flex-wrap gap-3 sm:gap-5">
      {visible.map((k) => {
        const c = clocks[k];
        const pct = (c.current / c.max) * 100;
        const cor =
          k === "doom" ? "from-[var(--color-sangue)] to-[var(--color-vinho)]"
          : k === "arco" ? "from-[var(--color-vinho)] to-[var(--color-dourado)]/60"
          : "from-[var(--color-dourado)]/40 to-[var(--color-dourado)]";
        return (
          <div key={k} className="flex items-center gap-2 min-w-0 flex-shrink-0" title={`${c.label || k}: ${c.current}/${c.max}`}>
            <span className="text-[9px] uppercase tracking-widest text-[var(--color-pergaminho-velho)] flex-shrink-0">
              {k === "doom" ? "⚰" : k === "arco" ? "⌛" : "⚡"} {c.current}/{c.max}
            </span>
            {/* Segmentos clicáveis-style (visualmente apenas) */}
            <div className="flex gap-0.5">
              {Array.from({ length: c.max }).map((_, i) => (
                <span
                  key={i}
                  className={`block w-1.5 h-3 rounded-sm transition ${
                    i < c.current
                      ? `bg-gradient-to-b ${cor}`
                      : "bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/30"
                  }`}
                />
              ))}
            </div>
            {c.label && (
              <span className="hidden lg:inline text-[10px] text-[var(--color-pergaminho-velho)] italic truncate max-w-32">
                {c.label}
              </span>
            )}
            {pct >= 75 && (
              <span className="text-[10px] text-[var(--color-sangue)] animate-pulse">●</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * AsidePrivadoModal — info que SÓ meu personagem viu, outros não veem.
 * Hitchcock: bomba sob a mesa. Aparece com flair de segredo.
 */
function AsidePrivadoModal({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 12000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-sm px-6" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-md w-full bg-[var(--color-carvao)] border border-[var(--color-vinho)] rounded-lg p-6 shadow-2xl animate-[asideEntra_0.6s_ease-out]"
        style={{ boxShadow: "0 0 40px rgba(110, 26, 26, 0.5)" }}
      >
        <button onClick={onClose} className="absolute top-2 right-3 text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-xl leading-none">×</button>
        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--color-vinho)] mb-2 text-center">só você vê isso</p>
        <div className="w-12 h-px mx-auto bg-[var(--color-vinho)] mb-4" />
        <p className="text-[var(--color-pergaminho)] italic leading-relaxed whitespace-pre-wrap">{text}</p>
        <p className="text-[9px] text-[var(--color-pergaminho-velho)] mt-4 text-center">os outros não receberam essa visão</p>
      </div>
      <style jsx>{`
        @keyframes asideEntra {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/**
 * NpcEncontroModal — Card épico que aparece no primeiro encontro com um NPC.
 * Anima entrada, mostra retrato (se houver), bordão e aparência.
 * Auto-fecha após 8s ou click fora.
 */
function NpcEncontroModal({ npc, onClose }: { npc: NpcItem; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6 animate-[npcFadeIn_0.5s_ease-out]" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-[var(--color-carvao)] border-2 border-[var(--color-dourado)] rounded-lg p-6 max-w-sm w-full shadow-2xl animate-[npcEntrada_0.7s_ease-out]"
        style={{ boxShadow: "0 0 60px rgba(212, 175, 55, 0.4), 0 0 120px rgba(110, 26, 26, 0.3)" }}
      >
        <button onClick={onClose} className="absolute top-2 right-3 text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-2xl leading-none">×</button>
        <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] mb-1 text-center">Tu encontras…</p>
        <h2 className="text-3xl text-center text-[var(--color-dourado-claro)] dourado-glow font-[family-name:var(--font-cinzel-decorative)] mb-3">{npc.name}</h2>
        <div className="w-16 h-px mx-auto bg-gradient-to-r from-transparent via-[var(--color-dourado)] to-transparent mb-4" />
        {npc.appearance && (
          <p className="text-sm text-[var(--color-pergaminho)] italic text-center mb-3 leading-relaxed">{npc.appearance}</p>
        )}
        {npc.bordao && (
          <p className="text-base text-[var(--color-dourado)] text-center font-[family-name:var(--font-cinzel)] mb-2">&ldquo;{npc.bordao}&rdquo;</p>
        )}
        {npc.faction && (
          <p className="text-[10px] uppercase tracking-widest text-[var(--color-vinho)] text-center">{npc.faction}</p>
        )}
      </div>
      <style jsx>{`
        @keyframes npcFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes npcEntrada {
          0%   { opacity: 0; transform: scale(0.7) rotate(-3deg); }
          50%  { opacity: 1; transform: scale(1.05) rotate(0deg); }
          75%  { transform: scale(0.98) rotate(0deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * IniciativaTracker — tracker visual no topo do log durante combate.
 * Mostra avatares ordenados por iniciativa, com HP e marcador do turno atual.
 * Admin pode avançar o turno do combate.
 */
function IniciativaTracker({
  iniciativa,
  myUserId,
  isAdmin,
}: {
  iniciativa: IniciativaItem[];
  myUserId: string | undefined;
  isAdmin: boolean;
}) {
  const sorted = [...iniciativa].sort((a, b) => a.position - b.position);

  async function avancarTurnoCombate() {
    if (!isAdmin) return;
    const sb = getSupabase();
    const total = sorted.length;
    if (total === 0) return;
    const currIdx = sorted.findIndex((i) => i.is_current);
    const nextIdx = currIdx === -1 ? 0 : (currIdx + 1) % total;
    // Reseta is_current de todos e marca o próximo
    await Promise.all(sorted.map((i, idx) =>
      sb.from("combat_initiative").update({ is_current: idx === nextIdx }).eq("id", i.id)
    ));
    sfxPlay("turn");
  }

  async function fimDeCombate() {
    if (!isAdmin) return;
    const sb = getSupabase();
    if (!sorted[0]) return;
    await sb.from("sessions").update({ in_combat: false }).eq("id", sorted[0].session_id);
    await sb.from("combat_initiative").delete().eq("session_id", sorted[0].session_id);
    sfxPlay("page");
  }

  return (
    <div className="border-b border-[var(--color-sangue)]/40 bg-[var(--color-sangue)]/10 px-4 py-2">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-xs uppercase tracking-widest text-[var(--color-sangue)]">⚔ Combate — Iniciativa</p>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={avancarTurnoCombate} className="text-[10px] uppercase tracking-widest text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)]">▸ Próximo</button>
            <button onClick={fimDeCombate} className="text-[10px] uppercase tracking-widest text-[var(--color-pergaminho-velho)] hover:text-[var(--color-sangue)]">⊘ Fim</button>
          </div>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {sorted.map((i) => {
          const isMine = i.actor_type === "player" && i.actor_id === myUserId;
          return (
            <div
              key={i.id}
              className={`flex-shrink-0 px-2 py-1 rounded text-center min-w-16 transition ${
                i.is_current
                  ? "bg-[var(--color-dourado)]/40 border border-[var(--color-dourado)] text-[var(--color-pergaminho)] ring-2 ring-[var(--color-dourado)]/60"
                  : "bg-[var(--color-carvao)]/60 border border-[var(--color-pergaminho-velho)]/30 text-[var(--color-pergaminho-velho)]"
              } ${isMine ? "ring-2 ring-[var(--color-vinho)]" : ""}`}
              title={`${i.display_name} · iniciativa ${i.initiative}`}
            >
              <div className="text-[9px] text-[var(--color-dourado)]">{i.initiative}</div>
              <div className="text-xs truncate max-w-20">{i.display_name.split(" ")[0]}</div>
              {i.hp_current !== null && i.hp_max !== null && (
                <div className="text-[9px] text-[var(--color-sangue)]">{i.hp_current}/{i.hp_max}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Death Saves: 3 sucessos = estável, 3 falhas = morte.
 * 1 natural = 2 falhas, 20 natural = recupera 1 HP.
 */
function DeathSavesUI({ charId, ds }: { charId: string; ds: { successes: number; failures: number; stable: boolean } }) {
  const [rolling, setRolling] = useState(false);

  async function rolarSaveDeMorte() {
    if (rolling) return;
    setRolling(true);
    const sb = getSupabase();
    const r = 1 + Math.floor(Math.random() * 20);
    sfxPlay("dice");

    let novoSuccesses = ds.successes;
    let novoFailures = ds.failures;
    let novoStable = ds.stable;
    let curaImediata = 0;

    if (r === 20) {
      // 20 natural: recupera 1 HP
      curaImediata = 1;
      novoSuccesses = 0;
      novoFailures = 0;
      sfxPlay("heal");
    } else if (r === 1) {
      novoFailures = Math.min(3, novoFailures + 2);
      sfxPlay("fumble");
    } else if (r >= 10) {
      novoSuccesses = Math.min(3, novoSuccesses + 1);
      if (novoSuccesses >= 3) novoStable = true;
    } else {
      novoFailures = Math.min(3, novoFailures + 1);
    }

    const update: Record<string, unknown> = {
      death_saves: { successes: novoSuccesses, failures: novoFailures, stable: novoStable },
    };
    if (curaImediata > 0) {
      update.hp_current = curaImediata;
      update.death_saves = { successes: 0, failures: 0, stable: false };
    } else if (novoFailures >= 3) {
      sfxPlay("death");
    }

    await sb.from("characters").update(update).eq("id", charId);
    setRolling(false);
  }

  return (
    <div className="border border-[var(--color-sangue)]/50 rounded p-3 bg-[var(--color-sangue)]/10">
      <p className="text-xs uppercase tracking-widest text-[var(--color-sangue)] mb-2 text-center">⚰ Save de morte</p>
      <div className="grid grid-cols-2 gap-2 mb-2 text-center text-xs">
        <div>
          <span className="text-[var(--color-pergaminho-velho)] block">Sucessos</span>
          <span className="text-emerald-400 text-lg">{"●".repeat(ds.successes)}{"○".repeat(3 - ds.successes)}</span>
        </div>
        <div>
          <span className="text-[var(--color-pergaminho-velho)] block">Falhas</span>
          <span className="text-[var(--color-sangue)] text-lg">{"●".repeat(ds.failures)}{"○".repeat(3 - ds.failures)}</span>
        </div>
      </div>
      {ds.failures < 3 ? (
        <button
          onClick={rolarSaveDeMorte}
          disabled={rolling}
          className="w-full px-3 py-2 rounded bg-[var(--color-sangue)] text-[var(--color-pergaminho)] text-xs uppercase tracking-widest hover:bg-[var(--color-sangue)]/80 disabled:opacity-50"
        >
          {rolling ? "Rolando…" : "Rolar 1d20 (≥10 = sucesso)"}
        </button>
      ) : (
        <p className="text-center text-[var(--color-sangue)] uppercase tracking-widest text-xs">Morto. Que descanse em paz.</p>
      )}
    </div>
  );
}

/**
 * RestButtons — Long e Short Rest.
 * Long rest: HP cheio, slots resetam, exhaustion -1.
 * Short rest: gasta 1 hit die pra recuperar 1d8+CON.
 */
function RestButtons({ char }: { char: Character }) {
  async function shortRest() {
    if (char.hp_current <= 0) return;
    const sb = getSupabase();
    const hd = char.hit_dice_current ?? char.level;
    if (hd <= 0) return;
    const conMod = Math.floor((char.con_attr - 10) / 2);
    const cura = Math.max(1, 1 + Math.floor(Math.random() * 8) + conMod);
    const novoHp = Math.min(char.hp_max, char.hp_current + cura);
    await sb.from("characters").update({
      hp_current: novoHp,
      hit_dice_current: hd - 1,
    }).eq("id", char.id);
    sfxPlay("heal");
  }

  async function longRest() {
    const sb = getSupabase();
    // Reset spell slots: zera "used"
    const slots = char.spell_slots || {};
    const slotsResetados: Record<string, { max: number; used: number }> = {};
    for (const [k, v] of Object.entries(slots)) {
      slotsResetados[k] = { max: v.max, used: 0 };
    }
    // Hit dice: recupera metade do nível (mínimo 1)
    const hdRec = Math.max(1, Math.floor(char.level / 2));
    const novoHd = Math.min(char.level, (char.hit_dice_current ?? char.level) + hdRec);

    await sb.from("characters").update({
      hp_current: char.hp_max,
      spell_slots: slotsResetados,
      hit_dice_current: novoHd,
      death_saves: { successes: 0, failures: 0, stable: false },
    }).eq("id", char.id);
    sfxPlay("level");
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        onClick={shortRest}
        disabled={char.hp_current <= 0 || (char.hit_dice_current ?? char.level) <= 0}
        className="px-3 py-2 rounded border border-[var(--color-pergaminho-velho)]/40 text-xs uppercase tracking-widest text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)] disabled:opacity-40"
        title="Descanso curto: gasta 1 hit die, recupera 1d8+CON HP"
      >
        ☾ Curto
      </button>
      <button
        onClick={longRest}
        className="px-3 py-2 rounded border border-[var(--color-dourado)]/60 text-xs uppercase tracking-widest text-[var(--color-dourado)] hover:bg-[var(--color-dourado)]/20"
        title="Descanso longo: HP cheio, slots resetam, recupera 1/2 nível em hit dice"
      >
        ☽ Longo
      </button>
    </div>
  );
}

/**
 * XpProgress — barra de XP com botão de level up quando atinge threshold.
 * D&D 5e: 0, 300, 900, 2700, 6500, 14000, ...
 */
const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000];
function nivelDoXp(xp: number): number {
  for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= XP_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function XpProgress({ char }: { char: Character }) {
  const xp = char.xp ?? 0;
  const niv = char.level;
  const nextNiv = niv + 1;
  const xpAtual = XP_THRESHOLDS[niv - 1] ?? 0;
  const xpProx = XP_THRESHOLDS[nextNiv - 1];
  const podeSubir = xpProx !== undefined && xp >= xpProx;
  const pct = xpProx ? Math.min(100, ((xp - xpAtual) / (xpProx - xpAtual)) * 100) : 100;

  async function subirNivel() {
    if (!podeSubir) return;
    const sb = getSupabase();
    const classe = CLASSES.find((c) => c.key === char.class);
    const conMod = Math.floor((char.con_attr - 10) / 2);
    // HP novo: rolagem do hit die + CON mod (mínimo 1)
    const hpDie = classe?.hpDado ?? 8;
    const ganhoHp = Math.max(1, 1 + Math.floor(Math.random() * hpDie) + conMod);
    const novoHpMax = char.hp_max + ganhoHp;
    // Atualiza slots
    const novosSlots = defaultSpellSlots(char.class, nextNiv);
    await sb.from("characters").update({
      level: nextNiv,
      hp_max: novoHpMax,
      hp_current: novoHpMax,
      hit_dice_current: nextNiv,
      spell_slots: novosSlots,
    }).eq("id", char.id);
    sfxPlay("level");
  }

  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1">
        <span>XP nível {niv}</span>
        <span>{xp} / {xpProx ?? "max"}</span>
      </div>
      <div className="h-2 bg-[var(--color-carvao)] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--color-dourado)]/60 to-[var(--color-dourado)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {podeSubir && (
        <button
          onClick={subirNivel}
          className="mt-2 w-full px-3 py-2 rounded bg-gradient-to-r from-[var(--color-vinho)] via-[var(--color-dourado)]/40 to-[var(--color-vinho)] border border-[var(--color-dourado)] text-[var(--color-pergaminho)] text-xs uppercase tracking-widest hover:from-[var(--color-vinho)] hover:to-[var(--color-vinho)] animate-pulse"
        >
          ⚜ Subir pro nível {nextNiv}
        </button>
      )}
    </div>
  );
}

/**
 * Spell Slots tracker — mago/clérigo/bardo.
 * Defaults por nível baseados em D&D 5e.
 */
function SpellSlots({ char }: { char: Character }) {
  const slots = char.spell_slots || defaultSpellSlots(char.class, char.level);

  async function toggleSlot(level: string, idx: number) {
    const sb = getSupabase();
    const cur = slots[level] || { max: 0, used: 0 };
    const novoUsed = idx < cur.used ? cur.used - 1 : cur.used + 1;
    const updated = { ...slots, [level]: { ...cur, used: Math.min(cur.max, Math.max(0, novoUsed)) } };
    sfxPlay("magic");
    await sb.from("characters").update({ spell_slots: updated }).eq("id", char.id);
  }

  const niveis = Object.keys(slots).filter((l) => slots[l]?.max > 0).sort();
  if (niveis.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-2">Slots de magia</h4>
      <div className="space-y-1.5">
        {niveis.map((l) => {
          const s = slots[l];
          return (
            <div key={l} className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-[var(--color-pergaminho-velho)] w-6 flex-shrink-0">N{l}</span>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: s.max }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => toggleSlot(l, i)}
                    className={`w-4 h-4 rounded-full border transition ${
                      i < s.used
                        ? "bg-[var(--color-pergaminho-velho)]/30 border-[var(--color-pergaminho-velho)]/60"
                        : "bg-[var(--color-dourado)]/40 border-[var(--color-dourado)]"
                    }`}
                    title={i < s.used ? "Slot gasto" : "Slot disponível"}
                  />
                ))}
              </div>
              <span className="text-[10px] text-[var(--color-pergaminho-velho)] ml-auto">{s.max - s.used}/{s.max}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Slots padrão por classe e nível (D&D 5e simplified). */
function defaultSpellSlots(classe: string, level: number): Record<string, { max: number; used: number }> {
  const isCaster = ["mago", "clerigo", "bardo"].includes(classe);
  if (!isCaster) return {};
  // Tabela simplificada — full caster
  const tbl: number[][] = [
    /* lvl 1  */ [2],
    /* lvl 2  */ [3],
    /* lvl 3  */ [4, 2],
    /* lvl 4  */ [4, 3],
    /* lvl 5  */ [4, 3, 2],
  ];
  const row = tbl[Math.min(level, tbl.length) - 1] || [2];
  const out: Record<string, { max: number; used: number }> = {};
  row.forEach((max, idx) => {
    out[String(idx + 1)] = { max, used: 0 };
  });
  return out;
}

/**
 * Pergaminhos: aba unificada com Notas, Missões e NPCs conhecidos.
 * Notas têm 3 escopos: pessoal (só eu), party (todos), DM (admin).
 */
function Pergaminhos({
  campaignId,
  userId,
  isAdmin,
  notas,
  quests,
  npcs,
  onClose,
}: {
  campaignId: string;
  userId: string;
  isAdmin: boolean;
  notas: NotaItem[];
  quests: QuestItem[];
  npcs: NpcItem[];
  onClose: () => void;
}) {
  const [aba, setAba] = useState<"notas" | "quests" | "npcs">("quests");
  const [novaNota, setNovaNota] = useState("");
  const [novoEscopo, setNovoEscopo] = useState<"self" | "party" | "dm">("self");
  const [novaQuest, setNovaQuest] = useState("");

  async function adicionarNota() {
    if (!novaNota.trim()) return;
    const sb = getSupabase();
    await sb.from("notes").insert({
      campaign_id: campaignId,
      user_id: userId,
      scope: novoEscopo,
      body: novaNota.trim().slice(0, 5000),
    });
    setNovaNota("");
  }

  async function deletarNota(id: string) {
    const sb = getSupabase();
    await sb.from("notes").delete().eq("id", id);
  }

  async function pinNota(id: string, atual: boolean) {
    const sb = getSupabase();
    await sb.from("notes").update({ pinned: !atual, updated_at: new Date().toISOString() }).eq("id", id);
  }

  async function adicionarQuest() {
    if (!isAdmin || !novaQuest.trim()) return;
    const sb = getSupabase();
    await sb.from("quests").insert({
      campaign_id: campaignId,
      title: novaQuest.trim().slice(0, 200),
      status: "active",
    });
    setNovaQuest("");
  }

  async function toggleQuest(q: QuestItem) {
    if (!isAdmin) return;
    const sb = getSupabase();
    await sb.from("quests").update({
      status: q.status === "active" ? "completed" : "active",
      completed_at: q.status === "active" ? new Date().toISOString() : null,
    }).eq("id", q.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[var(--color-carvao)] border border-[var(--color-dourado)] rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-baseline justify-between p-5 border-b border-[var(--color-pergaminho-velho)]/20">
          <h2 className="text-xl text-[var(--color-dourado)] font-[family-name:var(--font-cinzel)]">📜 Pergaminhos</h2>
          <button onClick={onClose} className="text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)] text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-pergaminho-velho)]/20">
          {([
            { k: "quests", label: `Missões (${quests.filter((q) => q.status === "active").length})` },
            { k: "notas",  label: `Notas (${notas.length})` },
            { k: "npcs",   label: `NPCs (${npcs.length})` },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setAba(t.k)}
              className={`flex-1 px-4 py-3 text-xs uppercase tracking-widest transition ${
                aba === t.k
                  ? "text-[var(--color-dourado)] border-b-2 border-[var(--color-dourado)]"
                  : "text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {aba === "quests" && (
            <>
              {quests.length === 0 && <p className="text-[var(--color-pergaminho-velho)] italic text-sm text-center py-6">Nenhum pergaminho ainda. O Mestre dirá qual é o próximo passo.</p>}
              {quests.map((q) => (
                <div key={q.id} className={`p-3 rounded border ${q.status === "completed" ? "border-[var(--color-pergaminho-velho)]/20 opacity-60" : "border-[var(--color-dourado)]/40 bg-[var(--color-vinho)]/10"}`}>
                  <div className="flex items-start gap-3">
                    {isAdmin ? (
                      <button onClick={() => toggleQuest(q)} className="mt-1 text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)]">
                        {q.status === "completed" ? "✓" : "○"}
                      </button>
                    ) : (
                      <span className="mt-1 text-[var(--color-dourado)]">{q.status === "completed" ? "✓" : "○"}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${q.status === "completed" ? "line-through text-[var(--color-pergaminho-velho)]" : "text-[var(--color-pergaminho)]"}`}>
                        {q.title}
                      </p>
                      {q.description && <p className="text-xs text-[var(--color-pergaminho-velho)] italic mt-1">{q.description}</p>}
                    </div>
                  </div>
                </div>
              ))}
              {isAdmin && (
                <div className="flex gap-2 pt-2">
                  <input
                    type="text"
                    value={novaQuest}
                    onChange={(e) => setNovaQuest(e.target.value)}
                    placeholder="Nova missão (admin)…"
                    maxLength={200}
                    className="flex-1 px-3 py-2 rounded bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/40 text-sm text-[var(--color-pergaminho)]"
                  />
                  <button onClick={adicionarQuest} className="px-3 py-2 rounded bg-[var(--color-vinho)] border border-[var(--color-dourado)] text-[var(--color-pergaminho)] text-xs uppercase">Add</button>
                </div>
              )}
            </>
          )}

          {aba === "notas" && (
            <>
              {notas.length === 0 && <p className="text-[var(--color-pergaminho-velho)] italic text-sm text-center py-6">Nenhuma nota. Anota o que vai esquecendo.</p>}
              {notas.filter((n) => n.scope !== "dm" || isAdmin).map((n) => (
                <div key={n.id} className={`p-3 rounded border ${n.pinned ? "border-[var(--color-dourado)]/60 bg-[var(--color-vinho)]/10" : "border-[var(--color-pergaminho-velho)]/20"}`}>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className={`text-[10px] uppercase tracking-widest ${
                      n.scope === "party" ? "text-emerald-400" : n.scope === "dm" ? "text-[var(--color-sangue)]" : "text-[var(--color-pergaminho-velho)]"
                    }`}>
                      {n.scope === "party" ? "Party" : n.scope === "dm" ? "Mestre" : "Pessoal"}
                    </span>
                    <div className="flex gap-1">
                      {n.user_id === userId && (
                        <>
                          <button onClick={() => pinNota(n.id, n.pinned)} className="text-xs text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]" title={n.pinned ? "Desfixar" : "Fixar"}>
                            {n.pinned ? "📌" : "📍"}
                          </button>
                          <button onClick={() => deletarNota(n.id)} className="text-xs text-[var(--color-pergaminho-velho)] hover:text-[var(--color-sangue)]" title="Deletar">×</button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--color-pergaminho)] whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
              <div className="space-y-2 pt-3 border-t border-[var(--color-pergaminho-velho)]/20">
                <div className="flex gap-1">
                  {(["self", "party", ...(isAdmin ? ["dm"] : [])] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setNovoEscopo(s as "self" | "party" | "dm")}
                      className={`px-2 py-1 rounded text-[10px] uppercase border ${
                        novoEscopo === s ? "border-[var(--color-dourado)] text-[var(--color-dourado)]" : "border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho-velho)]"
                      }`}
                    >
                      {s === "self" ? "Pessoal" : s === "party" ? "Party" : "Mestre"}
                    </button>
                  ))}
                </div>
                <textarea
                  value={novaNota}
                  onChange={(e) => setNovaNota(e.target.value.slice(0, 5000))}
                  placeholder="Escreva uma nota…"
                  rows={3}
                  maxLength={5000}
                  className="w-full px-3 py-2 rounded bg-[var(--color-carvao)] border border-[var(--color-pergaminho-velho)]/40 text-sm text-[var(--color-pergaminho)] resize-none"
                />
                <button onClick={adicionarNota} disabled={!novaNota.trim()} className="w-full px-3 py-2 rounded bg-[var(--color-vinho)] border border-[var(--color-dourado)] text-[var(--color-pergaminho)] text-xs uppercase tracking-widest disabled:opacity-40">
                  Salvar nota
                </button>
              </div>
            </>
          )}

          {aba === "npcs" && (
            <>
              {npcs.length === 0 && <p className="text-[var(--color-pergaminho-velho)] italic text-sm text-center py-6">Nenhum NPC conhecido ainda. Quando o Mestre apresentar alguém, aparece aqui.</p>}
              {npcs.map((npc) => (
                <div key={npc.id} className="p-3 rounded border border-[var(--color-pergaminho-velho)]/20 hover:border-[var(--color-dourado)]/40 transition">
                  <div className="flex items-baseline justify-between mb-1">
                    <h4 className="text-sm text-[var(--color-dourado)] font-[family-name:var(--font-cinzel)]">{npc.name}</h4>
                    {npc.faction && <span className="text-[10px] uppercase tracking-widest text-[var(--color-pergaminho-velho)]">{npc.faction}</span>}
                  </div>
                  {npc.appearance && <p className="text-xs text-[var(--color-pergaminho)] italic mb-1">{npc.appearance}</p>}
                  {npc.bordao && <p className="text-xs text-[var(--color-pergaminho-velho)]">&ldquo;{npc.bordao}&rdquo;</p>}
                  {npc.relation !== 0 && (
                    <div className="mt-2 h-1 bg-[var(--color-carvao)] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${npc.relation > 0 ? "bg-emerald-500" : "bg-[var(--color-sangue)]"}`}
                        style={{ width: `${Math.min(100, Math.abs(npc.relation))}%`, marginLeft: npc.relation < 0 ? `${100 - Math.min(100, Math.abs(npc.relation))}%` : "0" }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loader místico: roda enquanto o Mestre prepara a próxima cena.
 * Duas fases:
 *  - "tecendo": IA processando (quem mandou ação ainda aguardando resposta do server)
 *  - "narrando": resposta chegou, esperando o áudio começar (sincroniza voz e texto)
 * Frases alternam a cada ~2s. Anel girando + brasa pulsando + tinta correndo.
 */
function MestreInvocando({ estagio }: { estagio: "tecendo" | "narrando" }) {
  const FRASES_TECENDO = [
    "O Mestre desenrola o pergaminho…",
    "Velas tremulam com a próxima cena…",
    "Os dados sussurram no éter…",
    "Sombras se reorganizam à mesa…",
    "O grimório vira a página…",
    "Tinta de carvão desce no papel…",
    "A taverna escuta…",
    "Cordas do destino se cruzam…",
    "Ecos antigos se aproximam…",
    "O Mestre consulta o silêncio…",
    "Runas se alinham…",
    "A Pandórica ri ao longe…",
  ];
  const FRASES_NARRANDO = [
    "A voz do Mestre se prepara…",
    "O ar fica denso antes da fala…",
    "Pergaminho se inclina pra ti…",
  ];
  const frases = estagio === "narrando" ? FRASES_NARRANDO : FRASES_TECENDO;
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * frases.length));

  useEffect(() => {
    const i = setInterval(() => setIdx((x) => (x + 1) % frases.length), 1900);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estagio]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded border border-[var(--color-dourado)]/30 bg-gradient-to-r from-[var(--color-carvao)]/60 via-[var(--color-vinho)]/10 to-[var(--color-carvao)]/60 shadow-inner">
      {/* Selo místico animado: anel girando + brasa pulsando dentro */}
      <div className="relative w-7 h-7 flex-shrink-0">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--color-dourado)]/20 border-t-[var(--color-dourado)] border-r-[var(--color-dourado)]/70 animate-spin" style={{ animationDuration: "2.4s" }} />
        <div className="absolute inset-1.5 rounded-full bg-[var(--color-dourado)]/30 animate-pulse" />
        <div className="absolute inset-2.5 rounded-full bg-[var(--color-vinho)]/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          key={idx}
          className="text-[var(--color-dourado)] italic text-sm font-[family-name:var(--font-cinzel)] tracking-wide animate-[fadeIn_0.8s_ease-out]"
        >
          {frases[idx]}
        </p>
        {/* Linha de tinta correndo */}
        <div className="mt-1.5 h-px w-full bg-gradient-to-r from-transparent via-[var(--color-dourado)]/50 to-transparent animate-[inkRun_2.4s_ease-in-out_infinite]" />
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes inkRun {
          0% { transform: scaleX(0.2); transform-origin: left; opacity: 0.2; }
          50% { transform: scaleX(1); transform-origin: left; opacity: 0.7; }
          100% { transform: scaleX(0.2); transform-origin: right; opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
