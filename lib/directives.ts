/**
 * Diretrizes do Mestre — parser unificado.
 * O Mestre escreve no fim das narrações tags entre colchetes que disparam
 * mecânicas no client. Tudo é passivo: a IA SUGERE, o player CONFIRMA.
 *
 * Tags suportadas:
 *  [MUSICA: tavern]                       — troca trilha
 *  [SFX: thunder]                         — som pontual
 *  [ROLL: SAB DC 15 @bebeto]              — pede rolagem PARA UM JOGADOR ESPECÍFICO (sempre marca @nick)
 *  [ROLL: SAB DC 15]                      — sem @ = grupo todo (raro, ex.: Iniciativa)
 *  [ROLL: SAB DC 15 vantagem @bebeto]     — vantagem/desvantagem com alvo
 *  [ATTACK: <alvo> 1d20+5 vs AC 13 @nick] — ataque do PC (alvo = quem rola)
 *  [SAVE: WIS DC 14 @nick]                — alias semântico de ROLL com alvo
 *  [INITIATIVE]                           — começa combate, todos rolam iniciativa
 *  [HP <nick> -5] / [HP <nick> +8]        — aplica dano/cura
 *  [REWARD: 50 lb]                        — entrega Lacrimas de Bruna
 *  [REWARD ITEM: poção menor]
 *  [NPC: Anderson] [aparência] [bordão]
 *  [QUEST add: investigar a Boate]
 *  [QUEST done: investigar a Boate]
 *  [TIME: night] [WEATHER: rain]
 *  [COMBATE INICIA] / [COMBATE FIM]
 *  [LEVEL UP <nick>]
 *  [INSPIRATION <nick>]
 */

export type Directive =
  | { kind: "music"; mood: string }
  | { kind: "sfx"; sfx: string }
  | { kind: "roll"; attr?: string; skill?: string; dc?: number; vantage?: "advantage" | "disadvantage" | "normal"; target?: string }
  | { kind: "attack"; alvo?: string; dice?: string; ac?: number; target?: string }
  | { kind: "initiative" }
  | { kind: "hp"; target: string; delta: number }
  | { kind: "reward"; amount?: number; item?: string }
  | { kind: "npc"; name: string; appearance?: string; bordao?: string }
  | { kind: "quest"; action: "add" | "done"; title: string }
  | { kind: "time"; value: string }
  | { kind: "weather"; value: string }
  | { kind: "combat"; phase: "start" | "end" }
  | { kind: "level"; target: string }
  | { kind: "inspiration"; target: string }
  | { kind: "xp"; target: string; amount: number }
  | { kind: "clock"; name: string; op: "set" | "delta"; value: number }
  | { kind: "aside"; target: string; text: string }
  | { kind: "asidePrivate"; target: string } // Sprint G — indicador público; texto vem via private_asides
  | { kind: "timeskip"; amount: string }
  | { kind: "panel"; description: string; caption: string };

const TAG_RE = /\[([A-Z_]+)(?:\s*:\s*|\s+)?([^\]]*)\]/gi;

export function parseDirectives(text: string): Directive[] {
  const out: Directive[] = [];
  let m: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((m = TAG_RE.exec(text)) !== null) {
    const tag = m[1].toUpperCase();
    const rest = (m[2] || "").trim();
    const d = parseTag(tag, rest);
    if (d) out.push(d);
  }
  return out;
}

function parseTag(tag: string, rest: string): Directive | null {
  switch (tag) {
    case "MUSICA":
    case "MUSIC":
      return rest ? { kind: "music", mood: rest.toLowerCase() } : null;

    case "SFX":
      return rest ? { kind: "sfx", sfx: rest.toLowerCase() } : null;

    case "ROLL":
    case "SAVE": {
      const dcMatch = rest.match(/DC\s*(\d+)/i) || rest.match(/CD\s*(\d+)/i);
      const attrMatch = rest.match(/\b(FOR|DES|CON|INT|SAB|CAR|STR|DEX|WIS|CHA)\b/i);
      const skillMatch = rest.match(/\(([^)]+)\)/);
      const vantage = /vantagem|advantage/i.test(rest)
        ? "advantage"
        : /desvantagem|disadvantage/i.test(rest)
          ? "disadvantage"
          : "normal";
      const target = parseTarget(rest);
      return {
        kind: "roll",
        attr: attrMatch ? normalizeAttr(attrMatch[1]) : undefined,
        skill: skillMatch ? skillMatch[1].trim() : undefined,
        dc: dcMatch ? parseInt(dcMatch[1], 10) : undefined,
        vantage,
        target,
      };
    }

    case "ATTACK": {
      const ac = (rest.match(/AC\s*(\d+)/i) || rest.match(/CA\s*(\d+)/i))?.[1];
      const dice = rest.match(/\d*d\d+(?:[+-]\d+)?/i)?.[0];
      // Remove @nick e bloco "vs ..." pra extrair alvo do ataque (target da narrativa)
      const restSemTarget = rest.replace(/@\S+/g, "").trim();
      const alvoMatch = restSemTarget.split(/\bvs\b/i)[0]?.trim();
      const target = parseTarget(rest);
      return {
        kind: "attack",
        alvo: alvoMatch || undefined,
        dice: dice || undefined,
        ac: ac ? parseInt(ac, 10) : undefined,
        target,
      };
    }

    case "INITIATIVE":
      return { kind: "initiative" };

    case "HP": {
      // "Aurelius -5" ou "bebeto +8"
      const m2 = rest.match(/^(.+?)\s+([+-]\d+)$/);
      if (!m2) return null;
      return { kind: "hp", target: m2[1].trim(), delta: parseInt(m2[2], 10) };
    }

    case "REWARD": {
      const amount = rest.match(/(\d+)\s*(?:lb|lacrim|ouro|gold)/i)?.[1];
      const item = rest.match(/(?:item|poção|pocao|arma)\s*:?\s*(.+)/i)?.[1];
      return { kind: "reward", amount: amount ? parseInt(amount, 10) : undefined, item: item?.trim() };
    }

    case "NPC": {
      // "Anderson | mãos calejadas | ó a empatia" ou só nome
      const partes = rest.split(/\s*\|\s*/);
      return {
        kind: "npc",
        name: partes[0]?.trim() || "",
        appearance: partes[1]?.trim(),
        bordao: partes[2]?.trim(),
      };
    }

    case "QUEST": {
      const m3 = rest.match(/^(add|done|complete)\s*:?\s*(.+)$/i);
      if (!m3) return null;
      const action = /done|complete/i.test(m3[1]) ? "done" : "add";
      return { kind: "quest", action, title: m3[2].trim() };
    }

    case "TIME":
      return rest ? { kind: "time", value: rest.toLowerCase() } : null;

    case "WEATHER":
      return rest ? { kind: "weather", value: rest.toLowerCase() } : null;

    case "COMBATE":
    case "COMBAT": {
      if (/inicia|start|begin/i.test(rest)) return { kind: "combat", phase: "start" };
      if (/fim|end/i.test(rest)) return { kind: "combat", phase: "end" };
      // [COMBATE INICIA] sem dois-pontos
      return null;
    }

    case "COMBATE_INICIA":
      return { kind: "combat", phase: "start" };

    case "LEVEL":
      return rest ? { kind: "level", target: rest.replace(/^up\s*/i, "").trim() } : null;

    case "INSPIRATION":
      return rest ? { kind: "inspiration", target: rest.trim() } : null;

    case "XP": {
      // "bebeto 100" ou "yumi +50"
      const m4 = rest.match(/^(.+?)\s+\+?(\d+)$/);
      if (!m4) return null;
      return { kind: "xp", target: m4[1].trim(), amount: parseInt(m4[2], 10) };
    }

    case "CLOCK": {
      // "doom +1" / "arco -2" / "situacional = 4" / "doom 1" (delta default)
      const m5 = rest.match(/^(\w+)\s*(=|[+-])?\s*(\d+)$/);
      if (!m5) return null;
      const name = m5[1].toLowerCase();
      const op = m5[2] === "=" ? "set" : "delta";
      const sign = m5[2] === "-" ? -1 : 1;
      const v = parseInt(m5[3], 10);
      return { kind: "clock", name, op, value: op === "set" ? v : sign * v };
    }

    case "ASIDE": {
      // "bebeto: você nota algo que outros não viram..."
      const idx = rest.indexOf(":");
      if (idx === -1) return null;
      const target = rest.slice(0, idx).trim();
      const text = rest.slice(idx + 1).trim();
      return { kind: "aside", target, text };
    }

    case "ASIDE_PRIVATE": {
      // Sprint G — placeholder publico. Texto real em private_asides (RLS).
      const m = rest.match(/@([a-zA-Z0-9_-]+)/);
      if (!m) return null;
      return { kind: "asidePrivate", target: m[1].toLowerCase() };
    }

    case "TIMESKIP": {
      // "3 dias", "1 semana", "1 mês"
      return rest ? { kind: "timeskip", amount: rest } : null;
    }

    case "PANEL": {
      // "descrição visual da cena | frase de impacto"
      // Gera ilustração via Pollinations + caption dramática.
      const partes = rest.split(/\s*\|\s*/);
      if (partes.length < 2) return null;
      return {
        kind: "panel",
        description: partes[0].trim(),
        caption: partes[1].trim(),
      };
    }

    default:
      return null;
  }
}

function normalizeAttr(a: string): string {
  const u = a.toUpperCase();
  if (u === "STR") return "for";
  if (u === "DEX") return "des";
  if (u === "WIS") return "sab";
  if (u === "CHA") return "car";
  return u.toLowerCase();
}

/**
 * Extrai @nick (ou múltiplos @nick1 @nick2) da string da diretiva.
 * Retorna o primeiro nick em lowercase. Se não houver @, retorna undefined.
 * Aceita: "DC 15 @bebeto", "@yumi DC 15", "vantagem @teucu DC 15".
 */
function parseTarget(rest: string): string | undefined {
  const m = rest.match(/@([a-zA-Z0-9_-]+)/);
  return m ? m[1].toLowerCase() : undefined;
}

/**
 * Remove diretivas do texto pra exibição limpa. Conservadora: NÃO toca em
 * em-dashes (—), aspas, hífens, pra preservar diálogo Suassuna-style.
 * Limpa só lixo óbvio que aparece DEPOIS da remoção das tags.
 */
export function stripDirectives(text: string): string {
  return text
    // Remove [TAG] e [TAG: ...]
    .replace(/\[([A-Z_]+)(?:\s*:\s*|\s+)?([^\]]*)\]/gi, "")
    // Múltiplos espaços viram um
    .replace(/[ \t]{2,}/g, " ")
    // Quebras de linha excessivas
    .replace(/\n{3,}/g, "\n\n")
    // Limpa SÓ leading whitespace + vírgulas/dois-pontos órfãos no início absoluto
    // (NÃO toca em — ou outros caracteres válidos)
    .replace(/^[\s,;:]+/, "")
    // Remove espaço antes de vírgula/ponto (cosmético)
    .replace(/ +([,.])/g, "$1")
    .trim();
}
