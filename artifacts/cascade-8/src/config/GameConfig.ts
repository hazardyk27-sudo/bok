export const BOARD_COLUMNS = 6;
export const BOARD_ROWS = 5;
export const CELL_COUNT = BOARD_COLUMNS * BOARD_ROWS;
export const STARTING_BALANCE_CENTS = 1_000_000;
export const MAX_WIN_MULTIPLIER = 5000;

export const BETS_CENTS = [20, 50, 100, 200, 500, 1000, 2000, 5000] as const;

export const ANIMATION = {
  initialDrop: 760,
  winHighlight: 220,
  burst: 242,
  refill: 540,
  freeSpinPause: 280,
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
  logoPath?: string;
  weight: number;
};

export const SYMBOLS: readonly SymbolDefinition[] = [
  { id: "S1", name: "Real Madrid", icon: "RM", color: 0xeaf1ff, colorHex: "#eaf1ff", accentColor: 0xd4af37, logoPath: "team-logos/real-madrid.png", weight: 17 },
  { id: "S2", name: "Barcelona", icon: "BAR", color: 0x7030a0, colorHex: "#b36bef", accentColor: 0xa50044, logoPath: "team-logos/barcelona.png", weight: 15.5 },
  { id: "S3", name: "Chelsea", icon: "CHE", color: 0x0879e8, colorHex: "#3aa5ff", accentColor: 0x9ed5ff, logoPath: "team-logos/chelsea.png", weight: 14 },
  { id: "S4", name: "Roma", icon: "ROM", color: 0x8e3b12, colorHex: "#d8752e", accentColor: 0xf0b44d, logoPath: "team-logos/roma.png", weight: 12.5 },
  { id: "S5", name: "Liverpool", icon: "LIV", color: 0xdc1638, colorHex: "#ff3c58", accentColor: 0xffd8d8, logoPath: "team-logos/liverpool.png", weight: 11.5 },
  { id: "S6", name: "PSG", icon: "PSG", color: 0x172c62, colorHex: "#617fc8", accentColor: 0xef3340, logoPath: "team-logos/psg.png", weight: 10 },
  { id: "S7", name: "Bayern", icon: "BAY", color: 0xe50059, colorHex: "#ff5b9a", accentColor: 0xf1f1f1, logoPath: "team-logos/bayern.png", weight: 9 },
  { id: "S8", name: "Galatasaray", icon: "GS", color: 0xf4bd00, colorHex: "#ffd31c", accentColor: 0xc8102e, logoPath: "team-logos/galatasaray.png", weight: 8 },
  { id: "SCATTER", name: "Astral Gate", icon: "◉", color: 0x00e5ff, colorHex: "#00e5ff", accentColor: 0xd8fbff, weight: 2.5 },
];

export const NORMAL_SYMBOLS = SYMBOLS.filter((symbol) => symbol.id !== "SCATTER") as readonly SymbolDefinition[];

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

export const BONUS_CONFIG = {
  base: { 4: 10, 5: 12, 6: 15 },
  retrigger: { 3: 5, 4: 8, 5: 12, 6: 15 },
  crystalCountWeights: [
    { value: 0, weight: 95 },
    { value: 1, weight: 4 },
    { value: 2, weight: 1 },
    { value: 3, weight: 0 },
  ],
  crystalMultiplierWeights: [
    { value: 2, weight: 40 },
    { value: 3, weight: 25 },
    { value: 5, weight: 15 },
    { value: 10, weight: 10 },
    { value: 25, weight: 6 },
    { value: 50, weight: 3 },
    { value: 100, weight: 1 },
  ],
} as const;

export const getSymbolDefinition = (id: SymbolId) => SYMBOLS.find((symbol) => symbol.id === id)!;
export const getPaytableMultiplier = (id: NormalSymbolId, count: number) =>
  PAYTABLE[id].find((tier) => count >= tier.min && count <= tier.max)?.multiplier ?? 0;