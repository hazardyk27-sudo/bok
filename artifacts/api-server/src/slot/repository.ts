import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { playSpin } from "../../../cascade-8/src/engine/SlotEngine";
import { SeededRNG } from "../../../cascade-8/src/engine/RNG";
import type { FreeSpinResult, SpinResult, TumbleResult } from "../../../cascade-8/src/engine/types";
import { FREE_BET_CENTS, BETS_CENTS } from "../../../cascade-8/src/config/GameConfig";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";

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

let bigMoneyStorageReady: Promise<void> | null = null;

async function ensureBigMoneyStorage() {
  if (bigMoneyStorageReady) return bigMoneyStorageReady;
  bigMoneyStorageReady = (async () => {
    const expected = new Map([
      ["shared_wallets.balance_cents", "BIGINT"],
      ["slot_rounds.stake_cents", "BIGINT"],
      ["slot_rounds.payout_cents", "BIGINT"],
      ["slot_ledger.amount_cents", "BIGINT"],
      ["slot_wallet_migrations.legacy_balance_cents", "BIGINT"],
    ]);
    const result = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
      `SELECT table_name, column_name, data_type
         FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (
            (table_name = 'shared_wallets' AND column_name = 'balance_cents')
            OR (table_name = 'slot_rounds' AND column_name IN ('stake_cents', 'payout_cents'))
            OR (table_name = 'slot_ledger' AND column_name = 'amount_cents')
            OR (table_name = 'slot_wallet_migrations' AND column_name = 'legacy_balance_cents')
          )`,
    );
    const current = new Map(
      result.rows.map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.data_type.toUpperCase(),
      ]),
    );
    const statements = [
      ["shared_wallets.balance_cents", "ALTER TABLE shared_wallets ALTER COLUMN balance_cents TYPE BIGINT USING balance_cents::BIGINT"],
      ["slot_rounds.stake_cents", "ALTER TABLE slot_rounds ALTER COLUMN stake_cents TYPE BIGINT USING stake_cents::BIGINT"],
      ["slot_rounds.payout_cents", "ALTER TABLE slot_rounds ALTER COLUMN payout_cents TYPE BIGINT USING payout_cents::BIGINT"],
      ["slot_ledger.amount_cents", "ALTER TABLE slot_ledger ALTER COLUMN amount_cents TYPE BIGINT USING amount_cents::BIGINT"],
      ["slot_wallet_migrations.legacy_balance_cents", "ALTER TABLE slot_wallet_migrations ALTER COLUMN legacy_balance_cents TYPE BIGINT USING legacy_balance_cents::BIGINT"],
    ] as const;
    const pending = statements.filter(([key]) => current.get(key) !== expected.get(key));
    if (pending.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [, sql] of pending) await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })().catch((error) => {
    bigMoneyStorageReady = null;
    throw error;
  });
  return bigMoneyStorageReady;
}

function validateInput(stakeCents: number, idempotencyKey: string) {
  if (!Number.isInteger(stakeCents) || !VALID_STAKES.has(stakeCents)) throw new Error("INVALID_SLOT_STAKE");
  if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) throw new Error("INVALID_IDEMPOTENCY_KEY");
}

async function ensureWalletForUpdate(client: PoolClient, sessionId: string) {
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

async function walletBalance(sessionId: string) {
  const result = await pool.query<WalletRow>(
    "SELECT balance_cents FROM shared_wallets WHERE session_id = $1",
    [sessionId],
  );
  if (result.rows[0]) return Number(result.rows[0].balance_cents);
  await pool.query(
    "INSERT INTO shared_wallets (session_id, balance_cents) VALUES ($1, $2) ON CONFLICT (session_id) DO NOTHING",
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );
  return INITIAL_SHARED_BALANCE_CENTS;
}

type WireTumbleResult = Omit<TumbleResult, "boardBefore" | "boardAfterGravity" | "newSymbols" | "multiplierCoreCells">;
type WireFreeSpinResult = Omit<FreeSpinResult, "tumbles"> & { tumbles: WireTumbleResult[] };
type WireSpinResult = Omit<SpinResult, "tumbles" | "freeSpins"> & {
  tumbles: WireTumbleResult[];
  freeSpins: WireFreeSpinResult[];
};

function compactTumbleForWire(tumble: TumbleResult): WireTumbleResult {
  const {
    boardBefore: _boardBefore,
    boardAfterGravity: _boardAfterGravity,
    newSymbols: _newSymbols,
    multiplierCoreCells: _multiplierCoreCells,
    ...wire
  } = tumble;
  return wire;
}

function compactSpinResultForWire(result: SpinResult): WireSpinResult {
  return {
    ...result,
    tumbles: result.tumbles.map(compactTumbleForWire),
    freeSpins: result.freeSpins.map((freeSpin) => ({
      ...freeSpin,
      tumbles: freeSpin.tumbles.map(compactTumbleForWire),
    })),
  };
}

type PreparedSlotSpin = {
  input: { stakeCents: number; idempotencyKey: string };
  result: SpinResult;
  wireResult: WireSpinResult;
  serializedWireResult: string;
  roundId: string;
  debitCents: number;
  payoutCents: number;
};

function response(
  sessionId: string,
  balanceCents: number,
  roundId: string,
  result: SpinResult | WireSpinResult,
) {
  return {
    roundId,
    result: compactSpinResultForWire(result as SpinResult),
    wallet: { sessionId, balanceCents },
  };
}

export class SlotRepository {
  async getState(sessionId: string) {
    await ensureBigMoneyStorage();
    return {
      wallet: { sessionId, balanceCents: await walletBalance(sessionId) },
    };
  }

  async migrateLegacyBalance(sessionId: string, legacyBalanceCents: number) {
    await ensureBigMoneyStorage();
    if (!Number.isSafeInteger(legacyBalanceCents) || legacyBalanceCents < 0 || legacyBalanceCents > 1_000_000_000) {
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

  prepareSpin(input: { stakeCents: number; idempotencyKey: string }): PreparedSlotSpin {
    validateInput(input.stakeCents, input.idempotencyKey);

    const isFreeBet = input.stakeCents === FREE_BET_CENTS;
    const result = playSpin(input.stakeCents, new SeededRNG(randomUUID()));
    const wireResult = compactSpinResultForWire(result);
    return {
      input,
      result,
      wireResult,
      serializedWireResult: JSON.stringify(wireResult),
      roundId: randomUUID(),
      debitCents: isFreeBet ? 0 : input.stakeCents,
      payoutCents: result.totalWinCents,
    };
  }

  async settlePreparedSpin(sessionId: string, prepared: PreparedSlotSpin) {
    await ensureBigMoneyStorage();

    type AtomicSpinRow = SlotRoundRow & WalletRow & {
      outcome: "SETTLED" | "DUPLICATE" | "INSUFFICIENT";
      existing_session_id: string;
      result: SpinResult | null;
    };

    const atomic = await pool.query<AtomicSpinRow>(
      `WITH lock_key AS MATERIALIZED (
         SELECT pg_advisory_xact_lock(hashtextextended($7::text, 0)) AS locked
       ),
       duplicate AS MATERIALIZED (
         SELECT r.*
           FROM slot_rounds r
           CROSS JOIN lock_key
          WHERE r.idempotency_key = $7
          LIMIT 1
       ),
       settled_wallet AS (
         INSERT INTO shared_wallets (session_id, balance_cents, updated_at)
         SELECT $2::text, $13::bigint + $1::bigint, now()
          WHERE NOT EXISTS (SELECT 1 FROM duplicate)
            AND ($10::bigint = 0 OR $13::bigint >= $10::bigint)
         ON CONFLICT (session_id) DO UPDATE
           SET balance_cents = shared_wallets.balance_cents + $1::bigint,
               updated_at = now()
         WHERE NOT EXISTS (SELECT 1 FROM duplicate)
           AND ($10::bigint = 0 OR shared_wallets.balance_cents >= $10::bigint)
         RETURNING balance_cents
       ),
       inserted_round AS (
         INSERT INTO slot_rounds
           (id, session_id, stake_cents, payout_cents, result, idempotency_key)
         SELECT $3::text, $2::text, $4::bigint, $5::bigint, $6::jsonb, $7::text
          WHERE EXISTS (SELECT 1 FROM settled_wallet)
         RETURNING id, session_id, stake_cents, payout_cents, idempotency_key, created_at
       ),
       inserted_ledger AS (
         INSERT INTO slot_ledger
           (id, session_id, round_id, kind, amount_cents, idempotency_key)
         SELECT entries.*
           FROM (VALUES
             ($8::text, $2::text, $3::text, 'STAKE_DEBIT'::text, ($10::bigint * -1), $11::text),
             ($9::text, $2::text, $3::text, 'PAYOUT_CREDIT'::text, $5::bigint, $12::text)
           ) AS entries(id, session_id, round_id, kind, amount_cents, idempotency_key)
          WHERE EXISTS (SELECT 1 FROM inserted_round)
            AND (entries.kind <> 'STAKE_DEBIT' OR $10::bigint > 0)
         RETURNING id
       ),
       settled_result AS (
         SELECT 'SETTLED'::text AS outcome,
                inserted_round.id,
                inserted_round.session_id,
                inserted_round.stake_cents,
                inserted_round.payout_cents,
                NULL::jsonb AS result,
                inserted_round.idempotency_key,
                inserted_round.created_at,
                settled_wallet.balance_cents,
                inserted_round.session_id AS existing_session_id,
                (SELECT count(*) FROM inserted_ledger) AS ledger_count
           FROM inserted_round
           CROSS JOIN settled_wallet
       ),
       duplicate_result AS (
         SELECT 'DUPLICATE'::text AS outcome,
                duplicate.*,
                COALESCE(
                  (SELECT balance_cents FROM shared_wallets WHERE session_id = $2),
                  $13::bigint
                ) AS balance_cents,
                duplicate.session_id AS existing_session_id,
                0::bigint AS ledger_count
           FROM duplicate
       ),
       insufficient_result AS (
         SELECT 'INSUFFICIENT'::text AS outcome,
                NULL::text AS id,
                $2::text AS session_id,
                $4::bigint AS stake_cents,
                0::bigint AS payout_cents,
                NULL::jsonb AS result,
                $7::text AS idempotency_key,
                now() AS created_at,
                COALESCE(
                  (SELECT balance_cents FROM shared_wallets WHERE session_id = $2),
                  $13::bigint
                ) AS balance_cents,
                $2::text AS existing_session_id,
                0::bigint AS ledger_count
          WHERE NOT EXISTS (SELECT 1 FROM duplicate)
            AND NOT EXISTS (SELECT 1 FROM settled_wallet)
       )
       SELECT outcome, id, session_id, stake_cents, payout_cents, result,
              idempotency_key, created_at, balance_cents, existing_session_id
         FROM settled_result
       UNION ALL
       SELECT outcome, id, session_id, stake_cents, payout_cents, result,
              idempotency_key, created_at, balance_cents, existing_session_id
         FROM duplicate_result
       UNION ALL
       SELECT outcome, id, session_id, stake_cents, payout_cents, result,
              idempotency_key, created_at, balance_cents, existing_session_id
         FROM insufficient_result
       LIMIT 1`,
      [
        prepared.payoutCents - prepared.debitCents,
        sessionId,
        prepared.roundId,
        prepared.input.stakeCents,
        prepared.payoutCents,
        prepared.serializedWireResult,
        prepared.input.idempotencyKey,
        randomUUID(),
        randomUUID(),
        prepared.debitCents,
        `stake:${prepared.input.idempotencyKey}`,
        `payout:${prepared.roundId}`,
        INITIAL_SHARED_BALANCE_CENTS,
      ],
    );

    const row = atomic.rows[0];
    if (!row) throw new Error("SLOT_SETTLEMENT_FAILED");
    if (row.outcome === "INSUFFICIENT") throw new Error("INSUFFICIENT_SLOT_CREDITS");
    if (row.outcome === "DUPLICATE" && row.existing_session_id !== sessionId) {
      throw new Error("IDEMPOTENCY_KEY_REUSED");
    }

    const responseRoundId = row.outcome === "DUPLICATE" ? row.id : prepared.roundId;
    const responseResult = row.outcome === "DUPLICATE" && row.result
      ? row.result
      : prepared.wireResult;

    return response(sessionId, Number(row.balance_cents), responseRoundId, responseResult);
  }

  async spin(sessionId: string, input: { stakeCents: number; idempotencyKey: string }) {
    const prepared = this.prepareSpin(input);
    return this.settlePreparedSpin(sessionId, prepared);
  }
}

export const slotRepository = new SlotRepository();