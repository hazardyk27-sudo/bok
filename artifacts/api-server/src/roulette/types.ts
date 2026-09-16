export const ROULETTE_PHASES = [
  "OPEN",
  "LAST_CALL",
  "LOCKED",
  "SPINNING",
  "RESULT",
  "MULTIPLIER_REVEAL",
  "SETTLING",
  "INTERMISSION",
] as const;

export type RoulettePhase = (typeof ROULETTE_PHASES)[number];

export const MULTIPLIER_VALUES = [50, 100, 150, 200, 250, 300, 400, 500] as const;
export type RouletteMultiplier = (typeof MULTIPLIER_VALUES)[number];

export const ROULETTE_BET_TYPES = [
  "STRAIGHT",
  "SPLIT",
  "STREET",
  "CORNER",
  "SIX_LINE",
  "DOZEN",
  "COLUMN",
  "RED",
  "BLACK",
  "ODD",
  "EVEN",
  "LOW",
  "HIGH",
] as const;

export type RouletteBetType = (typeof ROULETTE_BET_TYPES)[number];

export type RouletteBetInput = {
  type: RouletteBetType;
  numbers: number[];
  stakeCents: number;
  label?: string;
};

export const ROULETTE_PAYOUT_UNITS: Record<RouletteBetType, number> = {
  STRAIGHT: 35,
  SPLIT: 17,
  STREET: 11,
  CORNER: 8,
  SIX_LINE: 5,
  DOZEN: 2,
  COLUMN: 2,
  RED: 1,
  BLACK: 1,
  ODD: 1,
  EVEN: 1,
  LOW: 1,
  HIGH: 1,
};

export const PHASE_DURATIONS_MS: Record<RoulettePhase, number> = {
  OPEN: 22_000,
  LAST_CALL: 8_000,
  LOCKED: 3_000,
  SPINNING: 6_000,
  RESULT: 4_000,
  MULTIPLIER_REVEAL: 10_000,
  SETTLING: 3_000,
  INTERMISSION: 4_000,
};

export const INITIAL_ROULETTE_BALANCE_CENTS = 100_000;
export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 10_000;

export type RouletteRoundRecord = {
  id: string;
  sequence: number;
  phase: RoulettePhase;
  startsAt: Date;
  openUntil: Date;
  lastCallUntil: Date;
  lockedUntil: Date;
  spinningUntil: Date;
  resultUntil: Date;
  revealUntil: Date;
  settlingUntil: Date;
  intermissionUntil: Date;
  winningNumber: number | null;
  luckyNumbers: number[];
  multipliers: RouletteMultiplier[];
  commitmentHash: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RouletteSnapshot = {
  serverTime: string;
  coordinator: "leader" | "standby";
  wallet: { sessionId: string; balanceCents: number; lastPayoutCents: number };
  round: {
    id: string;
    sequence: number;
    phase: RoulettePhase;
    phaseStartedAt: string;
    nextTransitionAt: string;
    countdownMs: number;
    commitmentHash: string;
    winningNumber: number | null;
    luckyNumbers: number[];
    revealedMultipliers: RouletteMultiplier[];
    multipliersTotal: number;
    version: number;
  };
};

export type RouletteEvent =
  | { type: "snapshot"; snapshot: RouletteSnapshot }
  | { type: "phase"; snapshot: RouletteSnapshot; eventId: string }
  | { type: "reveal"; snapshot: RouletteSnapshot; eventId: string }
  | { type: "settled"; snapshot: RouletteSnapshot; eventId: string }
  | { type: "tick"; snapshot: RouletteSnapshot };