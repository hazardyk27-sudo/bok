import {
  pool,
  type PoolClient,
} from "@workspace/db";
import {
  createRouletteGlobalRoundSnapshot,
  type RouletteGlobalRoundPlan,
  type RouletteGlobalRoundSnapshot,
} from "./globalTable";

type RouletteGlobalRoundRow = {
  id: string;
  simulation_version: string;
  seed: string;
  betting_open_at: Date;
  betting_close_at: Date;
  spin_started_at: Date;
  result_at: Date;
  next_round_at: Date;
  winning_number: number;
  pocket_index: number;
  result: RouletteGlobalRoundPlan["result"];
};

const SCHEDULER_LOCK_NAME =
  "roulette-global-table-scheduler-v1";

function rowToPlan(
  row: RouletteGlobalRoundRow,
): RouletteGlobalRoundPlan {
  return {
    roundId: row.id,
    simulationVersion:
      row.simulation_version,
    seed: row.seed,
    result: row.result,
    bettingOpenAtMs:
      row.betting_open_at.getTime(),
    bettingCloseAtMs:
      row.betting_close_at.getTime(),
    spinStartedAtMs:
      row.spin_started_at.getTime(),
    resultAtMs:
      row.result_at.getTime(),
    nextRoundAtMs:
      row.next_round_at.getTime(),
  };
}

export async function getRouletteDatabaseNowMs() {
  const result =
    await pool.query<{
      server_now: Date;
    }>(
      `SELECT clock_timestamp()
         AS server_now`,
    );

  const serverNow =
    result.rows[0]
      ?.server_now;

  if (!serverNow) {
    throw new Error(
      "ROULETTE_DATABASE_CLOCK_UNAVAILABLE",
    );
  }

  return serverNow.getTime();
}

export async function getRouletteDatabaseNowMsFromClient(
  client: PoolClient,
) {
  const result =
    await client.query<{
      server_now: Date;
    }>(
      `SELECT clock_timestamp()
         AS server_now`,
    );

  const serverNow =
    result.rows[0]
      ?.server_now;

  if (!serverNow) {
    throw new Error(
      "ROULETTE_DATABASE_CLOCK_UNAVAILABLE",
    );
  }

  return serverNow.getTime();
}

let rouletteGlobalStorageReady:
  Promise<void> | null = null;

async function verifyRouletteGlobalTableStorage() {
  const result =
    await pool.query<{
      schema_ready: boolean;
    }>(
      `SELECT (
        to_regclass('public.roulette_global_rounds') IS NOT NULL
        AND to_regclass('public.roulette_global_bets') IS NOT NULL
        AND to_regclass('public.roulette_global_bet_requests') IS NOT NULL
        AND to_regclass('public.roulette_global_rounds_betting_open_unique') IS NOT NULL
        AND to_regclass('public.roulette_global_rounds_next_round_idx') IS NOT NULL
        AND to_regclass('public.roulette_global_rounds_result_at_idx') IS NOT NULL
        AND to_regclass('public.roulette_global_bets_round_session_unique') IS NOT NULL
        AND to_regclass('public.roulette_global_bets_unsettled_idx') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'roulette_global_bets'
            AND column_name = 'revision'
        )
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'roulette_global_bet_requests'
            AND column_name = 'expected_revision'
        )
        AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'roulette_global_bet_requests'
            AND column_name = 'applied_revision'
        )
      ) AS schema_ready`,
    );

  if (
    result.rows[0]
      ?.schema_ready !== true
  ) {
    throw new Error(
      "ROULETTE_GLOBAL_SCHEMA_MISSING",
    );
  }
}

export function ensureRouletteGlobalTableStorage(): Promise<void> {
  if (rouletteGlobalStorageReady) {
    return rouletteGlobalStorageReady;
  }

  const verification =
    verifyRouletteGlobalTableStorage();

  rouletteGlobalStorageReady =
    verification;

  void verification.catch(() => {
    if (
      rouletteGlobalStorageReady ===
      verification
    ) {
      rouletteGlobalStorageReady =
        null;
    }
  });

  return verification;
}

export async function withRouletteGlobalSchedulerLock<T>(
  work: (
    client: PoolClient,
  ) => Promise<T>,
) {
  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(
        hashtextextended($1::text, 0)
      )`,
      [SCHEDULER_LOCK_NAME],
    );

    const value =
      await work(client);

    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readLatestRouletteGlobalRound(
  client: PoolClient,
) {
  const result =
    await client.query<RouletteGlobalRoundRow>(
      `SELECT
         id,
         simulation_version,
         seed,
         betting_open_at,
         betting_close_at,
         spin_started_at,
         result_at,
         next_round_at,
         winning_number,
         pocket_index,
         result
       FROM roulette_global_rounds
       ORDER BY betting_open_at DESC
       LIMIT 1`,
    );

  return result.rows[0]
    ? rowToPlan(
        result.rows[0],
      )
    : null;
}

export async function insertRouletteGlobalRound(
  client: PoolClient,
  round: RouletteGlobalRoundPlan,
) {
  const inserted =
    await client.query<{ id: string }>(
      `INSERT INTO roulette_global_rounds (
         id,
         simulation_version,
         seed,
         betting_open_at,
         betting_close_at,
         spin_started_at,
         result_at,
         next_round_at,
         winning_number,
         pocket_index,
         result
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11::jsonb
       )
       ON CONFLICT (betting_open_at)
       DO NOTHING
       RETURNING id`,
      [
        round.roundId,
        round.simulationVersion,
        round.seed,
        new Date(
          round.bettingOpenAtMs,
        ),
        new Date(
          round.bettingCloseAtMs,
        ),
        new Date(
          round.spinStartedAtMs,
        ),
        new Date(
          round.resultAtMs,
        ),
        new Date(
          round.nextRoundAtMs,
        ),
        round.result.number,
        round.result.pocketIndex,
        JSON.stringify(
          round.result,
        ),
      ],
    );

  return inserted.rowCount === 1;
}

export async function getCurrentRouletteGlobalTableSnapshot(
  nowMs: number,
): Promise<RouletteGlobalRoundSnapshot | null> {
  const result =
    await pool.query<RouletteGlobalRoundRow>(
      `SELECT
         id,
         simulation_version,
         seed,
         betting_open_at,
         betting_close_at,
         spin_started_at,
         result_at,
         next_round_at,
         winning_number,
         pocket_index,
         result
       FROM roulette_global_rounds
       WHERE next_round_at > $1
       ORDER BY betting_open_at ASC
       LIMIT 1`,
      [
        new Date(nowMs),
      ],
    );

  const row =
    result.rows[0];

  if (!row) {
    return null;
  }

  return createRouletteGlobalRoundSnapshot(
    rowToPlan(row),
    nowMs,
  );
}


export async function getRouletteGlobalRecentResults(
  nowMs: number,
  limit: number = 11,
) {
  const safeLimit =
    Math.max(
      1,
      Math.min(
        50,
        Math.trunc(limit),
      ),
    );

  const result =
    await pool.query<{
      winning_number: number;
    }>(
      `SELECT winning_number
       FROM roulette_global_rounds
       WHERE result_at <= $1
       ORDER BY result_at DESC
       LIMIT $2`,
      [
        new Date(nowMs),
        safeLimit,
      ],
    );

  return result.rows
    .map((row) =>
      Number(
        row.winning_number,
      ),
    )
    .reverse();
}
