import { pool, type PoolClient } from "@workspace/db";
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
import {
  checkpointStadiumProduction,
  type StadiumProductionProjection,
  type StadiumStorageState,
} from "./stadiumRepository";

export type StadiumEconomyMutationPatch = Partial<Pick<
  StadiumStorageState,
  | "stadiumLevel"
  | "ownedSeats"
  | "speedLevel"
  | "storageLevel"
  | "storedMicroTickets"
  | "saleRemainderMicrodollars"
>>;

export type CheckpointedStadiumMutationContext = {
  client: PoolClient;
  sessionId: string;
  serverNow: Date;
  /** State after all elapsed production under the OLD economy parameters. */
  settledState: StadiumStorageState;
  /** Projection used to settle the old state before the mutation callback. */
  settlement: StadiumProductionProjection;
};

export type CheckpointedStadiumMutationDecision<T> = {
  patch: StadiumEconomyMutationPatch;
  result: T;
};

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
 * Persists the already-validated post-mutation Stadium state.
 *
 * production_checkpoint_at is deliberately NOT changed here. The checkpoint
 * was written first by checkpointStadiumProduction(...), under the old
 * seat/Speed/Storage values. This prevents a later mutation from being applied
 * retroactively to elapsed time.
 */
export async function persistStadiumEconomyMutation(
  client: PoolClient,
  settledState: StadiumStorageState,
  patch: StadiumEconomyMutationPatch,
  updatedAt: Date,
) {
  const nextState = applyStadiumEconomyMutationPatch(
    settledState,
    patch,
  );

  await client.query(
    `UPDATE idle_stadium_states
        SET stadium_level = $2,
            owned_seats = $3,
            speed_level = $4,
            storage_level = $5,
            stored_microtickets = $6,
            sale_remainder_microdollars = $7,
            updated_at = $8
      WHERE session_id = $1`,
    [
      settledState.sessionId,
      nextState.stadiumLevel,
      nextState.ownedSeats,
      nextState.speedLevel,
      nextState.storageLevel,
      nextState.storedMicroTickets,
      nextState.saleRemainderMicrodollars,
      updatedAt,
    ],
  );

  return {
    ...nextState,
    updatedAt,
  };
}

/**
 * Canonical transaction boundary for every Stadium economy mutation.
 *
 * Order is intentionally fixed:
 *   1. BEGIN
 *   2. lock Stadium row + settle elapsed production with OLD values
 *   3. run action-specific decision/work
 *   4. persist the returned Stadium patch
 *   5. COMMIT
 *
 * Later seat purchases, Stadium/Speed/Storage upgrades, and ticket sales must
 * use this boundary (or call checkpointStadiumProduction inside their own
 * equivalent transaction before mutating economy parameters).
 */
export async function runCheckpointedStadiumMutation<T>(
  sessionId: string,
  serverNow: Date,
  decide: (
    context: CheckpointedStadiumMutationContext,
  ) => Promise<CheckpointedStadiumMutationDecision<T>>,
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const checkpoint = await checkpointStadiumProduction(
      client,
      sessionId,
      serverNow,
    );

    const decision = await decide({
      client,
      sessionId,
      serverNow,
      settledState: checkpoint.state,
      settlement: checkpoint.projection,
    });

    const state = await persistStadiumEconomyMutation(
      client,
      checkpoint.state,
      decision.patch,
      serverNow,
    );

    await client.query("COMMIT");

    return {
      result: decision.result,
      state,
      settlement: checkpoint.projection,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
