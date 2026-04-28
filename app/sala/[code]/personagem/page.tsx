"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase/client";
import {
  ATRIBUTOS,
  ATRIBUTOS_DEFAULT,
  AtributoKey,
  CLASSES,
  ClasseKey,
  RACAS,
  RacaKey,
  POINT_BUY_BUDGET,
  totalPointBuy,
  custoPointBuy,
  aplicarBonusRacial,
  modAtributo,
  hpMaximoNivel1,
  caBase,
  buildPollinationsUrl,
  promptRetrato,
  CANTRIPS_POR_CLASSE,
  MAGIAS_N1_POR_CLASSE,
} from "@/lib/lvs";

type Step = "raca" | "classe" | "atributos" | "background" | "retrato" | "salvando";

export default function CriacaoPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const router = useRouter();

  const [step, setStep] = useState<Step>("raca");
  const [me, setMe] = useState<{ id: string; nick: string | null } | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);

  const [raca, setRaca] = useState<RacaKey | null>(null);
  const [classe, setClasse] = useState<ClasseKey | null>(null);
  const [atributos, setAtributos] = useState<Record<AtributoKey, number>>(ATRIBUTOS_DEFAULT);
  const [genero, setGenero] = useState("");
  const [nome, setNome] = useState("");
  const [background, setBackground] = useState("");
  const [retratoEscolhido, setRetratoEscolhido] = useState<string | null>(null);
  const [retratoSeeds, setRetratoSeeds] = useState<number[]>([1, 2, 3, 4]);

  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = getSupabase();
    (async () => {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(`/sala/${code}/personagem`)}`);
        return;
      }
      const { data: profile } = await sb
        .from("profiles")
        .select("id, nick")
        .eq("id", user.id)
        .maybeSingle();
      if (profile) {
        setMe(profile);
        if (!nome && profile.nick) setNome(profile.nick);
      }
      const { data: camp } = await sb
        .from("campaigns")
        .select("id")
        .eq("code", code)
        .maybeSingle();
      if (camp) {
        setCampaignId(camp.id);
        // Já tem personagem? Redireciona
        const { data: existing } = await sb
          .from("characters")
          .select("id")
          .eq("campaign_id", camp.id)
          .eq("user_id", user.id)
          .maybeSingle();
        if (existing) {
          router.replace(`/sala/${code}`);
          return;
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Atributos com bônus racial aplicado (preview)
  const atributosFinais = raca ? aplicarBonusRacial(atributos, raca) : atributos;
  const pontosUsados = totalPointBuy(atributos);
  const pontosRestantes = POINT_BUY_BUDGET - pontosUsados;

  function ajustarAtributo(key: AtributoKey, delta: number) {
    setAtributos((prev) => {
      const novo = Math.max(8, Math.min(15, prev[key] + delta));
      const teste = { ...prev, [key]: novo };
      if (totalPointBuy(teste) > POINT_BUY_BUDGET) return prev;
      return teste;
    });
  }

  function regerarRetratos() {
    setRetratoSeeds([
      Math.floor(Math.random() * 100000),
      Math.floor(Math.random() * 100000),
      Math.floor(Math.random() * 100000),
      Math.floor(Math.random() * 100000),
    ]);
    setRetratoEscolhido(null);
  }

  async function salvar() {
    if (!campaignId || !me || !raca || !classe || !nome.trim()) return;
    setStep("salvando");
    setErro(null);
    try {
      const sb = getSupabase();
      const cantrips = CANTRIPS_POR_CLASSE[classe] || [];
      const magiasN1 = MAGIAS_N1_POR_CLASSE[classe] || [];
      const classeInfo = CLASSES.find((c) => c.key === classe)!;

      const ficha = {
        campaign_id: campaignId,
        user_id: me.id,
        name: nome.trim(),
        race: raca,
        class: classe,
        level: 1,
        for_attr: atributosFinais.for,
        des_attr: atributosFinais.des,
        con_attr: atributosFinais.con,
        int_attr: atributosFinais.int,
        sab_attr: atributosFinais.sab,
        car_attr: atributosFinais.car,
        hp_max: hpMaximoNivel1(classe, atributosFinais.con),
        hp_current: hpMaximoNivel1(classe, atributosFinais.con),
        ac: caBase(atributosFinais.des),
        background: genero
          ? `${genero}\n\n${background.trim()}`.trim()
          : background.trim() || null,
        portrait_url: retratoEscolhido,
        spells: [...cantrips, ...magiasN1.slice(0, 2)],
        features: classeInfo.features,
        inventory: [],
      };

      const { error } = await sb.from("characters").insert(ficha);
      if (error) throw error;
      router.push(`/sala/${code}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      setErro(msg);
      setStep("retrato");
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center pergaminho-texture">
        <p className="text-[var(--color-pergaminho-velho)] italic">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen px-6 py-8 pergaminho-texture">
      <div className="max-w-3xl mx-auto epico-entrada">
        {/* Header com progresso */}
        <div className="flex items-center justify-between mb-8">
          <Link href={`/sala/${code}`} className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">
            ← Sala
          </Link>
          <span className="text-xs text-[var(--color-pedra)] tracking-widest">
            Forjar viajante
          </span>
        </div>

        {/* Stepper */}
        <ol className="flex items-center justify-center gap-2 mb-12 text-xs uppercase tracking-widest">
          {[
            { k: "raca", label: "Raça" },
            { k: "classe", label: "Classe" },
            { k: "atributos", label: "Atributos" },
            { k: "background", label: "História" },
            { k: "retrato", label: "Retrato" },
          ].map((s, i) => (
            <li key={s.k} className="flex items-center gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                  step === s.k
                    ? "border-[var(--color-dourado)] text-[var(--color-dourado)] bg-[var(--color-vinho)]/30"
                    : "border-[var(--color-pergaminho-velho)]/30 text-[var(--color-pedra)]"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === s.k ? "text-[var(--color-pergaminho)]" : "text-[var(--color-pedra)]"}>
                {s.label}
              </span>
              {i < 4 && <span className="text-[var(--color-pedra)] mx-1">·</span>}
            </li>
          ))}
        </ol>

        {/* STEP RAÇA */}
        {step === "raca" && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tua linhagem
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              Escolhe de onde teu sangue vem.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {RACAS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => {
                    setRaca(r.key);
                    setStep("classe");
                  }}
                  className={`text-left p-5 rounded-lg border transition ${
                    raca === r.key
                      ? "border-[var(--color-dourado)] bg-[var(--color-vinho)]/20"
                      : "border-[var(--color-pergaminho-velho)]/30 bg-[var(--color-carvao)]/40 hover:border-[var(--color-dourado)]/60"
                  }`}
                >
                  <h3 className="text-lg text-[var(--color-dourado)] font-[family-name:var(--font-cinzel)]">{r.nome}</h3>
                  <p className="text-xs text-[var(--color-pergaminho)] mt-1">{r.desc}</p>
                  <p className="text-xs text-[var(--color-pergaminho-velho)] mt-3 italic">{r.trait}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* STEP CLASSE */}
        {step === "classe" && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tua arte
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              Como serás conhecido em batalha.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              {CLASSES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => {
                    setClasse(c.key);
                    setStep("atributos");
                  }}
                  className={`text-left p-5 rounded-lg border transition ${
                    classe === c.key
                      ? "border-[var(--color-dourado)] bg-[var(--color-vinho)]/20"
                      : "border-[var(--color-pergaminho-velho)]/30 bg-[var(--color-carvao)]/40 hover:border-[var(--color-dourado)]/60"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg text-[var(--color-dourado)] font-[family-name:var(--font-cinzel)]">{c.nome}</h3>
                    <span className="text-xs text-[var(--color-pergaminho-velho)]">d{c.hpDado} HP</span>
                  </div>
                  <p className="text-xs text-[var(--color-pergaminho)] mt-1">{c.desc}</p>
                  <ul className="text-xs text-[var(--color-pergaminho-velho)] mt-3 italic space-y-1">
                    {c.features.map((f, i) => (
                      <li key={i}>• {f}</li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
            <div className="mt-8">
              <button onClick={() => setStep("raca")} className="btn-selo-secundario text-xs">
                Voltar
              </button>
            </div>
          </section>
        )}

        {/* STEP ATRIBUTOS */}
        {step === "atributos" && raca && classe && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tuas forças
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-2">
              Point-buy: {pontosUsados}/{POINT_BUY_BUDGET} pontos usados.
            </p>
            <p className="text-xs text-[var(--color-pedra)] mb-6">
              Cada atributo de 8-15. Bônus racial é aplicado depois (preview ao lado).
            </p>

            <div className="space-y-3 mb-8">
              {ATRIBUTOS.map((a) => {
                const valor = atributos[a.key];
                const final = atributosFinais[a.key];
                const mod = modAtributo(final);
                return (
                  <div
                    key={a.key}
                    className="flex items-center gap-3 bg-[var(--color-carvao)]/40 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[var(--color-dourado)] font-[family-name:var(--font-cinzel)]">{a.nome}</span>
                        <span className="text-xs text-[var(--color-pedra)] truncate">{a.desc}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => ajustarAtributo(a.key, -1)}
                      disabled={valor <= 8}
                      className="w-8 h-8 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] disabled:opacity-30"
                    >
                      −
                    </button>
                    <div className="text-center w-24">
                      <div className="text-xl text-[var(--color-pergaminho)] font-[family-name:var(--font-cinzel-decorative)]">
                        {valor}
                        {final !== valor && (
                          <span className="text-sm text-[var(--color-dourado)] ml-1">→ {final}</span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--color-pergaminho-velho)]">
                        mod {mod >= 0 ? `+${mod}` : mod}
                      </div>
                    </div>
                    <button
                      onClick={() => ajustarAtributo(a.key, +1)}
                      disabled={valor >= 15 || custoPointBuy(valor + 1) - custoPointBuy(valor) > pontosRestantes}
                      className="w-8 h-8 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-between">
              <button onClick={() => setStep("classe")} className="btn-selo-secundario text-xs">
                Voltar
              </button>
              <button
                onClick={() => setStep("background")}
                disabled={pontosUsados !== POINT_BUY_BUDGET}
                className="btn-selo disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pontosUsados < POINT_BUY_BUDGET
                  ? `Faltam ${POINT_BUY_BUDGET - pontosUsados} pts`
                  : "Continuar"}
              </button>
            </div>
          </section>
        )}

        {/* STEP BACKGROUND */}
        {step === "background" && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tua história
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              Quem é teu personagem antes da aventura começar?
            </p>

            <div className="space-y-5">
              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
                  Nome do personagem
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)]"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
                  Aparência (opcional)
                </label>
                <input
                  type="text"
                  maxLength={60}
                  placeholder="ex: mulher de cabelo prateado, homem de barba ruiva"
                  value={genero}
                  onChange={(e) => setGenero(e.target.value)}
                  className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)]"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
                  Background (opcional)
                </label>
                <textarea
                  rows={4}
                  maxLength={500}
                  placeholder="De onde veio? Quais cicatrizes carrega? O que busca em Vélreth?"
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)] resize-none"
                />
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-between">
              <button onClick={() => setStep("atributos")} className="btn-selo-secundario text-xs">
                Voltar
              </button>
              <button
                onClick={() => {
                  regerarRetratos();
                  setStep("retrato");
                }}
                disabled={!nome.trim()}
                className="btn-selo disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Gerar retrato
              </button>
            </div>
          </section>
        )}

        {/* STEP RETRATO */}
        {(step === "retrato" || step === "salvando") && raca && classe && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Teu rosto
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              A IA forjou 4 retratos. Escolhe um — ou re-roll.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {retratoSeeds.map((seed) => {
                const url = buildPollinationsUrl(promptRetrato({ raca, classe, genero }), seed);
                const escolhido = retratoEscolhido === url;
                return (
                  <button
                    key={seed}
                    onClick={() => setRetratoEscolhido(url)}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                      escolhido ? "border-[var(--color-dourado)] ring-2 ring-[var(--color-dourado)]/40" : "border-[var(--color-pergaminho-velho)]/30 hover:border-[var(--color-dourado)]/60"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Retrato"
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {escolhido && (
                      <div className="absolute inset-0 bg-[var(--color-dourado)]/10 flex items-center justify-center">
                        <span className="text-[var(--color-dourado-claro)] text-3xl dourado-glow">✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 mb-8">
              <button onClick={regerarRetratos} className="btn-selo-secundario text-xs" disabled={step === "salvando"}>
                ↻ Re-rolar retratos
              </button>
              <p className="text-xs text-[var(--color-pedra)] flex-1 self-center">
                Geração via Pollinations.ai · gratuito · pode demorar 5-15s.
              </p>
            </div>

            {erro && (
              <p className="text-[var(--color-sangue)] text-sm mb-4">{erro}</p>
            )}

            <div className="flex gap-3 justify-between">
              <button onClick={() => setStep("background")} className="btn-selo-secundario text-xs" disabled={step === "salvando"}>
                Voltar
              </button>
              <button
                onClick={salvar}
                disabled={!retratoEscolhido || step === "salvando"}
                className="btn-selo disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {step === "salvando" ? "Selando o pergaminho…" : "Confirmar e entrar na sala"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
