import {
  SPEED_LEVELS,
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "../../../cascade-8/src/idle/config";
import { quoteSeatPurchase } from "./seatPricing";

export const FREE_STARTING_STADIUM_SEATS = 1_000;

export type IdleInvestmentProgress = {
  stadiumLevel: number;
  ownedSeats: number;
  speedLevel: number;
  storageLevel: number;
};

export type IdleInvestmentBaselineOptions = {
  freeStartingSeats?: number;
};

export type RetainedStadiumInvestmentReceipt = {
  actionType: string;
  purchasedSeats: number;
  costCents: number;
};

const STADIUM_INVESTMENT_ACTIONS = new Set([
  "SEAT_PURCHASE",
  "STADIUM_UPGRADE",
  "SPEED_UPGRADE",
  "STORAGE_UPGRADE",
]);

function requireSafeNonNegativeInteger(
  value: number,
  errorCode: string,
) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

function requireProgressLevel(
  level: number,
  validLevels: readonly { level: number }[],
  errorCode: string,
) {
  if (!validLevels.some((entry) => entry.level === level)) {
    throw new Error(errorCode);
  }
  return level;
}

/**
 * One-time baseline calculator for players that already had Stadium progress
 * before the permanent investment ledger existed.
 *
 * Canonical/new Stadium state starts with 1,000 free seats. The pre-fix
 * backend, however, created legacy Stadium rows with zero seats, so those
 * players actually paid for every seat they owned. Runtime migration passes
 * freeStartingSeats=0 for those legacy rows so their paid first 1,000 seats
 * are not silently erased from capital.
 *
 * New spending must NOT be reconstructed from progression. It is written to
 * idle_investment_ledger at the exact transaction cost instead. This function
 * remains the deterministic migration baseline for pre-ledger progress.
 */
export function calculateInvestedCapitalCents(
  progress: IdleInvestmentProgress,
  options: IdleInvestmentBaselineOptions = {},
) {
  const stadiumLevel = requireProgressLevel(
    progress.stadiumLevel,
    STADIUM_LEVELS,
    "INVALID_IDLE_LEADERBOARD_STADIUM_LEVEL",
  );
  const speedLevel = requireProgressLevel(
    progress.speedLevel,
    SPEED_LEVELS,
    "INVALID_IDLE_LEADERBOARD_SPEED_LEVEL",
  );
  const storageLevel = requireProgressLevel(
    progress.storageLevel,
    STORAGE_LEVELS,
    "INVALID_IDLE_LEADERBOARD_STORAGE_LEVEL",
  );
  const ownedSeats = requireSafeNonNegativeInteger(
    progress.ownedSeats,
    "INVALID_IDLE_LEADERBOARD_SEAT_COUNT",
  );
  const freeStartingSeats = requireSafeNonNegativeInteger(
    options.freeStartingSeats ?? FREE_STARTING_STADIUM_SEATS,
    "INVALID_IDLE_LEADERBOARD_FREE_SEAT_COUNT",
  );

  const stadiumCapitalCents = STADIUM_LEVELS.reduce(
    (sum, entry) =>
      entry.level > 1 && entry.level <= stadiumLevel
        ? sum + entry.unlockCostCents
        : sum,
    0,
  );

  const speedCapitalCents = SPEED_LEVELS.reduce(
    (sum, entry) =>
      entry.level > 1 && entry.level <= speedLevel
        ? sum + entry.upgradeCostCents
        : sum,
    0,
  );

  const storageCapitalCents = STORAGE_LEVELS.reduce(
    (sum, entry) =>
      entry.level > 1 && entry.level <= storageLevel
        ? sum + entry.upgradeCostCents
        : sum,
    0,
  );

  const paidSeatCount = Math.max(0, ownedSeats - freeStartingSeats);
  const seatCapitalCents = paidSeatCount > 0
    ? quoteSeatPurchase(
      freeStartingSeats,
      paidSeatCount,
    ).totalCostCents
    : 0;

  return requireSafeNonNegativeInteger(
    stadiumCapitalCents
      + speedCapitalCents
      + storageCapitalCents
      + seatCapitalCents,
    "INVALID_IDLE_LEADERBOARD_CAPITAL",
  );
}

/**
 * Improves the one-time legacy Stadium baseline with every still-retained
 * action receipt. The retained part uses the exact historical cost_cents,
 * while only progression older than the receipt-retention window is rebuilt
 * from canonical progression. This matters when seat/economy prices changed
 * before the permanent investment ledger existed.
 */
export function calculateLegacyStadiumBaselineCents(
  currentProgress: IdleInvestmentProgress,
  receipts: RetainedStadiumInvestmentReceipt[],
) {
  let retainedPurchasedSeats = 0;
  let retainedStadiumUpgrades = 0;
  let retainedSpeedUpgrades = 0;
  let retainedStorageUpgrades = 0;
  let exactRetainedCostCents = 0;

  for (const receipt of receipts) {
    if (!STADIUM_INVESTMENT_ACTIONS.has(receipt.actionType)) continue;

    const costCents = requireSafeNonNegativeInteger(
      receipt.costCents,
      "INVALID_IDLE_RETAINED_INVESTMENT_COST",
    );
    if (costCents === 0) continue;

    exactRetainedCostCents = requireSafeNonNegativeInteger(
      exactRetainedCostCents + costCents,
      "INVALID_IDLE_RETAINED_INVESTMENT_TOTAL",
    );

    if (receipt.actionType === "SEAT_PURCHASE") {
      retainedPurchasedSeats += requireSafeNonNegativeInteger(
        receipt.purchasedSeats,
        "INVALID_IDLE_RETAINED_SEAT_COUNT",
      );
    } else if (receipt.actionType === "STADIUM_UPGRADE") {
      retainedStadiumUpgrades += 1;
    } else if (receipt.actionType === "SPEED_UPGRADE") {
      retainedSpeedUpgrades += 1;
    } else if (receipt.actionType === "STORAGE_UPGRADE") {
      retainedStorageUpgrades += 1;
    }
  }

  const earlierProgress: IdleInvestmentProgress = {
    stadiumLevel: currentProgress.stadiumLevel - retainedStadiumUpgrades,
    ownedSeats: currentProgress.ownedSeats - retainedPurchasedSeats,
    speedLevel: currentProgress.speedLevel - retainedSpeedUpgrades,
    storageLevel: currentProgress.storageLevel - retainedStorageUpgrades,
  };

  if (
    earlierProgress.stadiumLevel < 1
    || earlierProgress.ownedSeats < 0
    || earlierProgress.speedLevel < 1
    || earlierProgress.storageLevel < 1
  ) {
    throw new Error("INVALID_IDLE_RETAINED_INVESTMENT_HISTORY");
  }

  const reconstructedOlderCapitalCents = calculateInvestedCapitalCents(
    earlierProgress,
    { freeStartingSeats: 0 },
  );

  return requireSafeNonNegativeInteger(
    reconstructedOlderCapitalCents + exactRetainedCostCents,
    "INVALID_IDLE_LEGACY_STADIUM_CAPITAL",
  );
}
