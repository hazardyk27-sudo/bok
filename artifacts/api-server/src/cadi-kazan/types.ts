export const CADI_KAZAN_MODES = ["STANDARD", "ADVANCED"] as const;
export type CadiKazanMode = (typeof CADI_KAZAN_MODES)[number];

export const ADVANCED_ALARM_OPTIONS = [1, 3, 5, 7, 10] as const;
export type AdvancedAlarmCount = (typeof ADVANCED_ALARM_OPTIONS)[number];

export const CADI_KAZAN_STATUSES = ["ACTIVE", "CASHED_OUT", "BUST", "COMPLETED"] as const;
export type CadiKazanStatus = (typeof CADI_KAZAN_STATUSES)[number];

export const STANDARD_CASHOUT_MULTIPLIERS_BPS = [120, 160, 240, 480] as const;
export const CADI_KAZAN_MIN_STAKE_CENTS = 100;
export const CADI_KAZAN_MAX_STAKE_CENTS = 10_000;
export const CADI_KAZAN_STANDARD_CELL_COUNT = 5;
export const CADI_KAZAN_ADVANCED_CELL_COUNT = 25;

type AdvancedPayoutTable = {
  alarmCount: AdvancedAlarmCount;
  safeCellCount: number;
  growthBps: number;
  capBps: number;
  multipliersBps: number[];
  calibration: "TEMPORARY_CONSERVATIVE";
};

const ADVANCED_TABLE_INPUTS: Readonly<Record<AdvancedAlarmCount, { growthBps: number; capBps: number }>> = {
  1: { growthBps: 5, capBps: 220 },
  3: { growthBps: 6, capBps: 250 },
  5: { growthBps: 8, capBps: 300 },
  7: { growthBps: 11, capBps: 360 },
  10: { growthBps: 15, capBps: 450 },
};

function createAdvancedPayoutTable(alarmCount: AdvancedAlarmCount): AdvancedPayoutTable {
  const safeCellCount = CADI_KAZAN_ADVANCED_CELL_COUNT - alarmCount;
  const { growthBps, capBps } = ADVANCED_TABLE_INPUTS[alarmCount];
  return {
    alarmCount,
    safeCellCount,
    growthBps,
    capBps,
    multipliersBps: Array.from({ length: safeCellCount }, (_, index) => Math.min(capBps, 100 + growthBps * (index + 1))),
    calibration: "TEMPORARY_CONSERVATIVE",
  };
}

/**
 * Advanced values are deliberately a replaceable calibration table, not a final
 * economy decision. A later simulator can replace this object without changing
 * round, reveal, or settlement code.
 */
export const ADVANCED_PAYOUT_TABLES: Readonly<Record<AdvancedAlarmCount, AdvancedPayoutTable>> = {
  1: createAdvancedPayoutTable(1),
  3: createAdvancedPayoutTable(3),
  5: createAdvancedPayoutTable(5),
  7: createAdvancedPayoutTable(7),
  10: createAdvancedPayoutTable(10),
};

export function getCellCount(mode: CadiKazanMode) {
  return mode === "STANDARD" ? CADI_KAZAN_STANDARD_CELL_COUNT : CADI_KAZAN_ADVANCED_CELL_COUNT;
}

export function getSafeCellCount(mode: CadiKazanMode, alarmCount: number) {
  return getCellCount(mode) - alarmCount;
}

export function getCashoutMultiplierBps(mode: CadiKazanMode, alarmCount: number, revealedSafeCount: number) {
  if (revealedSafeCount <= 0) return 0;
  if (mode === "STANDARD") return STANDARD_CASHOUT_MULTIPLIERS_BPS[revealedSafeCount - 1] ?? 0;
  if (!ADVANCED_ALARM_OPTIONS.includes(alarmCount as AdvancedAlarmCount)) return 0;
  return ADVANCED_PAYOUT_TABLES[alarmCount as AdvancedAlarmCount].multipliersBps[revealedSafeCount - 1] ?? 0;
}

export type CadiKazanRoundSnapshot = {
  id: string;
  mode: CadiKazanMode;
  alarmCount: number;
  cellCount: number;
  stakeCents: number;
  revealedCells: number[];
  revealedSafeCount: number;
  currentMultiplierBps: number;
  status: CadiKazanStatus;
  payoutCents: number;
  revealedBombCells: number[];
  createdAt: string;
  updatedAt: string;
};

export type CadiKazanState = {
  wallet: { sessionId: string; balanceCents: number };
  round: CadiKazanRoundSnapshot | null;
};