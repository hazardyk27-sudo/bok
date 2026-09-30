import { pool } from "@workspace/db";
import type {
  IdleStadiumStateResponse,
} from "../../../cascade-8/src/idle/types";
import {
  INITIAL_SHARED_BALANCE_CENTS,
  SHARED_WALLET_TABLE,
} from "../platform/wallet";
import {
  ticketMarketPersistence,
} from "./marketPersistence";
import {
  ensureStadiumState,
  projectPersistedStadiumState,
  stadiumProjectionToServerState,
} from "./stadiumRepository";

/**
 * Builds one canonical Idle snapshot.
 *
 * Stadium is locked before the shared wallet, matching every canonical
 * mutation's lock order. A state read therefore cannot observe the Stadium
 * half of a seat/upgrade/sale transaction with the wallet half from another
 * point in time.
 *
 * Legacy direct-cash rows are intentionally not read.
 */
export async function getIdleStadiumState(
  sessionId: string,
  serverNow = new Date(),
): Promise<IdleStadiumStateResponse> {
  const client = await pool.connect();
  let released = false;

  let stadium:
    IdleStadiumStateResponse["stadium"];
  let balanceCents: number;

  try {
    await client.query("BEGIN");

    const state = await ensureStadiumState(
      client,
      sessionId,
      serverNow,
      true,
    );

    const projection =
      projectPersistedStadiumState(
        state,
        serverNow,
      );

    stadium =
      stadiumProjectionToServerState(
        projection,
      );

    await client.query(
      `INSERT INTO ${SHARED_WALLET_TABLE}
         (session_id, balance_cents)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, INITIAL_SHARED_BALANCE_CENTS],
    );

    const walletResult = await client.query<{
      balance_cents: number;
    }>(
      `SELECT balance_cents
         FROM ${SHARED_WALLET_TABLE}
        WHERE session_id = $1
        FOR UPDATE`,
      [sessionId],
    );

    balanceCents = Number(
      walletResult.rows[0]?.balance_cents
        ?? INITIAL_SHARED_BALANCE_CENTS,
    );

    if (
      !Number.isSafeInteger(balanceCents)
      || balanceCents < 0
    ) {
      throw new Error(
        "INVALID_IDLE_WALLET_BALANCE",
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      released = true;
      try {
        client.release(
          rollbackError instanceof Error
            ? rollbackError
            : new Error(
              "IDLE_STADIUM_STATE_ROLLBACK_FAILED",
            ),
        );
      } catch {
        // Preserve the original snapshot failure.
      }
    }

    throw error;
  } finally {
    if (!released) {
      client.release();
    }
  }

  const marketState =
    await ticketMarketPersistence.getCurrentState()
    ?? await ticketMarketPersistence.ensureCurrentState(
      serverNow,
    );

  return {
    sessionId,
    serverTime: serverNow.toISOString(),
    wallet: {
      sessionId,
      balanceCents,
    },
    stadium,
    market: {
      priceMicrodollars:
        marketState.priceMicrodollars,
      source: marketState.source,
      feedStatus: marketState.feedStatus,
      tickAt: marketState.tickAt.toISOString(),
    },
  };
}
