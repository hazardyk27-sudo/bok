import { pool, type PoolClient } from "@workspace/db";
import {
  checkpointStadiumProduction,
  type StadiumProductionProjection,
  type StadiumStorageState,
} from "./stadiumRepository";
import {
  applyStadiumEconomyMutationPatch,
  type StadiumEconomyMutationPatch,
} from "./stadiumPolicy";

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

  const effectiveUpdatedAt = new Date(Math.max(
    updatedAt.getTime(),
    settledState.productionCheckpointAt.getTime(),
  ));

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
      effectiveUpdatedAt,
    ],
  );

  return {
    ...nextState,
    updatedAt: effectiveUpdatedAt,
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
