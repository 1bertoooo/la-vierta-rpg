/**
 * Diretrizes do Mestre — parser unificado.
 * O Mestre escreve no fim das narrações tags entre colchetes que disparam
 * mecânicas no client. Tudo é passivo: a IA SUGERE, o player CONFIRMA.
 *
 * Tags suportadas:
 *  [MUSICA: tavern]               — troca trilha
 *  [SFX: thunder]                 — som pontual
 *  [ROLL: SAB DC 15]              — pede rolagem (atributo + DC)
 *  [ROLL: SAB DC 15 vantagem]     — vantagem/desvantagem
 *  [ATTACK: <alvo> 1d20+5 vs AC 13]
 *  [SAVE: WIS DC 14]              — alias semântico de ROLL
 *  [INITIATIVE]                   — começa combate, todos rolam iniciativa
 *  [HP <nick> -5] / [HP <nick> +8] — aplica dano/cura
 *  [REWARD: 50 lb]                — entrega Lacrimas de Bruna
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
  | { kind: "roll"; attr?: string; skill?: string; dc?: number; vantage?: "advantage" | "disadvantage" | "normal" }
  | { kind: "attack"; alvo?: string; dice?: string; ac?: number }
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
  | { kind: "aside"; target: string; text: string };

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
      return {
        kind: "roll",
        attr: attrMatch ? normalizeAttr(attrMatch[1]) : undefined,
        skill: skillMatch ? skillMatch[1].trim() : undefined,
        dc: dcMatch ? parseInt(dcMatch[1], 10) : undefined,
        vantage,
      };
    }

    case "ATTACK": {
      const ac = (rest.match(/AC\s*(\d+)/i) || rest.match(/CA\s*(\d+)/i))?.[1];
      const dice = rest.match(/\d*d\d+(?:[+-]\d+)?/i)?.[0];
      const alvoMatch = rest.split(/\bvs\b/i)[0]?.trim();
      return {
        kind: "attack",
        alvo: alvoMatch || undefined,
        dice: dice || undefined,
        ac: ac ? parseInt(ac, 10) : undefined,
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
 * Remove diretivas do texto pra exibição limpa (mas mantém [COMBATE INICIA] já tratado pelo regex original).
 */
export function stripDirectives(text: string): string {
  return text
    .replace(TAG_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
