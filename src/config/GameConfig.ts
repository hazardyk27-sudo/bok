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
  weight: number;
};

export const SYMBOLS: readonly SymbolDefinition[] = [
  { id: "S1", name: "Tide Drop", icon: "✦", color: 0x54b7ff, colorHex: "#54b7ff", weight: 17 },
  { id: "S2", name: "Verdant Shard", icon: "❖", color: 0x65d7a1, colorHex: "#65d7a1", weight: 15.5 },
  { id: "S3", name: "Amber Sun", icon: "✹", color: 0xffc45e, colorHex: "#ffc45e", weight: 14 },
  { id: "S4", name: "Violet Moon", icon: "☾", color: 0xb593ff, colorHex: "#b593ff", weight: 12.5 },
  { id: "S5", name: "Silver Star", icon: "★", color: 0xc9d7e9, colorHex: "#c9d7e9", weight: 11.5 },
  { id: "S6", name: "Ruby Core", icon: "◆", color: 0xff667e, colorHex: "#ff667e", weight: 10 },
  { id: "S7", name: "Solar Crown", icon: "♛", color: 0xffd86e, colorHex: "#ffd86e", weight: 9 },
  { id: "S8", name: "Prism Heart", icon: "⬢", color: 0xd79bff, colorHex: "#d79bff", weight: 8 },
  { id: "SCATTER", name: "Astral Gate", icon: "◉", color: 0x79e4ff, colorHex: "#79e4ff", weight: 2.5 },
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