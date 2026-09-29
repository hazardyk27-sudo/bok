import {
  MAX_STADIUM_SEATS,
  SPEED_LEVELS,
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "../../../cascade-8/src/idle/config";
import type {
  SpeedLevel,
  StadiumLevel,
  StorageLevel,
} from "../../../cascade-8/src/idle/types";
import { getStorageCapacityMicroTickets } from "./production";
import type { StadiumStorageState } from "./stadiumRepository";

export type StadiumEconomyMutationPatch = Partial<Pick<
  StadiumStorageState,
  | "stadiumLevel"
  | "ownedSeats"
  | "speedLevel"
  | "storageLevel"
  | "storedMicroTickets"
  | "saleRemainderMicrodollars"
>>;

function requireSafeNonNegativeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

function requireStadiumLevel(level: number): StadiumLevel {
  if (!STADIUM_LEVELS.some((entry) => entry.level === level)) {
    throw new Error("INVALID_IDLE_STADIUM_LEVEL");
  }
  return level as StadiumLevel;
}

function requireSpeedLevel(level: number): SpeedLevel {
  if (!SPEED_LEVELS.some((entry) => entry.level === level)) {
    throw new Error("INVALID_IDLE_SPEED_LEVEL");
  }
  return level as SpeedLevel;
}

function requireStorageLevel(level: number): StorageLevel {
  if (!STORAGE_LEVELS.some((entry) => entry.level === level)) {
    throw new Error("INVALID_IDLE_STORAGE_LEVEL");
  }
  return level as StorageLevel;
}

/**
 * Applies an economy mutation only to a state that has already been settled.
 *
 * Progression fields are monotonic. Ticket inventory and sale remainder may
 * move down/up because selling tickets consumes inventory and carries
 * sub-cent value forward.
 */
export function applyStadiumEconomyMutationPatch(
  settledState: StadiumStorageState,
  patch: StadiumEconomyMutationPatch,
): StadiumStorageState {
  const stadiumLevel = requireStadiumLevel(
    patch.stadiumLevel ?? settledState.stadiumLevel,
  );
  const speedLevel = requireSpeedLevel(
    patch.speedLevel ?? settledState.speedLevel,
  );
  const storageLevel = requireStorageLevel(
    patch.storageLevel ?? settledState.storageLevel,
  );
  const ownedSeats = requireSafeNonNegativeInteger(
    patch.ownedSeats ?? settledState.ownedSeats,
    "INVALID_IDLE_SEAT_COUNT",
  );
  const storedMicroTickets = requireSafeNonNegativeInteger(
    patch.storedMicroTickets ?? settledState.storedMicroTickets,
    "INVALID_IDLE_STORED_MICROTICKETS",
  );
  const saleRemainderMicrodollars = requireSafeNonNegativeInteger(
    patch.saleRemainderMicrodollars
      ?? settledState.saleRemainderMicrodollars,
    "INVALID_IDLE_SALE_REMAINDER",
  );

  if (stadiumLevel < settledState.stadiumLevel) {
    throw new Error("IDLE_STADIUM_LEVEL_DOWNGRADE_NOT_ALLOWED");
  }
  if (speedLevel < settledState.speedLevel) {
    throw new Error("IDLE_SPEED_LEVEL_DOWNGRADE_NOT_ALLOWED");
  }
  if (storageLevel < settledState.storageLevel) {
    throw new Error("IDLE_STORAGE_LEVEL_DOWNGRADE_NOT_ALLOWED");
  }
  if (ownedSeats < settledState.ownedSeats) {
    throw new Error("IDLE_SEAT_COUNT_DECREASE_NOT_ALLOWED");
  }

  const stadiumConfig = STADIUM_LEVELS.find(
    (entry) => entry.level === stadiumLevel,
  );
  if (!stadiumConfig) throw new Error("INVALID_IDLE_STADIUM_LEVEL");

  if (
    ownedSeats > stadiumConfig.maxSeats
    || ownedSeats > MAX_STADIUM_SEATS
  ) {
    throw new Error("IDLE_STADIUM_CAPACITY_EXCEEDED");
  }

  const storageCapacityMicroTickets =
    getStorageCapacityMicroTickets(storageLevel);
  if (storedMicroTickets > storageCapacityMicroTickets) {
    throw new Error("IDLE_STORED_TICKETS_EXCEED_CAPACITY");
  }

  return {
    ...settledState,
    stadiumLevel,
    ownedSeats,
    speedLevel,
    storageLevel,
    storedMicroTickets,
    saleRemainderMicrodollars,
  };
}


/**
 * Resolves exactly one canonical Stadium capacity unlock.
 *
 * Seat ownership is deliberately not an input: filling the current capacity
 * is never a prerequisite for unlocking the next Stadium level.
 */
export function resolveNextStadiumUpgrade(
  currentLevel: StadiumLevel,
  balanceCents: number,
) {
  requireSafeNonNegativeInteger(
    balanceCents,
    "INVALID_IDLE_WALLET_BALANCE",
  );

  const targetConfig = STADIUM_LEVELS.find(
    (entry) => entry.level === currentLevel + 1,
  );
  if (!targetConfig) {
    throw new Error("IDLE_STADIUM_MAX_LEVEL");
  }

  if (balanceCents < targetConfig.unlockCostCents) {
    throw new Error("INSUFFICIENT_IDLE_CREDITS");
  }

  return {
    targetStadiumLevel: targetConfig.level,
    maxSeats: targetConfig.maxSeats,
    costCents: targetConfig.unlockCostCents,
    balanceAfterCents:
      balanceCents - targetConfig.unlockCostCents,
  };
}
