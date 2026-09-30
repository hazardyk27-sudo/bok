import {
  randomUUID,
} from "node:crypto";
import {
  pool,
  type PoolClient,
} from "@workspace/db";
import {
  INITIAL_SHARED_BALANCE_CENTS,
} from "../platform/wallet";
import type {
  RouletteRoundSettlement,
} from "../../../cascade-8/src/roulette/betRules";
import {
  assertRouletteGlobalBettingOpen,
  getNextRouletteGlobalBetRevision,
  getRouletteGlobalStakeCents,
  settleRouletteGlobalBet,
} from "./globalBet";
import type {
  RouletteServerBet,
} from "./round";

type WalletRow = {
  balance_cents: number;
};

type GlobalRoundBetRow = {
  id: string;
  round_id: string;
  session_id: string;
  bets: RouletteServerBet[];
  stake_cents: number;
  payout_cents: number;
  revision: number;
  settlement:
    | RouletteRoundSettlement
    | null;
  settled_at: Date | null;
  updated_at: Date;
};

type GlobalRoundForBetRow = {
  id: string;
  betting_open_at: Date;
  betting_close_at: Date;
  result_at: Date;
  winning_number: number;
  server_now: Date;
};

type GlobalBetRequestRow = {
  idempotency_key: string;
  round_id: string;
  session_id: string;
  bets: RouletteServerBet[];
  expected_revision: number;
  applied_revision: number;
};

type DueGlobalBetRow = {
  id: string;
  round_id: string;
  session_id: string;
  bets: RouletteServerBet[];
  winning_number: number;
};

const IDEMPOTENCY_PATTERN =
  /^[a-zA-Z0-9_-]{12,100}$/;
const GLOBAL_SETTLEMENT_LIMIT =
  512;

function validateIdempotencyKey(
  idempotencyKey: string,
) {
  if (
    !IDEMPOTENCY_PATTERN.test(
      idempotencyKey,
    )
  ) {
    throw new Error(
      "INVALID_ROULETTE_IDEMPOTENCY_KEY",
    );
  }
}

function betsEqual(
  left: readonly RouletteServerBet[],
  right: readonly RouletteServerBet[],
) {
  return (
    JSON.stringify(left) ===
    JSON.stringify(right)
  );
}

async function ensureWalletForUpdate(
  client: PoolClient,
  sessionId: string,
) {
  const result =
    await client.query<WalletRow>(
      `INSERT INTO shared_wallets
        (session_id, balance_cents)
       VALUES ($1, $2)
       ON CONFLICT (session_id)
       DO UPDATE SET
         balance_cents =
           shared_wallets.balance_cents
       RETURNING balance_cents`,
      [
        sessionId,
        INITIAL_SHARED_BALANCE_CENTS,
      ],
    );

  return Number(
    result.rows[0]
      ?.balance_cents ?? 0,
  );
}

async function readGlobalBet(
  client: PoolClient,
  sessionId: string,
  roundId: string,
) {
  const result =
    await client.query<GlobalRoundBetRow>(
      `SELECT
         id,
         round_id,
         session_id,
         bets,
         stake_cents,
         payout_cents,
         revision,
         settlement,
         settled_at,
         updated_at
       FROM roulette_global_bets
       WHERE round_id = $1
         AND session_id = $2
       LIMIT 1`,
      [
        roundId,
        sessionId,
      ],
    );

  return result.rows[0] ?? null;
}

function response(
  row: GlobalRoundBetRow | null,
  balanceCents: number,
) {
  return {
    globalBet:
      row
        ? {
            id: row.id,
            roundId:
              row.round_id,
            bets:
              row.bets,
            stakeCents:
              Number(
                row.stake_cents,
              ),
            payoutCents:
              Number(
                row.payout_cents,
              ),
            revision:
              Number(
                row.revision,
              ),
            settlement:
              row.settlement,
            settledAtMs:
              row.settled_at
                ?.getTime() ??
              null,
            updatedAtMs:
              row.updated_at
                .getTime(),
          }
        : null,
    balanceCents,
  };
}

export async function getRouletteGlobalBetForRound(
  sessionId: string,
  roundId: string,
) {
  const client =
    await pool.connect();

  try {
    const [
      row,
      walletResult,
    ] = await Promise.all([
      readGlobalBet(
        client,
        sessionId,
        roundId,
      ),
      client.query<WalletRow>(
        `SELECT balance_cents
         FROM shared_wallets
         WHERE session_id = $1`,
        [
          sessionId,
        ],
      ),
    ]);

    return response(
      row,
      Number(
        walletResult.rows[0]
          ?.balance_cents ??
        INITIAL_SHARED_BALANCE_CENTS,
      ),
    );
  } finally {
    client.release();
  }
}

export async function upsertRouletteGlobalBet(input: {
  sessionId: string;
  roundId: string;
  bets: RouletteServerBet[];
  idempotencyKey: string;
  expectedRevision: number;
}) {
  validateIdempotencyKey(
    input.idempotencyKey,
  );

  if (
    !Number.isSafeInteger(
      input.expectedRevision,
    ) ||
    input.expectedRevision < 0
  ) {
    throw new Error(
      "INVALID_ROULETTE_GLOBAL_BET_REVISION",
    );
  }

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(
        hashtextextended($1::text, 0)
      )`,
      [
        `roulette-global-bet:${input.idempotencyKey}`,
      ],
    );
    await client.query(
      `SELECT pg_advisory_xact_lock(
        hashtextextended($1::text, 0)
      )`,
      [
        `roulette-global-slip:${input.roundId}:${input.sessionId}`,
      ],
    );

    const duplicate =
      await client.query<GlobalBetRequestRow>(
        `SELECT
           idempotency_key,
           round_id,
           session_id,
           bets,
           expected_revision,
           applied_revision
         FROM roulette_global_bet_requests
         WHERE idempotency_key = $1
         LIMIT 1`,
        [
          input.idempotencyKey,
        ],
      );

    if (
      duplicate.rows[0]
    ) {
      const existingRequest =
        duplicate.rows[0];

      if (
        existingRequest.round_id !==
          input.roundId ||
        existingRequest.session_id !==
          input.sessionId ||
        Number(
          existingRequest.expected_revision,
        ) !==
          input.expectedRevision ||
        !betsEqual(
          existingRequest.bets,
          input.bets,
        )
      ) {
        throw new Error(
          "ROULETTE_IDEMPOTENCY_KEY_REUSED",
        );
      }

      const existingBet =
        await readGlobalBet(
          client,
          input.sessionId,
          input.roundId,
        );
      const balance =
        await ensureWalletForUpdate(
          client,
          input.sessionId,
        );

      await client.query(
        "COMMIT",
      );

      return response(
        existingBet,
        balance,
      );
    }

    const roundResult =
      await client.query<GlobalRoundForBetRow>(
        `SELECT
           id,
           betting_open_at,
           betting_close_at,
           result_at,
           winning_number,
           clock_timestamp()
             AS server_now
         FROM roulette_global_rounds
         WHERE id = $1
         FOR UPDATE`,
        [
          input.roundId,
        ],
      );
    const round =
      roundResult.rows[0];

    if (!round) {
      throw new Error(
        "ROULETTE_GLOBAL_ROUND_NOT_FOUND",
      );
    }

    assertRouletteGlobalBettingOpen(
      {
        bettingOpenAtMs:
          round.betting_open_at
            .getTime(),
        bettingCloseAtMs:
          round.betting_close_at
            .getTime(),
      },
      round.server_now.getTime(),
    );

    const existingBet =
      await readGlobalBet(
        client,
        input.sessionId,
        input.roundId,
      );

    if (
      existingBet?.settled_at
    ) {
      throw new Error(
        "ROULETTE_GLOBAL_BET_ALREADY_SETTLED",
      );
    }

    const currentRevision =
      Number(
        existingBet?.revision ??
        0,
      );
    const nextRevision =
      getNextRouletteGlobalBetRevision(
        currentRevision,
        input.expectedRevision,
      );

    const oldStakeCents =
      Number(
        existingBet
          ?.stake_cents ?? 0,
      );
    const newStakeCents =
      getRouletteGlobalStakeCents(
        input.bets,
      );
    const stakeDeltaCents =
      newStakeCents -
      oldStakeCents;
    const currentBalance =
      await ensureWalletForUpdate(
        client,
        input.sessionId,
      );

    if (
      stakeDeltaCents > 0 &&
      currentBalance <
        stakeDeltaCents
    ) {
      throw new Error(
        "INSUFFICIENT_ROULETTE_CREDITS",
      );
    }

    const balanceResult =
      await client.query<WalletRow>(
        `UPDATE shared_wallets
         SET balance_cents =
               balance_cents - $2,
             updated_at =
               clock_timestamp()
         WHERE session_id = $1
           AND (
             $2 <= 0 OR
             balance_cents >= $2
           )
         RETURNING balance_cents`,
        [
          input.sessionId,
          stakeDeltaCents,
        ],
      );
    const balanceRow =
      balanceResult.rows[0];

    if (!balanceRow) {
      throw new Error(
        "INSUFFICIENT_ROULETTE_CREDITS",
      );
    }

    const betId =
      existingBet?.id ??
      randomUUID();

    const upserted =
      await client.query<GlobalRoundBetRow>(
        `INSERT INTO roulette_global_bets (
           id,
           round_id,
           session_id,
           bets,
           stake_cents,
           payout_cents,
           revision,
           settlement,
           settled_at,
           updated_at
         )
         VALUES (
           $1, $2, $3, $4::jsonb,
           $5, 0, $6, NULL, NULL,
           clock_timestamp()
         )
         ON CONFLICT
           (round_id, session_id)
         DO UPDATE SET
           bets = EXCLUDED.bets,
           stake_cents =
             EXCLUDED.stake_cents,
           revision =
             EXCLUDED.revision,
           updated_at =
             clock_timestamp()
         RETURNING
           id,
           round_id,
           session_id,
           bets,
           stake_cents,
           payout_cents,
           revision,
           settlement,
           settled_at,
           updated_at`,
        [
          betId,
          input.roundId,
          input.sessionId,
          JSON.stringify(
            input.bets,
          ),
          newStakeCents,
          nextRevision,
        ],
      );

    await client.query(
      `INSERT INTO roulette_global_bet_requests (
         idempotency_key,
         round_id,
         session_id,
         bets,
         expected_revision,
         applied_revision
       )
       VALUES (
         $1, $2, $3, $4::jsonb,
         $5, $6
       )`,
      [
        input.idempotencyKey,
        input.roundId,
        input.sessionId,
        JSON.stringify(
          input.bets,
        ),
        input.expectedRevision,
        nextRevision,
      ],
    );

    if (
      stakeDeltaCents !== 0
    ) {
      await client.query(
        `INSERT INTO roulette_ledger (
           id,
           session_id,
           round_id,
           kind,
           amount_cents,
           idempotency_key
         )
         VALUES (
           $1, $2, $3, $4, $5, $6
         )`,
        [
          randomUUID(),
          input.sessionId,
          input.roundId,
          stakeDeltaCents > 0
            ? "GLOBAL_BET_RESERVE"
            : "GLOBAL_BET_RELEASE",
          -stakeDeltaCents,
          `global-bet:${input.idempotencyKey}`,
        ],
      );
    }

    await client.query(
      "COMMIT",
    );

    return response(
      upserted.rows[0] ??
        null,
      Number(
        balanceRow.balance_cents,
      ),
    );
  } catch (error) {
    await client.query(
      "ROLLBACK",
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function settleDueRouletteGlobalBets(
  client: PoolClient,
  nowMs: number,
) {
  const due =
    await client.query<DueGlobalBetRow>(
      `SELECT
         b.id,
         b.round_id,
         b.session_id,
         b.bets,
         r.winning_number
       FROM roulette_global_bets b
       JOIN roulette_global_rounds r
         ON r.id = b.round_id
       WHERE b.settled_at IS NULL
         AND r.result_at <= $1
       ORDER BY
         r.result_at ASC,
         b.updated_at ASC
       LIMIT $2
       FOR UPDATE OF b`,
      [
        new Date(nowMs),
        GLOBAL_SETTLEMENT_LIMIT,
      ],
    );

  let settledBets = 0;

  for (
    const row of
    due.rows
  ) {
    const {
      settlement,
      payoutCents,
    } =
      settleRouletteGlobalBet(
        row.bets,
        row.winning_number,
      );

    if (
      payoutCents > 0
    ) {
      const ledger =
        await client.query<{ id: string }>(
          `INSERT INTO roulette_ledger (
             id,
             session_id,
             round_id,
             kind,
             amount_cents,
             idempotency_key
           )
           VALUES (
             $1, $2, $3,
             'GLOBAL_PAYOUT_CREDIT',
             $4, $5
           )
           ON CONFLICT
             (idempotency_key)
           DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            row.session_id,
            row.round_id,
            payoutCents,
            `global-payout:${row.round_id}:${row.session_id}`,
          ],
        );

      if (
        ledger.rowCount === 1
      ) {
        const wallet =
          await client.query(
            `UPDATE shared_wallets
             SET balance_cents =
                   balance_cents + $2,
                 updated_at =
                   clock_timestamp()
             WHERE session_id = $1
             RETURNING balance_cents`,
            [
              row.session_id,
              payoutCents,
            ],
          );

        if (
          wallet.rowCount !== 1
        ) {
          throw new Error(
            "ROULETTE_GLOBAL_WALLET_MISSING",
          );
        }
      }
    }

    await client.query(
      `UPDATE roulette_global_bets
       SET payout_cents = $2,
           settlement = $3::jsonb,
           settled_at =
             clock_timestamp(),
           updated_at =
             clock_timestamp()
       WHERE id = $1
         AND settled_at IS NULL`,
      [
        row.id,
        payoutCents,
        JSON.stringify(
          settlement,
        ),
      ],
    );

    settledBets += 1;
  }

  return {
    settledBets,
    hasMore:
      due.rows.length ===
      GLOBAL_SETTLEMENT_LIMIT,
  };
}


export async function settleRouletteGlobalBetForRoundSession(
  sessionId: string,
  roundId: string,
  nowMs: number = Date.now(),
) {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN",
    );
    await client.query(
      `SELECT pg_advisory_xact_lock(
        hashtextextended($1::text, 0)
      )`,
      [
        `roulette-global-settle:${roundId}:${sessionId}`,
      ],
    );

    const due =
      await client.query<DueGlobalBetRow>(
        `SELECT
           b.id,
           b.round_id,
           b.session_id,
           b.bets,
           r.winning_number
         FROM roulette_global_bets b
         JOIN roulette_global_rounds r
           ON r.id = b.round_id
         WHERE b.round_id = $1
           AND b.session_id = $2
           AND b.settled_at IS NULL
           AND r.result_at <= $3
         LIMIT 1
         FOR UPDATE OF b`,
        [
          roundId,
          sessionId,
          new Date(nowMs),
        ],
      );

    const row =
      due.rows[0];

    if (!row) {
      await client.query(
        "COMMIT",
      );
      return false;
    }

    const {
      settlement,
      payoutCents,
    } =
      settleRouletteGlobalBet(
        row.bets,
        row.winning_number,
      );

    if (
      payoutCents > 0
    ) {
      const ledger =
        await client.query<{ id: string }>(
          `INSERT INTO roulette_ledger (
             id,
             session_id,
             round_id,
             kind,
             amount_cents,
             idempotency_key
           )
           VALUES (
             $1, $2, $3,
             'GLOBAL_PAYOUT_CREDIT',
             $4, $5
           )
           ON CONFLICT
             (idempotency_key)
           DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            sessionId,
            roundId,
            payoutCents,
            `global-payout:${roundId}:${sessionId}`,
          ],
        );

      if (
        ledger.rowCount === 1
      ) {
        const wallet =
          await client.query(
            `UPDATE shared_wallets
             SET balance_cents =
                   balance_cents + $2,
                 updated_at =
                   clock_timestamp()
             WHERE session_id = $1
             RETURNING balance_cents`,
            [
              sessionId,
              payoutCents,
            ],
          );

        if (
          wallet.rowCount !== 1
        ) {
          throw new Error(
            "ROULETTE_GLOBAL_WALLET_MISSING",
          );
        }
      }
    }

    await client.query(
      `UPDATE roulette_global_bets
       SET payout_cents = $2,
           settlement = $3::jsonb,
           settled_at =
             clock_timestamp(),
           updated_at =
             clock_timestamp()
       WHERE id = $1
         AND settled_at IS NULL`,
      [
        row.id,
        payoutCents,
        JSON.stringify(
          settlement,
        ),
      ],
    );

    await client.query(
      "COMMIT",
    );
    return true;
  } catch (error) {
    await client.query(
      "ROLLBACK",
    );
    throw error;
  } finally {
    client.release();
  }
}
