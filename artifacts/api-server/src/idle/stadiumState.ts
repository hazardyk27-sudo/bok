import { pool } from "@workspace/db";
import type {
  IdleStadiumStateResponse,
} from "../../../cascade-8/src/idle/types";
import {
  INITIAL_SHARED_BALANCE_CENTS,
} from "../platform/wallet";
import {
  ticketMarketPersistence,
} from "./marketPersistence";
import {
  stadiumRepository,
} from "./stadiumRepository";

async function getOrCreateSharedWalletBalance(
  sessionId: string,
) {
  await pool.query(
    `INSERT INTO roulette_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  const result = await pool.query<{
    balance_cents: number;
  }>(
    `SELECT balance_cents
       FROM roulette_wallets
      WHERE session_id = $1`,
    [sessionId],
  );

  const balanceCents = Number(
    result.rows[0]?.balance_cents
      ?? INITIAL_SHARED_BALANCE_CENTS,
  );

  if (
    !Number.isSafeInteger(balanceCents)
    || balanceCents < 0
  ) {
    throw new Error("INVALID_IDLE_WALLET_BALANCE");
  }

  return balanceCents;
}

/**
 * Builds the canonical Idle snapshot used by the Businesses route.
 *
 * Legacy direct-cash business rows are intentionally not read. Stadium,
 * wallet and market are the only active state surfaces after Part 25.
 */
export async function getIdleStadiumState(
  sessionId: string,
  serverNow = new Date(),
): Promise<IdleStadiumStateResponse> {
  const stadiumState =
    await stadiumRepository.getSessionState(
      sessionId,
      serverNow,
    );

  const balanceCents =
    await getOrCreateSharedWalletBalance(sessionId);

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
    stadium: stadiumState.stadium,
    market: {
      priceMicrodollars:
        marketState.priceMicrodollars,
      source: marketState.source,
      feedStatus: marketState.feedStatus,
      tickAt: marketState.tickAt.toISOString(),
    },
  };
}
