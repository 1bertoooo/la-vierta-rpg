/**
 * Sistema de rolagem de dados.
 * Notação tipo D&D: "1d20+5", "2d6", "1d8+FOR", "2d6+1d4+3" (compostos).
 * Suporta vantagem/desvantagem (rola 2d20, pega maior/menor).
 */

export type Vantage = "normal" | "advantage" | "disadvantage";

export type DiceRoll = {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  faces: number;
  count: number;
  critical?: boolean; // 20 natural num d20
  fumble?: boolean; // 1 natural num d20
  vantage?: Vantage;
  /** Em vantagem/desvantagem: ambos d20s rolados (mostrar "8 vs 17 → 17") */
  bothD20?: [number, number];
  /** Para expressões compostas: cada parte rolada separadamente */
  parts?: DiceRollPart[];
};

export type DiceRollPart = {
  expression: string;
  rolls: number[];
  faces: number;
  count: number;
  subtotal: number;
};

const SIMPLE_RE = /^(\d*)d(\d+)([+-]\d+)?$/i;
const PART_RE = /([+-])?\s*(\d*)d(\d+)|([+-])\s*(\d+)/gi;

/**
 * Parser principal — aceita simples ("1d20+5") e compostos ("2d6+1d4+3").
 */
export function rolarDados(expression: string, vantage: Vantage = "normal"): DiceRoll | null {
  const limpo = expression.trim().replace(/\s+/g, "").toLowerCase();
  if (!limpo) return null;

  // Tenta simples primeiro
  const simple = limpo.match(SIMPLE_RE);
  if (simple) {
    const count = Math.max(1, Math.min(20, parseInt(simple[1] || "1", 10)));
    const faces = Math.max(2, Math.min(100, parseInt(simple[2], 10)));
    const modifier = simple[3] ? parseInt(simple[3], 10) : 0;
    return rolarSimples(limpo, count, faces, modifier, vantage);
  }

  // Composto: parsei como soma de partes
  const partes: DiceRollPart[] = [];
  let modAcumulado = 0;
  let m: RegExpExecArray | null;
  let achou = false;
  PART_RE.lastIndex = 0;
  while ((m = PART_RE.exec(limpo)) !== null) {
    achou = true;
    if (m[3]) {
      // dado: [sinal] [count] d [faces]
      const sinal = m[1] === "-" ? -1 : 1;
      const count = Math.max(1, Math.min(20, parseInt(m[2] || "1", 10)));
      const faces = Math.max(2, Math.min(100, parseInt(m[3], 10)));
      const rolls: number[] = [];
      for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * faces));
      const subtotal = sinal * rolls.reduce((a, b) => a + b, 0);
      partes.push({
        expression: `${sinal === -1 ? "-" : "+"}${count}d${faces}`,
        rolls, faces, count, subtotal,
      });
    } else if (m[5]) {
      // mod: [+|-] [num]
      const sinal = m[4] === "-" ? -1 : 1;
      modAcumulado += sinal * parseInt(m[5], 10);
    }
  }
  if (!achou) return null;

  const totalDados = partes.reduce((a, p) => a + p.subtotal, 0);
  return {
    expression: limpo,
    rolls: partes.flatMap((p) => p.rolls),
    modifier: modAcumulado,
    total: totalDados + modAcumulado,
    faces: partes[0]?.faces ?? 0,
    count: partes.reduce((a, p) => a + p.count, 0),
    parts: partes,
    vantage: "normal",
  };
}

function rolarSimples(
  expr: string,
  count: number,
  faces: number,
  modifier: number,
  vantage: Vantage,
): DiceRoll {
  const isD20Single = faces === 20 && count === 1;
  let rolls: number[] = [];
  let bothD20: [number, number] | undefined;

  if (isD20Single && vantage !== "normal") {
    // Vantagem/Desvantagem: rola 2d20, pega maior ou menor
    const a = 1 + Math.floor(Math.random() * 20);
    const b = 1 + Math.floor(Math.random() * 20);
    bothD20 = [a, b];
    const escolhido = vantage === "advantage" ? Math.max(a, b) : Math.min(a, b);
    rolls = [escolhido];
  } else {
    for (let i = 0; i < count; i++) rolls.push(1 + Math.floor(Math.random() * faces));
  }

  const sum = rolls.reduce((a, b) => a + b, 0);
  return {
    expression: expr,
    rolls,
    modifier,
    total: sum + modifier,
    faces,
    count,
    critical: isD20Single && rolls[0] === 20,
    fumble: isD20Single && rolls[0] === 1,
    vantage,
    bothD20,
  };
}

/** Helper formatação humana */
export function formatRoll(r: DiceRoll): string {
  if (r.parts && r.parts.length) {
    const partes = r.parts.map((p) => `${p.subtotal >= 0 ? "+" : ""}${p.subtotal}(${p.rolls.join(",")})`).join(" ");
    const mod = r.modifier !== 0 ? ` ${r.modifier >= 0 ? "+" : ""}${r.modifier}` : "";
    return `${partes}${mod} = ${r.total}`;
  }
  if (r.bothD20) {
    const winner = r.rolls[0];
    return `[${r.bothD20[0]} ${r.vantage === "advantage" ? "↑" : "↓"} ${r.bothD20[1]}] = ${winner}${r.modifier !== 0 ? `${r.modifier >= 0 ? "+" : ""}${r.modifier}` : ""} = ${r.total}`;
  }
  const dadosStr = r.count > 1 ? `(${r.rolls.join(",")})` : "";
  return `${r.rolls.join("+")}${dadosStr}${r.modifier !== 0 ? ` ${r.modifier >= 0 ? "+" : ""}${r.modifier}` : ""} = ${r.total}`;
}

/** Parse "DC 15" ou "CD 15" do prompt do mestre */
export function parseDC(text: string): number | null {
  const m = text.match(/(?:DC|CD)\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Parse atributo de uma diretriz tipo "[ROLL: SAB DC 15]" */
export function parseAttr(text: string): "for" | "des" | "con" | "int" | "sab" | "car" | null {
  const m = text.match(/\b(FOR|DES|CON|INT|SAB|CAR|STR|DEX|WIS|CHA)\b/i);
  if (!m) return null;
  const a = m[1].toUpperCase();
  if (a === "STR") return "for";
  if (a === "DEX") return "des";
  if (a === "WIS") return "sab";
  if (a === "CHA") return "car";
  return a.toLowerCase() as "for" | "des" | "con" | "int" | "sab" | "car";
}

export const DADOS_PADRAO = [
  { label: "d4", expr: "1d4" },
  { label: "d6", expr: "1d6" },
  { label: "d8", expr: "1d8" },
  { label: "d10", expr: "1d10" },
  { label: "d12", expr: "1d12" },
  { label: "d20", expr: "1d20" },
  { label: "d100", expr: "1d100" },
];
