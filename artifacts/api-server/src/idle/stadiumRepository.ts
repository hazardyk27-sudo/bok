import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import {
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "../../../cascade-8/src/idle/config";
import type {
  IdleStadiumServerState,
  SpeedLevel,
  StadiumLevel,
  StorageLevel,
} from "../../../cascade-8/src/idle/types";
import { projectStadiumTicketProduction } from "./production";
import { MARKET_MICRODOLLARS_PER_CENT } from "./fixedPoint";

type StadiumStateRow = {
  id: string;
  session_id: string;
  stadium_level: number;
  owned_seats: number;
  speed_level: number;
  storage_level: number;
  stored_microtickets: number;
  sale_remainder_microdollars: number;
  production_checkpoint_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type StadiumStorageState = {
  id: string;
  sessionId: string;
  stadiumLevel: StadiumLevel;
  ownedSeats: number;
  speedLevel: SpeedLevel;
  storageLevel: StorageLevel;
  storedMicroTickets: number;
  saleRemainderMicrodollars: number;
  productionCheckpointAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type StadiumProductionProjection = {
  state: StadiumStorageState;
  serverNow: Date;
  elapsedMs: number;
  productionRateMicroTicketsPerHour: number;
  storageCapacityMicroTickets: number;
  creditedMicroTickets: number;
  liveStoredMicroTickets: number;
  remainingStorageMicroTickets: number;
  isStorageFull: boolean;
  productionStatus: IdleStadiumServerState["productionStatus"];
};

function requireStadiumLevel(level: number): StadiumLevel {
  if (!STADIUM_LEVELS.some((entry) => entry.level === level)) {
    throw new Error("INVALID_IDLE_STADIUM_LEVEL");
  }
  return level as StadiumLevel;
}

function requireSpeedLevel(level: number): SpeedLevel {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
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

function requireSafeNonNegativeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

function toStorageState(row: StadiumStateRow): StadiumStorageState {
  const saleRemainderMicrodollars =
    requireSafeNonNegativeInteger(
      Number(row.sale_remainder_microdollars),
      "INVALID_IDLE_SALE_REMAINDER",
    );

  if (
    saleRemainderMicrodollars >=
    MARKET_MICRODOLLARS_PER_CENT
  ) {
    throw new Error("INVALID_IDLE_SALE_REMAINDER");
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    stadiumLevel: requireStadiumLevel(Number(row.stadium_level)),
    ownedSeats: requireSafeNonNegativeInteger(
      Number(row.owned_seats),
      "INVALID_IDLE_SEAT_COUNT",
    ),
    speedLevel: requireSpeedLevel(Number(row.speed_level)),
    storageLevel: requireStorageLevel(Number(row.storage_level)),
    storedMicroTickets: requireSafeNonNegativeInteger(
      Number(row.stored_microtickets),
      "INVALID_IDLE_STORED_MICROTICKETS",
    ),
    saleRemainderMicrodollars,
    productionCheckpointAt: row.production_checkpoint_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertMissingStadiumState(
  client: PoolClient,
  sessionId: string,
  checkpointAt: Date,
) {
  await client.query(
    `INSERT INTO idle_stadium_states
       (id, session_id, stadium_level, owned_seats, speed_level, storage_level,
        stored_microtickets, sale_remainder_microdollars,
        production_checkpoint_at, created_at, updated_at)
     VALUES ($1, $2, 1, 0, 1, 1, 0, 0, $3, $3, $3)
     ON CONFLICT (session_id) DO NOTHING`,
    [randomUUID(), sessionId, checkpointAt],
  );
}

async function loadStadiumState(
  client: PoolClient,
  sessionId: string,
  forUpdate = false,
) {
  const result = await client.query<StadiumStateRow>(
    `SELECT id, session_id, stadium_level, owned_seats, speed_level,
            storage_level, stored_microtickets, sale_remainder_microdollars,
            production_checkpoint_at, created_at, updated_at
       FROM idle_stadium_states
      WHERE session_id = $1
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [sessionId],
  );

  const row = result.rows[0];
  if (!row) throw new Error("IDLE_STADIUM_STATE_MISSING");
  return toStorageState(row);
}

export function projectPersistedStadiumState(
  state: StadiumStorageState,
  serverNow = new Date(),
): StadiumProductionProjection {
  const elapsedMs = Math.max(
    0,
    Math.floor(
      serverNow.getTime() - state.productionCheckpointAt.getTime(),
    ),
  );

  const production = projectStadiumTicketProduction({
    ownedSeats: state.ownedSeats,
    speedLevel: state.speedLevel,
    storageLevel: state.storageLevel,
    storedMicroTickets: state.storedMicroTickets,
    elapsedMs,
  });

  return {
    state,
    serverNow,
    elapsedMs,
    ...production,
  };
}

export function stadiumProjectionToServerState(
  projection: StadiumProductionProjection,
): IdleStadiumServerState {
  const stadiumConfig = STADIUM_LEVELS.find(
    (entry) => entry.level === projection.state.stadiumLevel,
  );
  const storageConfig = STORAGE_LEVELS.find(
    (entry) => entry.level === projection.state.storageLevel,
  );

  if (!stadiumConfig) throw new Error("INVALID_IDLE_STADIUM_LEVEL");
  if (!storageConfig) throw new Error("INVALID_IDLE_STORAGE_LEVEL");

  return {
    stadiumLevel: projection.state.stadiumLevel,
    ownedSeats: projection.state.ownedSeats,
    maxSeatCapacity: stadiumConfig.maxSeats,
    speedLevel: projection.state.speedLevel,
    storageLevel: projection.state.storageLevel,
    storedMicroTickets: projection.liveStoredMicroTickets,
    storageCapacityTickets: storageConfig.capacityTickets,
    remainingStorageMicroTickets: projection.remainingStorageMicroTickets,
    productionRateMicroTicketsPerHour:
      projection.productionRateMicroTicketsPerHour,
    isStorageFull: projection.isStorageFull,
    productionStatus: projection.productionStatus,
    // The returned inventory has already been projected through serverNow.
    // Never expose a baseline earlier than the persisted checkpoint, otherwise
    // a client with a backwards/test clock could count time twice.
    productionCheckpointAt: new Date(Math.max(
      projection.serverNow.getTime(),
      projection.state.productionCheckpointAt.getTime(),
    )).toISOString(),
  };
}

/**
 * Ensures the canonical Stadium row exists and returns the persisted state.
 *
 * New players start at Stadium Lv1, 0 owned seats, Speed Lv1, Storage Lv1,
 * zero tickets, and a checkpoint at the server time used for creation.
 */
export async function ensureStadiumState(
  client: PoolClient,
  sessionId: string,
  serverNow = new Date(),
  forUpdate = false,
) {
  await insertMissingStadiumState(client, sessionId, serverNow);
  return loadStadiumState(client, sessionId, forUpdate);
}

/**
 * Checkpoints all elapsed online/offline production inside the caller's SQL
 * transaction. Upgrade/purchase/sale actions will reuse this function before
 * mutating any economy parameter so new values can never apply retroactively.
 */
export async function checkpointStadiumProduction(
  client: PoolClient,
  sessionId: string,
  serverNow = new Date(),
) {
  const state = await ensureStadiumState(
    client,
    sessionId,
    serverNow,
    true,
  );
  const projection = projectPersistedStadiumState(state, serverNow);

  // Never move a checkpoint backwards if a supplied/test clock is behind the
  // persisted timestamp. This prevents the same interval being produced twice.
  const checkpointAt =
    serverNow.getTime() >= state.productionCheckpointAt.getTime()
      ? serverNow
      : state.productionCheckpointAt;

  await client.query(
    `UPDATE idle_stadium_states
        SET stored_microtickets = $2,
            production_checkpoint_at = $3,
            updated_at = $3
      WHERE session_id = $1`,
    [
      sessionId,
      projection.liveStoredMicroTickets,
      checkpointAt,
    ],
  );

  const checkpointedState: StadiumStorageState = {
    ...state,
    storedMicroTickets: projection.liveStoredMicroTickets,
    productionCheckpointAt: checkpointAt,
    updatedAt: checkpointAt,
  };

  return {
    projection,
    state: checkpointedState,
  };
}

export class StadiumRepository {
  async ensureSessionState(
    sessionId: string,
    serverNow = new Date(),
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const state = await ensureStadiumState(
        client,
        sessionId,
        serverNow,
      );
      await client.query("COMMIT");
      return state;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Returns a server-authoritative live Stadium projection without creating a
   * per-user timer or writing every tick to SQL.
   */
  async getSessionState(
    sessionId: string,
    serverNow = new Date(),
  ) {
    const state = await this.ensureSessionState(sessionId, serverNow);
    const projection = projectPersistedStadiumState(state, serverNow);

    return {
      serverNow,
      stadium: stadiumProjectionToServerState(projection),
      saleRemainderMicrodollars: state.saleRemainderMicrodollars,
    };
  }

  /**
   * Persists all production accrued since the previous checkpoint. This is the
   * action boundary used before seat purchases, upgrades, and ticket sales.
   */
  async settleProduction(
    sessionId: string,
    serverNow = new Date(),
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await checkpointStadiumProduction(
        client,
        sessionId,
        serverNow,
      );
      await client.query("COMMIT");

      const settledProjection = projectPersistedStadiumState(
        result.state,
        result.state.productionCheckpointAt,
      );

      return {
        serverNow,
        elapsedMs: result.projection.elapsedMs,
        creditedMicroTickets: result.projection.creditedMicroTickets,
        stadium: stadiumProjectionToServerState(settledProjection),
        saleRemainderMicrodollars:
          result.state.saleRemainderMicrodollars,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const stadiumRepository = new StadiumRepository();
