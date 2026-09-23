import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { playSpin } from "../../../cascade-8/src/engine/SlotEngine";
import { SeededRNG } from "../../../cascade-8/src/engine/RNG";
import type { SpinResult } from "../../../cascade-8/src/engine/types";
import { FREE_BET_CENTS, BETS_CENTS } from "../../../cascade-8/src/config/GameConfig";
import { INITIAL_ROULETTE_BALANCE_CENTS } from "../roulette/types";

type SlotRoundRow = {
  id: string;
  session_id: string;
  stake_cents: number;
  payout_cents: number;
  result: SpinResult;
  idempotency_key: string;
  created_at: Date;
};

type WalletRow = { balance_cents: number };

const VALID_STAKES = new Set<number>(BETS_CENTS);
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{12,100}$/;

function validateInput(stakeCents: number, idempotencyKey: string) {
  if (!Number.isInteger(stakeCents) || !VALID_STAKES.has(stakeCents)) throw new Error("INVALID_SLOT_STAKE");
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
}

async function ensureWalletForUpdate(client: PoolClient, sessionId: string) {
  const result = await client.query<WalletRow>(
    `INSERT INTO roulette_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO UPDATE
       SET balance_cents = roulette_wallets.balance_cents
     RETURNING balance_cents`,
    [sessionId, INITIAL_ROULETTE_BALANCE_CENTS],
  );
  return Number(result.rows[0]?.balance_cents ?? 0);
}

async function walletBalance(sessionId: string) {
  const result = await pool.query<WalletRow>(
    "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1",
    [sessionId],
  );
  if (result.rows[0]) return Number(result.rows[0].balance_cents);
  await pool.query(
    "INSERT INTO roulette_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
    [sessionId, INITIAL_ROULETTE_BALANCE_CENTS],
  );
  return INITIAL_ROULETTE_BALANCE_CENTS;
}

function response(sessionId: string, balanceCents: number, row: SlotRoundRow) {
  return {
    roundId: row.id,
    result: row.result,
    wallet: { sessionId, balanceCents },
  };
}

export class SlotRepository {
  async getState(sessionId: string) {
    return {
      wallet: { sessionId, balanceCents: await walletBalance(sessionId) },
    };
  }

  async migrateLegacyBalance(sessionId: string, legacyBalanceCents: number) {
    if (!Number.isInteger(legacyBalanceCents) || legacyBalanceCents < 0 || legacyBalanceCents > 1_000_000_000) {
      throw new Error("INVALID_LEGACY_SLOT_BALANCE");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const balanceCents = await ensureWalletForUpdate(client, sessionId);
      await client.query(
        `INSERT INTO slot_wallet_migrations
          (id, session_id, legacy_balance_cents, disposition)
         VALUES ($1, $2, $3, 'IGNORED_UNTRUSTED_CLIENT_VALUE')
         ON CONFLICT (session_id) DO NOTHING`,
        [randomUUID(), sessionId, legacyBalanceCents],
      );
      await client.query("COMMIT");
      return { wallet: { sessionId, balanceCents }, migrated: true };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async spin(sessionId: string, input: { stakeCents: number; idempotencyKey: string }) {
    validateInput(input.stakeCents, input.idempotencyKey);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let balanceCents = await ensureWalletForUpdate(client, sessionId);
      const duplicate = await client.query<SlotRoundRow>(
        "SELECT * FROM slot_rounds WHERE idempotency_key = $1 FOR UPDATE",
        [input.idempotencyKey],
      );
      if (duplicate.rows[0]) {
        if (duplicate.rows[0].session_id !== sessionId) throw new Error("IDEMPOTENCY_KEY_REUSED");
        await client.query("COMMIT");
        return response(sessionId, balanceCents, duplicate.rows[0]);
      }

      const isFreeBet = input.stakeCents === FREE_BET_CENTS;
      if (!isFreeBet && balanceCents < input.stakeCents) throw new Error("INSUFFICIENT_SLOT_CREDITS");

      const result = playSpin(input.stakeCents, new SeededRNG(randomUUID()));
      const roundId = randomUUID();
      const debitCents = isFreeBet ? 0 : input.stakeCents;
      const payoutCents = result.totalWinCents;

      const settlement = await client.query<SlotRoundRow & WalletRow>(
        `WITH updated_wallet AS (
           UPDATE roulette_wallets
              SET balance_cents = balance_cents + $1,
                  updated_at = now()
            WHERE session_id = $2
            RETURNING balance_cents
         ),
         inserted_round AS (
           INSERT INTO slot_rounds
             (id, session_id, stake_cents, payout_cents, result, idempotency_key)
           VALUES ($3, $2, $4, $5, $6::jsonb, $7)
           RETURNING *
         ),
         inserted_ledger AS (
           INSERT INTO slot_ledger
             (id, session_id, round_id, kind, amount_cents, idempotency_key)
           SELECT *
             FROM (VALUES
               ($8::text, $2::text, $3::text, 'STAKE_DEBIT'::text, ($10::integer * -1), $11::text),
               ($9::text, $2::text, $3::text, 'PAYOUT_CREDIT'::text, $5::integer, $12::text)
             ) AS entries(id, session_id, round_id, kind, amount_cents, idempotency_key)
            WHERE kind <> 'STAKE_DEBIT' OR $10 > 0
           RETURNING id
         )
         SELECT inserted_round.*,
                updated_wallet.balance_cents,
                (SELECT count(*) FROM inserted_ledger) AS ledger_count
           FROM inserted_round
           CROSS JOIN updated_wallet`,
        [
          payoutCents - debitCents,
          sessionId,
          roundId,
          input.stakeCents,
          payoutCents,
          JSON.stringify(result),
          input.idempotencyKey,
          randomUUID(),
          randomUUID(),
          debitCents,
          `stake:${input.idempotencyKey}`,
          `payout:${roundId}`,
        ],
      );
      const settled = settlement.rows[0];
      if (!settled) throw new Error("SLOT_SETTLEMENT_FAILED");
      balanceCents = Number(settled.balance_cents);
      await client.query("COMMIT");
      return response(sessionId, balanceCents, settled);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const slotRepository = new SlotRepository();