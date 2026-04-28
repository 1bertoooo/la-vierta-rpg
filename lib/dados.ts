/**
 * Sistema de rolagem de dados.
 * Notação tipo D&D: "1d20+5", "2d6", "1d8+FOR".
 */

export type DiceRoll = {
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  faces: number;
  count: number;
  critical?: boolean; // 20 natural num d20
  fumble?: boolean; // 1 natural num d20
};

const ROLL_RE = /^(\d*)d(\d+)([+-]\d+)?$/i;

export function rolarDados(expression: string): DiceRoll | null {
  const limpo = expression.trim().replace(/\s+/g, "").toLowerCase();
  const match = limpo.match(ROLL_RE);
  if (!match) return null;

  const count = Math.max(1, Math.min(20, parseInt(match[1] || "1", 10)));
  const faces = Math.max(2, Math.min(100, parseInt(match[2], 10)));
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(1 + Math.floor(Math.random() * faces));
  }
  const sum = rolls.reduce((a, b) => a + b, 0);
  const total = sum + modifier;

  const isD20 = faces === 20 && count === 1;
  return {
    expression: limpo,
    rolls,
    modifier,
    total,
    faces,
    count,
    critical: isD20 && rolls[0] === 20,
    fumble: isD20 && rolls[0] === 1,
  };
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
