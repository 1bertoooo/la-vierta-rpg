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
  SEXOS,
  SexoKey,
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
  PERGUNTAS_HISTORICO,
} from "@/lib/lvs";

type Step =
  | "raca"
  | "classe"
  | "atributos"
  | "sexo"
  | "historia"
  | "retrato"
  | "salvando";

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
  const [sexo, setSexo] = useState<SexoKey | null>(null);
  const [aparencia, setAparencia] = useState("");
  const [nome, setNome] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [background, setBackground] = useState("");
  const [gerandoHistoria, setGerandoHistoria] = useState(false);

  const [retratoEscolhido, setRetratoEscolhido] = useState<string | null>(null);
  // 4 seeds aleatórias pra variar prompts. Cada seed → URL Pollinations diferente.
  const [retratoSeeds, setRetratoSeeds] = useState<number[]>([1, 2, 3, 4]);
  const [retratoEstados, setRetratoEstados] = useState<("pendente" | "carregando" | "ok" | "erro")[]>(["pendente", "pendente", "pendente", "pendente"]);
  // Counter incrementa em cada re-roll pra forçar React refazer img
  const [retratoVersion, setRetratoVersion] = useState(0);

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

  // Quando img carrega/falha, libera o próximo slot pendente
  function onSlotConcluido(idx: number, status: "ok" | "erro") {
    setRetratoEstados((prev) => {
      const c = [...prev];
      c[idx] = status;
      // Acha o próximo pendente e marca como carregando
      const proxIdx = c.findIndex((s) => s === "pendente");
      if (proxIdx >= 0) c[proxIdx] = "carregando";
      return c;
    });
  }

  function regerarRetratos() {
    setRetratoEscolhido(null);
    setRetratoSeeds([
      Math.floor(Math.random() * 1_000_000),
      Math.floor(Math.random() * 1_000_000),
      Math.floor(Math.random() * 1_000_000),
      Math.floor(Math.random() * 1_000_000),
    ]);
    // Primeiro slot começa carregando, resto pendente
    setRetratoEstados(["carregando", "pendente", "pendente", "pendente"]);
    setRetratoVersion((v) => v + 1);
  }

  function regerarSlot(idx: number) {
    setRetratoSeeds((prev) => {
      const c = [...prev];
      c[idx] = Math.floor(Math.random() * 1_000_000);
      return c;
    });
    setRetratoEstados((prev) => {
      const c = [...prev];
      c[idx] = "carregando";
      return c;
    });
    setRetratoVersion((v) => v + 1);
  }

  async function gerarHistoriaIA() {
    if (!raca || !classe || !sexo || !nome.trim()) return;
    setGerandoHistoria(true);
    setErro(null);
    try {
      const r = await fetch("/api/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raca: RACAS.find((x) => x.key === raca)?.nome || raca,
          classe: CLASSES.find((x) => x.key === classe)?.nome || classe,
          nome,
          sexo: SEXOS.find((x) => x.key === sexo)?.nome || sexo,
          respostas,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro");
      setBackground(data.text || "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar história");
    } finally {
      setGerandoHistoria(false);
    }
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
        // Background fica APENAS com a história — aparência é privada (só usada no prompt do retrato)
        background: background.trim() || null,
        portrait_url: retratoEscolhido,
        spells: [...cantrips, ...magiasN1.slice(0, 2)],
        features: classeInfo.features,
        inventory: [
          { id: "moeda", nome: "10 Lacrimas de Bruna", tipo: "moeda", desc: "Moeda do reino" },
          ...(classe === "guerreiro" ? [{ id: "espada", nome: "Espada longa", tipo: "arma", desc: "1d8 dano cortante" }] : []),
          ...(classe === "mago" ? [{ id: "tomo", nome: "Tomo arcano", tipo: "foco", desc: "Foco mágico" }] : []),
          ...(classe === "clerigo" ? [{ id: "simbolo", nome: "Símbolo sagrado", tipo: "foco", desc: "Foco divino" }] : []),
          ...(classe === "ladino" ? [{ id: "adaga", nome: "Adaga", tipo: "arma", desc: "1d4 dano perfurante, finesse" }] : []),
          ...(classe === "barbaro" ? [{ id: "machado", nome: "Machado de mão", tipo: "arma", desc: "1d6 dano cortante" }] : []),
          ...(classe === "bardo" ? [{ id: "alaude", nome: "Alaúde", tipo: "instrumento", desc: "Foco bárdico" }] : []),
          { id: "kit-aventura", nome: "Kit do aventureiro", tipo: "kit", desc: "Mochila, corda, lanterna, sílex, água" },
          { id: "pocao-cura", nome: "Poção de cura", tipo: "consumivel", desc: "Cura 2d4+2 HP", consumivel: true },
        ],
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

  const STEPS: { k: Step; label: string }[] = [
    { k: "raca", label: "Raça" },
    { k: "classe", label: "Classe" },
    { k: "atributos", label: "Atributos" },
    { k: "sexo", label: "Aparência" },
    { k: "historia", label: "História" },
    { k: "retrato", label: "Retrato" },
  ];

  return (
    <main className="relative min-h-screen px-6 py-8 pergaminho-texture">
      <div className="max-w-3xl mx-auto epico-entrada">
        <div className="flex items-center justify-between mb-8">
          <Link href={`/sala/${code}`} className="text-xs uppercase tracking-[0.4em] text-[var(--color-pergaminho-velho)] hover:text-[var(--color-dourado)]">
            ← Sala
          </Link>
          <span className="text-xs text-[var(--color-pedra)] tracking-widest">
            Forjar viajante
          </span>
        </div>

        {/* Stepper */}
        <ol className="flex items-center justify-center gap-1 sm:gap-2 mb-12 text-xs uppercase tracking-widest flex-wrap">
          {STEPS.map((s, i) => (
            <li key={s.k} className="flex items-center gap-1 sm:gap-2">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                  step === s.k
                    ? "border-[var(--color-dourado)] text-[var(--color-dourado)] bg-[var(--color-vinho)]/30"
                    : "border-[var(--color-pergaminho-velho)]/30 text-[var(--color-pedra)]"
                }`}
              >
                {i + 1}
              </span>
              <span className={step === s.k ? "text-[var(--color-pergaminho)]" : "text-[var(--color-pedra)] hidden sm:inline"}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="text-[var(--color-pedra)] mx-1 hidden sm:inline">·</span>}
            </li>
          ))}
        </ol>

        {/* RAÇA */}
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

        {/* CLASSE */}
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
              <button onClick={() => setStep("raca")} className="btn-selo-secundario text-xs">Voltar</button>
            </div>
          </section>
        )}

        {/* ATRIBUTOS */}
        {step === "atributos" && raca && classe && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tuas forças
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-2">
              Point-buy: {pontosUsados}/{POINT_BUY_BUDGET} pontos.
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
                  <div key={a.key} className="flex items-center gap-3 bg-[var(--color-carvao)]/40 border border-[var(--color-pergaminho-velho)]/30 rounded-lg p-3">
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
                    >−</button>
                    <div className="text-center w-24">
                      <div className="text-xl text-[var(--color-pergaminho)] font-[family-name:var(--font-cinzel-decorative)]">
                        {valor}
                        {final !== valor && (<span className="text-sm text-[var(--color-dourado)] ml-1">→ {final}</span>)}
                      </div>
                      <div className="text-xs text-[var(--color-pergaminho-velho)]">mod {mod >= 0 ? `+${mod}` : mod}</div>
                    </div>
                    <button
                      onClick={() => ajustarAtributo(a.key, +1)}
                      disabled={valor >= 15 || custoPointBuy(valor + 1) - custoPointBuy(valor) > pontosRestantes}
                      className="w-8 h-8 rounded border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] disabled:opacity-30"
                    >+</button>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3 justify-between">
              <button onClick={() => setStep("classe")} className="btn-selo-secundario text-xs">Voltar</button>
              <button onClick={() => setStep("sexo")} disabled={pontosUsados !== POINT_BUY_BUDGET} className="btn-selo disabled:opacity-50 disabled:cursor-not-allowed">
                {pontosUsados < POINT_BUY_BUDGET ? `Faltam ${POINT_BUY_BUDGET - pontosUsados} pts` : "Continuar"}
              </button>
            </div>
          </section>
        )}

        {/* SEXO + APARÊNCIA */}
        {step === "sexo" && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tua forma
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              Como tua aparência se mostra no mundo.
            </p>

            <div className="space-y-6">
              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-3 block">Nome do personagem</label>
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
                <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-3 block">Sexo / Apresentação</label>
                <div className="grid grid-cols-3 gap-3">
                  {SEXOS.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setSexo(s.key)}
                      className={`px-4 py-3 rounded border transition ${
                        sexo === s.key
                          ? "border-[var(--color-dourado)] bg-[var(--color-vinho)]/30 text-[var(--color-dourado)]"
                          : "border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] hover:border-[var(--color-dourado)]/60"
                      }`}
                    >
                      {s.nome}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-3 block">
                  Detalhes visuais (opcional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="cabelo prateado e cicatriz no rosto, barba ruiva trançada, tatuagens tribais…"
                  value={aparencia}
                  onChange={(e) => setAparencia(e.target.value)}
                  className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)]"
                />
                <p className="text-xs text-[var(--color-pedra)] mt-2">Isso vai pra arte do retrato.</p>
              </div>
            </div>

            <div className="mt-8 flex gap-3 justify-between">
              <button onClick={() => setStep("atributos")} className="btn-selo-secundario text-xs">Voltar</button>
              <button onClick={() => setStep("historia")} disabled={!nome.trim() || !sexo} className="btn-selo disabled:opacity-50 disabled:cursor-not-allowed">
                Continuar
              </button>
            </div>
          </section>
        )}

        {/* HISTÓRIA */}
        {step === "historia" && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Tua história
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              Responde o que quiser (todas opcionais), depois um botão gera o background com a IA — ou escreve direto se preferir.
            </p>

            <div className="space-y-4 mb-6">
              {PERGUNTAS_HISTORICO.map((p) => (
                <div key={p.key}>
                  <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
                    {p.label}
                  </label>
                  <input
                    type="text"
                    placeholder={p.placeholder}
                    value={respostas[p.key] || ""}
                    onChange={(e) => setRespostas((prev) => ({ ...prev, [p.key]: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] text-sm focus:outline-none focus:border-[var(--color-dourado)]"
                  />
                </div>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap gap-2 items-center">
              <button
                onClick={gerarHistoriaIA}
                disabled={gerandoHistoria}
                className="px-4 py-2 rounded bg-[var(--color-vinho)]/40 border border-[var(--color-dourado)] text-[var(--color-dourado)] text-xs uppercase tracking-widest hover:bg-[var(--color-vinho)]/60 disabled:opacity-50"
              >
                {gerandoHistoria ? "✦ Tecendo a história…" : "✦ Gerar história com IA"}
              </button>
              {background && (
                <span className="text-xs text-[var(--color-pergaminho-velho)] italic">
                  {background.length} caracteres — pode editar livre abaixo
                </span>
              )}
            </div>

            <div>
              <label className="text-xs uppercase tracking-widest text-[var(--color-pergaminho-velho)] mb-1.5 block">
                Background final (sem limite)
              </label>
              <textarea
                rows={10}
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                placeholder="Escreve aqui a história, ou clica acima pra IA gerar baseado nas respostas…"
                className="w-full px-4 py-3 rounded bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-pergaminho)] focus:outline-none focus:border-[var(--color-dourado)] resize-y leading-relaxed"
              />
            </div>

            {erro && <p className="text-[var(--color-sangue)] text-sm mt-3">{erro}</p>}

            <div className="mt-8 flex gap-3 justify-between">
              <button onClick={() => setStep("sexo")} className="btn-selo-secundario text-xs">Voltar</button>
              <button onClick={() => { regerarRetratos(); setStep("retrato"); }} className="btn-selo">Gerar retrato</button>
            </div>
          </section>
        )}

        {/* RETRATO */}
        {(step === "retrato" || step === "salvando") && raca && classe && (
          <section>
            <h2 className="text-3xl text-[var(--color-dourado-claro)] dourado-glow mb-2 font-[family-name:var(--font-cinzel)]">
              Teu rosto
            </h2>
            <p className="text-sm text-[var(--color-pergaminho-velho)] mb-8">
              4 retratos forjados pela IA. Escolhe um — ou re-roll por novos.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {retratoSeeds.map((seed, idx) => {
                const estado = retratoEstados[idx];
                const url = buildPollinationsUrl(
                  promptRetrato({ raca, classe, sexo: sexo || undefined, aparencia, variacao: idx }),
                  seed
                );
                const escolhido = retratoEscolhido === url && estado === "ok";
                const imgKey = `${seed}-${retratoVersion}`;

                return (
                  <div
                    key={imgKey}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
                      escolhido
                        ? "border-[var(--color-dourado)] ring-2 ring-[var(--color-dourado)]/40"
                        : "border-[var(--color-pergaminho-velho)]/30 hover:border-[var(--color-dourado)]/60"
                    }`}
                  >
                    {estado === "pendente" && (
                      <div className="w-full h-full flex items-center justify-center bg-[var(--color-carvao)]/60">
                        <span className="text-[var(--color-pedra)] text-xs italic">aguardando</span>
                      </div>
                    )}

                    {estado === "erro" && (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-[var(--color-carvao)]/60 p-2">
                        <span className="text-[var(--color-sangue)] text-xs">falhou</span>
                        <button
                          onClick={() => regerarSlot(idx)}
                          className="text-[10px] uppercase tracking-widest text-[var(--color-dourado)] hover:text-[var(--color-dourado-claro)] border border-[var(--color-dourado)] rounded px-2 py-1"
                        >
                          ↻ tentar
                        </button>
                      </div>
                    )}

                    {(estado === "carregando" || estado === "ok") && (
                      <button
                        onClick={() => estado === "ok" && setRetratoEscolhido(url)}
                        disabled={estado !== "ok"}
                        className="w-full h-full block relative"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          key={imgKey}
                          src={url}
                          alt={`Retrato ${idx + 1}`}
                          className={`w-full h-full object-cover ${estado === "carregando" ? "opacity-50" : ""}`}
                          onLoad={() => onSlotConcluido(idx, "ok")}
                          onError={() => onSlotConcluido(idx, "erro")}
                        />
                        {estado === "carregando" && (
                          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-carvao)]/40">
                            <span className="text-[var(--color-dourado)] text-xs italic animate-pulse">forjando…</span>
                          </div>
                        )}
                        {escolhido && (
                          <div className="absolute inset-0 bg-[var(--color-dourado)]/10 flex items-center justify-center">
                            <span className="text-[var(--color-dourado-claro)] text-3xl dourado-glow">✓</span>
                          </div>
                        )}
                      </button>
                    )}

                    {estado !== "carregando" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          regerarSlot(idx);
                        }}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-[var(--color-carvao)]/80 border border-[var(--color-pergaminho-velho)]/40 text-[var(--color-dourado)] text-xs hover:border-[var(--color-dourado)] z-10"
                        title="Trocar este retrato"
                      >
                        ↻
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 mb-8 items-center">
              <button onClick={regerarRetratos} className="btn-selo-secundario text-xs" disabled={step === "salvando"}>
                ↻ Re-rolar todos
              </button>
              <p className="text-xs text-[var(--color-pedra)] flex-1 self-center italic">
                ✦ Pollinations.ai · grátis · sequencial 1 por vez (5–15s cada).
              </p>
            </div>

            {erro && <p className="text-[var(--color-sangue)] text-sm mb-4">{erro}</p>}

            <div className="flex gap-3 justify-between">
              <button onClick={() => setStep("historia")} className="btn-selo-secundario text-xs" disabled={step === "salvando"}>
                Voltar
              </button>
              <button onClick={salvar} disabled={!retratoEscolhido || step === "salvando"} className="btn-selo disabled:opacity-50 disabled:cursor-not-allowed">
                {step === "salvando" ? "Selando o pergaminho…" : "Confirmar e entrar na sala"}
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
