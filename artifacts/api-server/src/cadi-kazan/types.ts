export const CADI_KAZAN_MODES = ["STANDARD", "ADVANCED"] as const;
export type CadiKazanMode = (typeof CADI_KAZAN_MODES)[number];

export const ADVANCED_ALARM_OPTIONS = [1, 3, 5, 7, 10] as const;
export type AdvancedAlarmCount = (typeof ADVANCED_ALARM_OPTIONS)[number];

export const CADI_KAZAN_STATUSES = ["ACTIVE", "CASHED_OUT", "BUST", "COMPLETED"] as const;
export type CadiKazanStatus = (typeof CADI_KAZAN_STATUSES)[number];

export const STANDARD_CASHOUT_MULTIPLIERS_BPS = [120, 160, 240, 480] as const;
export const CADI_KAZAN_MIN_STAKE_CENTS = 100;
export const CADI_KAZAN_STANDARD_CELL_COUNT = 5;
export const CADI_KAZAN_ADVANCED_CELL_COUNT = 25;
export const ADVANCED_PAYOUT_TABLE_VERSION = "advanced-final-v1";
export const ADVANCED_TARGET_RTP_BPS = 9_600;
export const ADVANCED_MAX_MULTIPLIER_BPS = 100_000;
const POSTGRES_INT_MAX_CENTS = 2_147_483_647;

type AdvancedPayoutTable = {
  alarmCount: AdvancedAlarmCount;
  safeCellCount: number;
  targetRtpBps: number;
  maxMultiplierBps: number;
  multipliersBps: number[];
  calibration: "FINAL_DATA_DRIVEN";
  version: string;
};

function survivalProbability(safeCellCount: number, revealedSafeCount: number) {
  let probability = 1;
  for (let index = 0; index < revealedSafeCount; index += 1) {
    probability *= (safeCellCount - index) / (CADI_KAZAN_ADVANCED_CELL_COUNT - index);
  }
  return probability;
}

function createAdvancedPayoutTable(alarmCount: AdvancedAlarmCount): AdvancedPayoutTable {
  const safeCellCount = CADI_KAZAN_ADVANCED_CELL_COUNT - alarmCount;
  return {
    alarmCount,
    safeCellCount,
    targetRtpBps: ADVANCED_TARGET_RTP_BPS,
    maxMultiplierBps: ADVANCED_MAX_MULTIPLIER_BPS,
    multipliersBps: Array.from({ length: safeCellCount }, (_, index) => Math.min(
      ADVANCED_MAX_MULTIPLIER_BPS,
      Math.round((ADVANCED_TARGET_RTP_BPS / 100) / survivalProbability(safeCellCount, index + 1)),
    )),
    calibration: "FINAL_DATA_DRIVEN",
    version: ADVANCED_PAYOUT_TABLE_VERSION,
  };
}

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

export function getMaxSafeStakeCents(mode: CadiKazanMode, alarmCount: number) {
  const maxMultiplierBps = mode === "STANDARD"
    ? Math.max(...STANDARD_CASHOUT_MULTIPLIERS_BPS)
    : ADVANCED_ALARM_OPTIONS.includes(alarmCount as AdvancedAlarmCount)
      ? Math.max(...ADVANCED_PAYOUT_TABLES[alarmCount as AdvancedAlarmCount].multipliersBps)
      : ADVANCED_MAX_MULTIPLIER_BPS;
  return Math.floor((POSTGRES_INT_MAX_CENTS * 100) / Math.max(100, maxMultiplierBps));
}

export function getCashoutPayoutCents(stakeCents: number, multiplierBps: number) {
  return Math.floor((stakeCents * multiplierBps) / 100);
}

export function getVisibleBombCells(status: CadiKazanStatus, bombIndices: number[]) {
  return status === "ACTIVE" ? [] : [...bombIndices];
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
  currentCashoutCents: number;
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