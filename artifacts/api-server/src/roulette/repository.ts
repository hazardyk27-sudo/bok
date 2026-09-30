import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";
import {
  ROULETTE_SIMULATION_VERSION,
} from "../../../cascade-8/src/roulette/spinResult";
import {
  createRouletteAuthoritativeRound,
  type RouletteAuthoritativeRound,
  type RouletteServerBet,
} from "./round";

type WalletRow = { balance_cents: number };

type RouletteRoundRow = {
  id: string;
  session_id: string;
  seed: string;
  stake_cents: number;
  payout_cents: number;
  winning_number: number;
  pocket_index: number;
  bets: RouletteServerBet[];
  result: RouletteAuthoritativeRound["result"];
  settlement: RouletteAuthoritativeRound["settlement"];
  idempotency_key: string;
  created_at: Date;
};

const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{12,100}$/;

function validateIdempotencyKey(idempotencyKey: string) {
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    throw new Error("INVALID_ROULETTE_IDEMPOTENCY_KEY");
  }
}

async function walletBalance(sessionId: string) {
  const result = await pool.query<WalletRow>(
    "SELECT balance_cents FROM shared_wallets WHERE session_id = $1",
    [sessionId],
  );

  if (result.rows[0]) return Number(result.rows[0].balance_cents);

  await pool.query(
    `INSERT INTO shared_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  return INITIAL_SHARED_BALANCE_CENTS;
}

async function ensureWalletForUpdate(
  client: PoolClient,
  sessionId: string,
) {
  const result = await client.query<WalletRow>(
    `INSERT INTO shared_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO UPDATE
       SET balance_cents = shared_wallets.balance_cents
     RETURNING balance_cents`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  return Number(result.rows[0]?.balance_cents ?? 0);
}

function response(
  sessionId: string,
  balanceCents: number,
  row: RouletteRoundRow,
) {
  return {
    roundId: row.id,
    seed: row.seed,
    simulationVersion:
      ROULETTE_SIMULATION_VERSION,
    result: row.result,
    settlement: row.settlement,
    wallet: { sessionId, balanceCents },
  };
}

function rowFromRound(
  sessionId: string,
  roundId: string,
  idempotencyKey: string,
  round: RouletteAuthoritativeRound,
  bets: RouletteServerBet[],
): RouletteRoundRow {
  return {
    id: roundId,
    session_id: sessionId,
    seed: round.seed,
    stake_cents: round.stakeCents,
    payout_cents: round.payoutCents,
    winning_number: round.result.number,
    pocket_index: round.result.pocketIndex,
    bets,
    result: round.result,
    settlement: round.settlement,
    idempotency_key: idempotencyKey,
    created_at: new Date(),
  };
}

export class RouletteRepository {
  async getState(sessionId: string) {
    return {
      simulationVersion:
        ROULETTE_SIMULATION_VERSION,
      wallet: {
        sessionId,
        balanceCents: await walletBalance(sessionId),
      },
    };
  }

  async spin(
    sessionId: string,
    input: {
      bets: RouletteServerBet[];
      idempotencyKey: string;
    },
  ) {
    validateIdempotencyKey(input.idempotencyKey);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
        [input.idempotencyKey],
      );

      const duplicate = await client.query<RouletteRoundRow>(
        `SELECT *
           FROM roulette_rounds
          WHERE idempotency_key = $1
          LIMIT 1`,
        [input.idempotencyKey],
      );

      if (duplicate.rows[0]) {
        const existing = duplicate.rows[0];

        if (existing.session_id !== sessionId) {
          throw new Error("ROULETTE_IDEMPOTENCY_KEY_REUSED");
        }

        const balance = await ensureWalletForUpdate(client, sessionId);
        await client.query("COMMIT");
        return response(sessionId, balance, existing);
      }

      const authoritativeRound = createRouletteAuthoritativeRound(
        randomUUID(),
        input.bets,
      );
      const roundId = randomUUID();
      const currentBalance = await ensureWalletForUpdate(client, sessionId);

      if (currentBalance < authoritativeRound.stakeCents) {
        throw new Error("INSUFFICIENT_ROULETTE_CREDITS");
      }

      const balanceResult = await client.query<WalletRow>(
        `UPDATE shared_wallets
            SET balance_cents = balance_cents - $2 + $3,
                updated_at = now()
          WHERE session_id = $1
            AND balance_cents >= $2
        RETURNING balance_cents`,
        [
          sessionId,
          authoritativeRound.stakeCents,
          authoritativeRound.payoutCents,
        ],
      );

      const balanceRow = balanceResult.rows[0];
      if (!balanceRow) throw new Error("INSUFFICIENT_ROULETTE_CREDITS");

      const row = rowFromRound(
        sessionId,
        roundId,
        input.idempotencyKey,
        authoritativeRound,
        input.bets,
      );

      await client.query(
        `INSERT INTO roulette_rounds
          (id, session_id, seed, stake_cents, payout_cents,
           winning_number, pocket_index, bets, result, settlement,
           idempotency_key)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb,
           $10::jsonb, $11)`,
        [
          row.id,
          row.session_id,
          row.seed,
          row.stake_cents,
          row.payout_cents,
          row.winning_number,
          row.pocket_index,
          JSON.stringify(row.bets),
          JSON.stringify(row.result),
          JSON.stringify(row.settlement),
          row.idempotency_key,
        ],
      );

      if (authoritativeRound.stakeCents > 0) {
        await client.query(
          `INSERT INTO roulette_ledger
            (id, session_id, round_id, kind, amount_cents, idempotency_key)
           VALUES ($1, $2, $3, 'STAKE_DEBIT', $4, $5)`,
          [
            randomUUID(),
            sessionId,
            roundId,
            -authoritativeRound.stakeCents,
            `stake:${input.idempotencyKey}`,
          ],
        );
      }

      if (authoritativeRound.payoutCents > 0) {
        await client.query(
          `INSERT INTO roulette_ledger
            (id, session_id, round_id, kind, amount_cents, idempotency_key)
           VALUES ($1, $2, $3, 'PAYOUT_CREDIT', $4, $5)`,
          [
            randomUUID(),
            sessionId,
            roundId,
            authoritativeRound.payoutCents,
            `payout:${roundId}`,
          ],
        );
      }

      await client.query("COMMIT");

      return response(
        sessionId,
        Number(balanceRow.balance_cents),
        row,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const rouletteRepository = new RouletteRepository();
