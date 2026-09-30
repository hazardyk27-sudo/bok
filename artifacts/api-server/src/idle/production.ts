import {
  SPEED_LEVELS,
  STORAGE_LEVELS,
  TICKET_MICRO_UNITS,
} from "../../../cascade-8/src/idle/config";
import type {
  SpeedLevel,
  StadiumProductionStatus,
  StorageLevel,
} from "../../../cascade-8/src/idle/types";

export const MILLISECONDS_PER_HOUR = 60 * 60 * 1_000;

function requireSafeNonNegativeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

function bigintToSafeNumber(value: bigint, errorCode: string) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(errorCode);
  }
  return Number(value);
}

function getSpeedLevel(level: SpeedLevel) {
  const config = SPEED_LEVELS.find((entry) => entry.level === level);
  if (!config) throw new Error("INVALID_IDLE_SPEED_LEVEL");
  return config;
}

function getStorageLevel(level: StorageLevel) {
  const config = STORAGE_LEVELS.find((entry) => entry.level === level);
  if (!config) throw new Error("INVALID_IDLE_STORAGE_LEVEL");
  return config;
}

/**
 * Exact production rate at the current seat count and Speed level.
 *
 * The returned unit is microtickets/hour:
 *   1 ticket = 1,000,000 microtickets.
 */
export function getTicketProductionRateMicroTicketsPerHour(
  ownedSeats: number,
  speedLevel: SpeedLevel,
) {
  requireSafeNonNegativeInteger(ownedSeats, "INVALID_IDLE_SEAT_COUNT");
  const speed = getSpeedLevel(speedLevel);

  return bigintToSafeNumber(
    BigInt(ownedSeats) * BigInt(speed.microTicketsPerSeatPerHour),
    "IDLE_PRODUCTION_RATE_OVERFLOW",
  );
}

/**
 * Exact Storage capacity in microtickets.
 */
export function getStorageCapacityMicroTickets(storageLevel: StorageLevel) {
  const storage = getStorageLevel(storageLevel);
  return bigintToSafeNumber(
    BigInt(storage.capacityTickets) * BigInt(TICKET_MICRO_UNITS),
    "IDLE_STORAGE_CAPACITY_OVERFLOW",
  );
}

function calculateProducedMicroTicketsBigInt(
  ownedSeats: number,
  speedLevel: SpeedLevel,
  elapsedMs: number,
) {
  requireSafeNonNegativeInteger(elapsedMs, "INVALID_IDLE_PRODUCTION_ELAPSED_MS");

  const rate = getTicketProductionRateMicroTicketsPerHour(
    ownedSeats,
    speedLevel,
  );
  if (rate === 0 || elapsedMs === 0) return 0n;

  return BigInt(rate)
    * BigInt(elapsedMs)
    / BigInt(MILLISECONDS_PER_HOUR);
}

/**
 * Calculates raw ticket production for an elapsed interval without applying
 * Storage capacity. Integer division floors only the sub-microticket fraction,
 * so frequent checkpoints do not create floating-point drift.
 *
 * The production projection below keeps this value as bigint until after the
 * Storage cap is applied, allowing arbitrarily long offline intervals without
 * inventing an offline-time cap.
 */
export function calculateProducedMicroTickets(
  ownedSeats: number,
  speedLevel: SpeedLevel,
  elapsedMs: number,
) {
  return bigintToSafeNumber(
    calculateProducedMicroTicketsBigInt(ownedSeats, speedLevel, elapsedMs),
    "IDLE_PRODUCTION_AMOUNT_OVERFLOW",
  );
}

export type StadiumTicketProductionProjection = {
  productionRateMicroTicketsPerHour: number;
  storageCapacityMicroTickets: number;
  creditedMicroTickets: number;
  liveStoredMicroTickets: number;
  remainingStorageMicroTickets: number;
  isStorageFull: boolean;
  productionStatus: StadiumProductionStatus;
};

/**
 * Projects the Stadium inventory forward using only the accepted canonical
 * formula:
 *
 *   tickets/hour = owned seats × current per-seat Speed
 *
 * Production is capped by the current Storage level. Once Storage is full,
 * further elapsed time produces no additional inventory.
 */
export function projectStadiumTicketProduction(input: {
  ownedSeats: number;
  speedLevel: SpeedLevel;
  storageLevel: StorageLevel;
  storedMicroTickets: number;
  elapsedMs: number;
}): StadiumTicketProductionProjection {
  requireSafeNonNegativeInteger(
    input.storedMicroTickets,
    "INVALID_IDLE_STORED_MICROTICKETS",
  );

  const productionRateMicroTicketsPerHour =
    getTicketProductionRateMicroTicketsPerHour(
      input.ownedSeats,
      input.speedLevel,
    );
  const storageCapacityMicroTickets =
    getStorageCapacityMicroTickets(input.storageLevel);

  if (input.storedMicroTickets > storageCapacityMicroTickets) {
    throw new Error("IDLE_STORED_TICKETS_EXCEED_CAPACITY");
  }

  const remainingBeforeProduction =
    storageCapacityMicroTickets - input.storedMicroTickets;
  const rawProducedMicroTickets = calculateProducedMicroTicketsBigInt(
    input.ownedSeats,
    input.speedLevel,
    input.elapsedMs,
  );
  const creditedMicroTickets = bigintToSafeNumber(
    rawProducedMicroTickets < BigInt(remainingBeforeProduction)
      ? rawProducedMicroTickets
      : BigInt(remainingBeforeProduction),
    "IDLE_CREDITED_PRODUCTION_OVERFLOW",
  );
  const liveStoredMicroTickets =
    input.storedMicroTickets + creditedMicroTickets;
  const remainingStorageMicroTickets =
    storageCapacityMicroTickets - liveStoredMicroTickets;
  const isStorageFull = remainingStorageMicroTickets === 0;

  const productionStatus: StadiumProductionStatus = isStorageFull
    ? "STORAGE_FULL"
    : input.ownedSeats === 0
      ? "NO_SEATS"
      : "PRODUCING";

  return {
    productionRateMicroTicketsPerHour,
    storageCapacityMicroTickets,
    creditedMicroTickets,
    liveStoredMicroTickets,
    remainingStorageMicroTickets,
    isStorageFull,
    productionStatus,
  };
}
