export const BOARD_COLUMNS = 6;
export const BOARD_ROWS = 5;
export const CELL_COUNT = BOARD_COLUMNS * BOARD_ROWS;
export const STARTING_BALANCE_CENTS = 1_000_000;
export const MAX_WIN_MULTIPLIER = 5000;

export const BETS_CENTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000] as const;

export const ANIMATION = {
  initialDrop: 820,
  columnStagger: 56,
  boardSettle: 160,
  winDetectionPause: 140,
  winHighlight: 340,
  preBurst: 140,
  burst: 330,
  winLabel: 1740,
  postBurstPause: 110,
  gravity: 380,
  refill: 560,
  refillSettle: 150,
  nextEvaluation: 120,
  scatterLanding: 520,
  multiplierLanding: 190,
  freeSpinPause: 260,
  spinPause: 250,
} as const;

export type NormalSymbolId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
export type SymbolId = NormalSymbolId | "SCATTER";

export type SymbolDefinition = {
  id: SymbolId;
  name: string;
  icon: string;
  color: number;
  colorHex: string;
  accentColor: number;
  frameColor: number;
  logoPath?: string;
  weight: number;
};

export const SYMBOLS: readonly SymbolDefinition[] = [
  { id: "S1", name: "Real Madrid", icon: "RM", color: 0xeaf1ff, colorHex: "#eaf1ff", accentColor: 0xd4af37, frameColor: 0x9ed8ff, logoPath: "team-logos/real-madrid.png", weight: 17 },
  { id: "S2", name: "Barcelona", icon: "BAR", color: 0x7030a0, colorHex: "#b36bef", accentColor: 0xa50044, frameColor: 0xffc24b, logoPath: "team-logos/barcelona.png", weight: 15.5 },
  { id: "S3", name: "Chelsea", icon: "CHE", color: 0x0879e8, colorHex: "#3aa5ff", accentColor: 0x9ed5ff, frameColor: 0x36c8ff, logoPath: "team-logos/chelsea.png", weight: 14 },
  { id: "S4", name: "Roma", icon: "ROM", color: 0x8e3b12, colorHex: "#d8752e", accentColor: 0xf0b44d, frameColor: 0xff7849, logoPath: "team-logos/roma.png", weight: 12.5 },
  { id: "S5", name: "Liverpool", icon: "LIV", color: 0xdc1638, colorHex: "#ff3c58", accentColor: 0xffd8d8, frameColor: 0xff466b, logoPath: "team-logos/liverpool.png", weight: 11.5 },
  { id: "S6", name: "PSG", icon: "PSG", color: 0x172c62, colorHex: "#617fc8", accentColor: 0xef3340, frameColor: 0x8d7cff, logoPath: "team-logos/psg.png", weight: 10 },
  { id: "S7", name: "Bayern", icon: "BAY", color: 0xe50059, colorHex: "#ff5b9a", accentColor: 0xf1f1f1, frameColor: 0xfff1f7, logoPath: "team-logos/bayern.png", weight: 9 },
  { id: "S8", name: "Galatasaray", icon: "GS", color: 0xf4bd00, colorHex: "#ffd31c", accentColor: 0xc8102e, frameColor: 0xffd42f, logoPath: "team-logos/galatasaray.png", weight: 8 },
  { id: "SCATTER", name: "Golden Trophy", icon: "★", color: 0xf2b84b, colorHex: "#f2b84b", accentColor: 0xffefad, frameColor: 0xffd05c, weight: 2.5 },
];

export const NORMAL_SYMBOLS = SYMBOLS.filter((symbol) => symbol.id !== "SCATTER") as readonly SymbolDefinition[];

export type ReelConfig = {
  name: "BASE" | "BONUS";
  symbolWeights: readonly { value: NormalSymbolId; weight: number }[];
};

export const NORMAL_PAIR_COPY_CHANCE = 0.9;

export const BASE_REEL_CONFIG: ReelConfig = {
  name: "BASE",
  symbolWeights: NORMAL_SYMBOLS.map(({ id, weight }) => ({ value: id as NormalSymbolId, weight })),
};

export const BONUS_REEL_CONFIG: ReelConfig = {
  name: "BONUS",
  symbolWeights: NORMAL_SYMBOLS.map(({ id, weight }) => ({ value: id as NormalSymbolId, weight })),
};

export type MultiplierCoreVisualTier = "low" | "mid" | "high";

export const getMultiplierCoreVisualTier = (value: number): MultiplierCoreVisualTier =>
  value >= 100 ? "high" : value >= 10 ? "mid" : "low";

export type SymbolEffectProfile = {
  particleType: "droplet" | "fragment" | "ray" | "dust" | "star" | "shard" | "streak" | "prism";
  burstType: "ring" | "spiral" | "sun" | "smoke" | "flash" | "shards" | "crown" | "fracture";
  glowType: "soft" | "angular" | "radial" | "halo";
  particleCount: number;
  duration: number;
  pitch: number;
  scale: number;
};

export const SYMBOL_EFFECT_PROFILES: Record<NormalSymbolId, SymbolEffectProfile> = {
  S1: { particleType: "droplet", burstType: "ring", glowType: "soft", particleCount: 10, duration: 210, pitch: 0.92, scale: 1.04 },
  S2: { particleType: "fragment", burstType: "spiral", glowType: "angular", particleCount: 11, duration: 220, pitch: 0.98, scale: 1.08 },
  S3: { particleType: "ray", burstType: "sun", glowType: "radial", particleCount: 13, duration: 230, pitch: 1.04, scale: 1.12 },
  S4: { particleType: "dust", burstType: "smoke", glowType: "halo", particleCount: 9, duration: 240, pitch: 1.1, scale: 1.06 },
  S5: { particleType: "star", burstType: "flash", glowType: "radial", particleCount: 12, duration: 220, pitch: 1.16, scale: 1.1 },
  S6: { particleType: "shard", burstType: "shards", glowType: "angular", particleCount: 12, duration: 230, pitch: 1.22, scale: 1.13 },
  S7: { particleType: "streak", burstType: "crown", glowType: "radial", particleCount: 14, duration: 240, pitch: 1.3, scale: 1.16 },
  S8: { particleType: "prism", burstType: "fracture", glowType: "halo", particleCount: 16, duration: 250, pitch: 1.38, scale: 1.2 },
};

export const PAYTABLE: Record<NormalSymbolId, readonly { min: number; max: number; multiplier: number }[]> = {
  S1: [{ min: 8, max: 9, multiplier: 0.9 }, { min: 10, max: 11, multiplier: 1.8 }, { min: 12, max: Infinity, multiplier: 3.6 }],
  S2: [{ min: 8, max: 9, multiplier: 1.1 }, { min: 10, max: 11, multiplier: 2.2 }, { min: 12, max: Infinity, multiplier: 4.4 }],
  S3: [{ min: 8, max: 9, multiplier: 1.5 }, { min: 10, max: 11, multiplier: 3 }, { min: 12, max: Infinity, multiplier: 6 }],
  S4: [{ min: 8, max: 9, multiplier: 1.9 }, { min: 10, max: 11, multiplier: 3.8 }, { min: 12, max: Infinity, multiplier: 7.5 }],
  S5: [{ min: 8, max: 9, multiplier: 2.8 }, { min: 10, max: 11, multiplier: 5.6 }, { min: 12, max: Infinity, multiplier: 11 }],
  S6: [{ min: 8, max: 9, multiplier: 3.8 }, { min: 10, max: 11, multiplier: 9.4 }, { min: 12, max: Infinity, multiplier: 19 }],
  S7: [{ min: 8, max: 9, multiplier: 5.6 }, { min: 10, max: 11, multiplier: 15 }, { min: 12, max: Infinity, multiplier: 30 }],
  S8: [{ min: 8, max: 9, multiplier: 9.4 }, { min: 10, max: 11, multiplier: 22.5 }, { min: 12, max: Infinity, multiplier: 45 }],
};

// Context-specific special-symbol probabilities. Values are decimals, not percentages.
export const BASE_INITIAL_SCATTER_CHANCE = 0.03;
export const BASE_REFILL_SCATTER_CHANCE = 0.03;
export const BASE_REFILL_CORE_CHANCE = 0.02;
export const BONUS_INITIAL_SCATTER_CHANCE = 0.04;
export const BONUS_REFILL_SCATTER_CHANCE = 0.04;
export const BONUS_INITIAL_CORE_CHANCE = 0.07;
export const BONUS_REFILL_CORE_CHANCE = 0.07;

export const BASE_MULTIPLIER_CORE_CHANCE = BASE_REFILL_CORE_CHANCE;
export const BASE_MULTIPLIER_CORE_WEIGHTS = [
  { value: 2, weight: 20 },
  { value: 3, weight: 25 },
  { value: 5, weight: 15 },
  { value: 10, weight: 10 },
  { value: 15, weight: 8 },
  { value: 20, weight: 5 },
  { value: 25, weight: 6 },
  { value: 50, weight: 5 },
  { value: 100, weight: 4 },
  { value: 250, weight: 1 },
  { value: 500, weight: 0.5 },
  { value: 1000, weight: 0.5 },
] as const;

export const BONUS_CONFIG = {
  base: { 4: 10, 5: 12, 6: 15 },
  retrigger: { 3: 5, 4: 5, 5: 5, 6: 5 },
  multiplierCoreSpawnChance: BONUS_REFILL_CORE_CHANCE,
  multiplierCoreWeights: [
    { value: 2, weight: 20 },
    { value: 3, weight: 25 },
    { value: 5, weight: 15 },
    { value: 10, weight: 10 },
    { value: 15, weight: 8 },
    { value: 20, weight: 5 },
    { value: 25, weight: 6 },
    { value: 50, weight: 5 },
    { value: 100, weight: 4 },
    { value: 250, weight: 1 },
    { value: 500, weight: 0.5 },
    { value: 1000, weight: 0.5 },
  ],
} as const;

export const getSymbolDefinition = (id: SymbolId) => SYMBOLS.find((symbol) => symbol.id === id)!;
export const getPaytableMultiplier = (id: NormalSymbolId, count: number) =>
  PAYTABLE[id].find((tier) => count >= tier.min && count <= tier.max)?.multiplier ?? 0;