/**
 * La Vierta System (LVS) — Constants & helpers
 * Sistema próprio inspirado em D&D 5e
 */

export type AtributoKey = "for" | "des" | "con" | "int" | "sab" | "car";

export const ATRIBUTOS: { key: AtributoKey; nome: string; desc: string }[] = [
  { key: "for", nome: "Força", desc: "Ataques corpo-a-corpo, dano físico, atletismo" },
  { key: "des", nome: "Destreza", desc: "Ataques à distância, CA, iniciativa, furtividade" },
  { key: "con", nome: "Constituição", desc: "Pontos de vida, resistir veneno e exaustão" },
  { key: "int", nome: "Inteligência", desc: "Magia de Mago, investigação, arcanismo" },
  { key: "sab", nome: "Sabedoria", desc: "Magia de Clérigo, percepção, intuição, medicina" },
  { key: "car", nome: "Carisma", desc: "Magia de Bardo, persuasão, enganação, intimidação" },
];

export type RacaKey = "humano" | "elfo" | "anao" | "halfling" | "meio_orc" | "tiefling";

export const RACAS: {
  key: RacaKey;
  nome: string;
  bonus: Partial<Record<AtributoKey, number>>;
  desc: string;
  trait: string;
}[] = [
  {
    key: "humano",
    nome: "Humano",
    bonus: { for: 1, des: 1, con: 1, int: 1, sab: 1, car: 1 },
    desc: "Versáteis, ambiciosos, espalhados pelos quatro cantos de Vélreth.",
    trait: "+1 em todos os atributos.",
  },
  {
    key: "elfo",
    nome: "Elfo da Floresta",
    bonus: { des: 2, sab: 1 },
    desc: "Habitantes ancestrais das florestas perdidas, ágeis e atentos.",
    trait: "+2 DES, +1 SAB. Visão na penumbra. Resistência a charme.",
  },
  {
    key: "anao",
    nome: "Anão das Forjas",
    bonus: { con: 2, for: 1 },
    desc: "Forjadores das montanhas, robustos e bebedores incansáveis.",
    trait: "+2 CON, +1 FOR. Resistência a veneno.",
  },
  {
    key: "halfling",
    nome: "Halfling Sortudo",
    bonus: { des: 2, car: 1 },
    desc: "Pequenos, sortudos, e de pés peludos. Ladinos por natureza.",
    trait: "+2 DES, +1 CAR. Re-roll de 1 natural 1x/turno.",
  },
  {
    key: "meio_orc",
    nome: "Meio-Orc",
    bonus: { for: 2, con: 1 },
    desc: "Mistura de duas heranças, marcados pela força bruta e olhar feroz.",
    trait: "+2 FOR, +1 CON. Vantagem em Intimidação.",
  },
  {
    key: "tiefling",
    nome: "Tiefling de La Vierta",
    bonus: { car: 2, int: 1 },
    desc: "Filhos amaldiçoados de Bruna, marcados desde o nascimento. Carismáticos e intensos.",
    trait: "+2 CAR, +1 INT. Visão no escuro. Resistência a fogo.",
  },
];

export type ClasseKey = "guerreiro" | "mago" | "clerigo" | "ladino" | "barbaro" | "bardo";

export const CLASSES: {
  key: ClasseKey;
  nome: string;
  hpDado: number;
  hpInicial: number;
  atributoPrincipal: AtributoKey;
  desc: string;
  features: string[];
}[] = [
  {
    key: "guerreiro",
    nome: "Guerreiro",
    hpDado: 10,
    hpInicial: 10,
    atributoPrincipal: "for",
    desc: "Mestre de armas e armaduras. Tank, dano físico, versátil.",
    features: ["Segundo Fôlego (cura 1d10+nível 1x/descanso)", "Combate em estilo escolhido"],
  },
  {
    key: "mago",
    nome: "Mago",
    hpDado: 6,
    hpInicial: 6,
    atributoPrincipal: "int",
    desc: "Estudante das artes arcanas. Frágil mas devastador.",
    features: ["Livro de magias", "3 cantrips + 2 magias N1 iniciais", "Recuperação Arcana"],
  },
  {
    key: "clerigo",
    nome: "Clérigo",
    hpDado: 8,
    hpInicial: 8,
    atributoPrincipal: "sab",
    desc: "Servo de uma divindade. Cura, suporte, e dano divino.",
    features: ["3 cantrips + 2 magias N1 iniciais", "Curar Ferimentos sempre preparada"],
  },
  {
    key: "ladino",
    nome: "Ladino",
    hpDado: 8,
    hpInicial: 8,
    atributoPrincipal: "des",
    desc: "Mestre da furtividade, das adagas e das fechaduras.",
    features: ["Ataque Furtivo (+1d6 dano de surpresa)", "Especialidade em ferramentas", "Vantagem em Furtividade"],
  },
  {
    key: "barbaro",
    nome: "Bárbaro",
    hpDado: 12,
    hpInicial: 12,
    atributoPrincipal: "for",
    desc: "Guerreiro selvagem que canaliza a fúria primal.",
    features: ["Fúria 2x/dia (resistência a dano físico, +2 dano)", "Defesa sem armadura"],
  },
  {
    key: "bardo",
    nome: "Bardo",
    hpDado: 8,
    hpInicial: 8,
    atributoPrincipal: "car",
    desc: "Encantador, contador de histórias, e mestre de muitas perícias.",
    features: ["3 cantrips + 2 magias N1 iniciais", "Inspiração de Bardo (d6 bônus pra aliado)", "Pau-pra-toda-obra"],
  },
];

// Modificador de atributo
export function modAtributo(valor: number): number {
  return Math.floor((valor - 10) / 2);
}

// Calcula HP máximo no nível 1
export function hpMaximoNivel1(classeKey: ClasseKey, conValor: number): number {
  const classe = CLASSES.find((c) => c.key === classeKey);
  if (!classe) return 10;
  return classe.hpInicial + modAtributo(conValor);
}

// Calcula CA base (sem armadura) — 10 + mod DES
export function caBase(desValor: number): number {
  return 10 + modAtributo(desValor);
}

// Aplica bônus racial aos atributos base
export function aplicarBonusRacial(
  base: Record<AtributoKey, number>,
  raca: RacaKey
): Record<AtributoKey, number> {
  const racaInfo = RACAS.find((r) => r.key === raca);
  if (!racaInfo) return base;
  const result = { ...base };
  for (const [key, bonus] of Object.entries(racaInfo.bonus)) {
    result[key as AtributoKey] = (result[key as AtributoKey] || 0) + (bonus as number);
  }
  return result;
}

// Roll 4d6 drop lowest
export function roll4d6DropLowest(): number {
  const rolls = [
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
  ];
  rolls.sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

// Atributos base padrão (point-buy mediano: 13 13 12 12 10 8 = 27 pts)
export const ATRIBUTOS_DEFAULT: Record<AtributoKey, number> = {
  for: 13,
  des: 13,
  con: 12,
  int: 12,
  sab: 10,
  car: 8,
};

// Custo do point-buy
const POINT_BUY_CUSTO: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export function custoPointBuy(valor: number): number {
  return POINT_BUY_CUSTO[valor] ?? 0;
}

export function totalPointBuy(atributos: Record<AtributoKey, number>): number {
  return Object.values(atributos).reduce((sum, v) => sum + custoPointBuy(v), 0);
}

export const POINT_BUY_BUDGET = 27;

// Magias iniciais por classe (nível 1)
export type Magia = {
  nome: string;
  nivel: number;
  escola: string;
  efeito: string;
};

export const CANTRIPS_POR_CLASSE: Record<ClasseKey, Magia[]> = {
  mago: [
    { nome: "Choque do Eterno", nivel: 0, escola: "evocação", efeito: "1d8 dano elétrico, alvo a 9m" },
    { nome: "Mão da Punheta Pesarosa", nivel: 0, escola: "transmutação", efeito: "Manipula objeto leve a 9m" },
    { nome: "Raio de Fogo", nivel: 0, escola: "evocação", efeito: "1d10 dano fogo, alvo a 36m" },
  ],
  clerigo: [
    { nome: "Chama Sagrada", nivel: 0, escola: "evocação", efeito: "1d8 dano radiante, alvo a 18m" },
    { nome: "Taumaturgia", nivel: 0, escola: "transmutação", efeito: "Pequenos efeitos divinos" },
  ],
  bardo: [
    { nome: "Mensagem", nivel: 0, escola: "transmutação", efeito: "Sussurro mágico a 36m" },
    { nome: "Ilusão Menor", nivel: 0, escola: "ilusão", efeito: "Cria som ou imagem a 9m" },
  ],
  guerreiro: [],
  ladino: [],
  barbaro: [],
};

export const MAGIAS_N1_POR_CLASSE: Record<ClasseKey, Magia[]> = {
  mago: [
    { nome: "Mísseis da Saudade", nivel: 1, escola: "evocação", efeito: "3 mísseis, 1d4+1 dano cada, sem rolar pra acertar" },
    { nome: "Escudo do Bonzinho", nivel: 1, escola: "abjuração", efeito: "+5 CA até teu próximo turno (reação)" },
    { nome: "Sono do Rivotril", nivel: 1, escola: "encantamento", efeito: "5d8 HP de criaturas dormem em área 6m" },
  ],
  clerigo: [
    { nome: "Curar Ferimentos", nivel: 1, escola: "evocação", efeito: "Cura 1d8+SAB" },
    { nome: "Bênção", nivel: 1, escola: "encantamento", efeito: "3 aliados +d4 em ataques e saves" },
  ],
  bardo: [
    { nome: "Charme da Coroa de 44", nivel: 1, escola: "encantamento", efeito: "1 humanoide te vê como aliado por 1h" },
    { nome: "Vômito Purificador das 5 Novalginas", nivel: 1, escola: "necromancia", efeito: "Cura 1d8 mas alvo vomita 1 turno" },
  ],
  guerreiro: [],
  ladino: [],
  barbaro: [],
};

// Pollinations URL builder
export function buildPollinationsUrl(prompt: string, seed: number = 0): string {
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${seed}`;
}

// Prompt base pra retrato de personagem
export type SexoKey = "masculino" | "feminino" | "androgino";
export const SEXOS: { key: SexoKey; nome: string; en: string }[] = [
  { key: "masculino", nome: "Masculino", en: "male" },
  { key: "feminino", nome: "Feminino", en: "female" },
  { key: "androgino", nome: "Andrógino", en: "androgynous" },
];

// 4 variações de mood/iluminação pros 4 retratos saírem distintos
const VARIACOES_RETRATO = [
  "intense gaze, dramatic chiaroscuro candle lighting from below",
  "battle-worn weathered face with scars, golden hour rim lighting",
  "mystical glowing eyes, blue moonlight from window",
  "calm noble expression, warm fireplace lighting from side",
];

export function promptRetrato(opts: {
  raca: RacaKey;
  classe: ClasseKey;
  sexo?: SexoKey;
  aparencia?: string;
  variacao?: number; // 0-3
}): string {
  const sexoEn = opts.sexo ? SEXOS.find((s) => s.key === opts.sexo)?.en || "" : "";
  const racaEn = {
    humano: "human",
    elfo: "wood elf with pointed ears",
    anao: "dwarf with thick beard",
    halfling: "halfling",
    meio_orc: "half-orc with tusks",
    tiefling: "tiefling with red skin and horns",
  }[opts.raca];
  const classeEn = {
    guerreiro: "fighter wearing armor",
    mago: "wizard in dark robes",
    clerigo: "cleric with a holy symbol",
    ladino: "rogue with hood",
    barbaro: "barbarian with painted face",
    bardo: "bard",
  }[opts.classe];

  // Aparência vai pro INÍCIO (peso semântico maior em Stable Diffusion)
  const detalhes = opts.aparencia?.trim() ? `${opts.aparencia.trim()}, ` : "";
  const variacao = opts.variacao !== undefined
    ? VARIACOES_RETRATO[opts.variacao % VARIACOES_RETRATO.length]
    : VARIACOES_RETRATO[0];

  return `${detalhes}${sexoEn} ${racaEn} ${classeEn}, ${variacao}, epic dark fantasy portrait painting, headshot, oil painting, dungeons and dragons concept art, Larry Elmore Wayne Reynolds style, detailed expressive face, deep saturated colors, atmospheric, brush strokes visible. No text, no watermark.`;
}

// Perguntas pra gerar background com IA
export const PERGUNTAS_HISTORICO = [
  { key: "origem", label: "Onde teu personagem cresceu?", placeholder: "uma vila esquecida na Baixada Sombria, ou nas docas de Porto Freguesia…" },
  { key: "estudou", label: "Estudou ou aprendeu o ofício como?", placeholder: "fugiu de casa cedo, aprendeu no Miguel-Couto, foi treinado por um velho mestre…" },
  { key: "trauma", label: "Qual cicatriz carrega?", placeholder: "perdeu alguém, cometeu um crime, foi traído, é portador de algo…" },
  { key: "motivacao", label: "O que busca em Vélreth?", placeholder: "vingança, redenção, fortuna, encontrar alguém perdido, fugir de algo…" },
  { key: "medo", label: "Qual é o medo mais profundo?", placeholder: "voltar pra casa, ficar sozinho, perder o controle, o passado vir cobrar…" },
];
