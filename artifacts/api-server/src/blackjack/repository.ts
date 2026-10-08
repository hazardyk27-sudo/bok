import { createHash, randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import type {
  BlackjackServerActionRequest,
  BlackjackServerSnapshot,
} from "../../../cascade-8/src/blackjack/serverContract";
import type { BlackjackRoundState } from "../../../cascade-8/src/blackjack/roundState";
import type { BlackjackShoe } from "../../../cascade-8/src/blackjack/shoe";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";
import {
  createBlackjackServerSession,
  snapshotBlackjackServerSession,
  transitionBlackjackServerSession,
  type BlackjackServerTableSession,
} from "./serverTable";
import {
  planBlackjackWalletMutation,
  type BlackjackWalletMutationPlan,
} from "./walletAccounting";

type WalletRow = {
  balance_cents: number | string;
};

type BlackjackTableRow = {
  session_id: string;
  revision: number | string;
  round_id: string | null;
  round_state: BlackjackRoundState | null;
  shoe_state: BlackjackShoe;
};

type BlackjackReceiptRow = {
  session_id: string;
  request_hash: string;
  response_json: BlackjackServerSnapshot;
};

const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{12,100}$/;
let storageReady: Promise<void> | null = null;

async function ensureBlackjackStorage(): Promise<void> {
  if (storageReady) return storageReady;

  storageReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blackjack_table_states (
        session_id TEXT PRIMARY KEY,
        revision BIGINT NOT NULL DEFAULT 0,
        round_id TEXT,
        round_state JSONB,
        shoe_state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blackjack_rounds (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        initial_stake_cents BIGINT NOT NULL,
        total_stake_cents BIGINT NOT NULL,
        payout_cents BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        result JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        completed_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS blackjack_rounds_session_idx
        ON blackjack_rounds (session_id, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blackjack_action_receipts (
        idempotency_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        round_id TEXT,
        action TEXT NOT NULL,
        expected_revision BIGINT NOT NULL,
        request_hash TEXT NOT NULL,
        request_json JSONB NOT NULL,
        response_json JSONB NOT NULL,
        wallet_delta_cents BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS blackjack_action_receipts_session_idx
        ON blackjack_action_receipts (session_id, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blackjack_ledger (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        round_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        amount_cents BIGINT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS blackjack_ledger_session_idx
        ON blackjack_ledger (session_id, created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS blackjack_ledger_round_idx
        ON blackjack_ledger (round_id, created_at)
    `);
  })().catch((error) => {
    storageReady = null;
    throw error;
  });

  return storageReady;
}

function validateIdempotencyKey(value: string): void {
  if (!IDEMPOTENCY_PATTERN.test(value)) {
    throw new Error("BLACKJACK_INVALID_IDEMPOTENCY_KEY");
  }
}

function canonicalRequest(request: BlackjackServerActionRequest): string {
  const seats = request.seats
    ? [...request.seats]
        .map((seat) => ({ seatId: Number(seat.seatId), wager: Number(seat.wager) }))
        .sort((left, right) => left.seatId - right.seatId)
    : null;

  return JSON.stringify({
    expectedRevision: request.expectedRevision,
    action: request.action,
    seats,
  });
}

function requestHash(request: BlackjackServerActionRequest): string {
  return createHash("sha256").update(canonicalRequest(request)).digest("hex");
}

function safeBalanceNumber(value: number | string | bigint): number {
  const balance = Number(value);
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new Error("BLACKJACK_BALANCE_OUT_OF_RANGE");
  }
  return balance;
}

async function lockKey(client: PoolClient, value: string): Promise<void> {
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))",
    [value],
  );
}

async function ensureWalletForUpdate(
  client: PoolClient,
  sessionId: string,
): Promise<bigint> {
  await client.query(
    `INSERT INTO shared_wallets (session_id, balance_cents, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  const result = await client.query<WalletRow>(
    `SELECT balance_cents
       FROM shared_wallets
      WHERE session_id = $1
      FOR UPDATE`,
    [sessionId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("BLACKJACK_WALLET_NOT_FOUND");
  return BigInt(String(row.balance_cents));
}

function rowToSession(row: BlackjackTableRow): BlackjackServerTableSession {
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("BLACKJACK_STATE_REVISION_INVALID");
  }

  return {
    revision,
    roundId: row.round_id,
    round: row.round_state,
    shoe: row.shoe_state,
  };
}

async function ensureTableStateForUpdate(
  client: PoolClient,
  sessionId: string,
): Promise<BlackjackServerTableSession> {
  let result = await client.query<BlackjackTableRow>(
    `SELECT session_id, revision, round_id, round_state, shoe_state
       FROM blackjack_table_states
      WHERE session_id = $1
      FOR UPDATE`,
    [sessionId],
  );

  if (result.rows[0]) return rowToSession(result.rows[0]);

  const created = createBlackjackServerSession();
  await client.query(
    `INSERT INTO blackjack_table_states
      (session_id, revision, round_id, round_state, shoe_state, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now())`,
    [
      sessionId,
      created.revision,
      created.roundId,
      created.round ? JSON.stringify(created.round) : null,
      JSON.stringify(created.shoe),
    ],
  );

  result = await client.query<BlackjackTableRow>(
    `SELECT session_id, revision, round_id, round_state, shoe_state
       FROM blackjack_table_states
      WHERE session_id = $1
      FOR UPDATE`,
    [sessionId],
  );
  const row = result.rows[0];
  if (!row) throw new Error("BLACKJACK_STATE_CREATE_FAILED");
  return rowToSession(row);
}

async function persistTableState(
  client: PoolClient,
  sessionId: string,
  next: BlackjackServerTableSession,
): Promise<void> {
  await client.query(
    `UPDATE blackjack_table_states
        SET revision = $2,
            round_id = $3,
            round_state = $4::jsonb,
            shoe_state = $5::jsonb,
            updated_at = now()
      WHERE session_id = $1`,
    [
      sessionId,
      next.revision,
      next.roundId,
      next.round ? JSON.stringify(next.round) : null,
      JSON.stringify(next.shoe),
    ],
  );
}

async function existingReceipt(
  client: PoolClient,
  idempotencyKey: string,
): Promise<BlackjackReceiptRow | null> {
  const result = await client.query<BlackjackReceiptRow>(
    `SELECT session_id, request_hash, response_json
       FROM blackjack_action_receipts
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return result.rows[0] ?? null;
}

async function writeLedger(
  client: PoolClient,
  sessionId: string,
  roundId: string,
  request: BlackjackServerActionRequest,
  plan: BlackjackWalletMutationPlan,
): Promise<void> {
  if (plan.debitCents > 0 && plan.debitKind) {
    await client.query(
      `INSERT INTO blackjack_ledger
        (id, session_id, round_id, kind, amount_cents, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        randomUUID(),
        sessionId,
        roundId,
        plan.debitKind,
        plan.debitCents * -1,
        `${plan.debitKind}:${request.idempotencyKey}`,
      ],
    );
  }

  if (plan.payoutCreditCents > 0) {
    await client.query(
      `INSERT INTO blackjack_ledger
        (id, session_id, round_id, kind, amount_cents, idempotency_key)
       VALUES ($1, $2, $3, 'PAYOUT_CREDIT', $4, $5)`,
      [
        randomUUID(),
        sessionId,
        roundId,
        plan.payoutCreditCents,
        `PAYOUT_CREDIT:${request.idempotencyKey}`,
      ],
    );
  }
}

async function updateRoundAudit(
  client: PoolClient,
  sessionId: string,
  current: BlackjackServerTableSession,
  next: BlackjackServerTableSession,
  request: BlackjackServerActionRequest,
  plan: BlackjackWalletMutationPlan,
): Promise<void> {
  if (request.action === "deal") {
    const roundId = next.roundId;
    if (!roundId || !next.round) throw new Error("BLACKJACK_ROUND_CREATE_FAILED");

    const complete = next.round.phase === "complete";
    await client.query(
      `INSERT INTO blackjack_rounds
        (id, session_id, initial_stake_cents, total_stake_cents,
         payout_cents, status, result, completed_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6::jsonb,
         CASE WHEN $5 = 'COMPLETE' THEN now() ELSE NULL END)`,
      [
        roundId,
        sessionId,
        plan.debitCents,
        plan.payoutCreditCents,
        complete ? "COMPLETE" : "ACTIVE",
        complete ? JSON.stringify(next.round) : null,
      ],
    );
    return;
  }

  const roundId = current.roundId ?? next.roundId;
  if (!roundId || request.action === "next") return;

  if (plan.debitCents > 0) {
    await client.query(
      `UPDATE blackjack_rounds
          SET total_stake_cents = total_stake_cents + $2::bigint
        WHERE id = $1 AND session_id = $3`,
      [roundId, plan.debitCents, sessionId],
    );
  }

  if (
    next.round?.phase === "complete" &&
    current.round?.phase !== "complete"
  ) {
    await client.query(
      `UPDATE blackjack_rounds
          SET payout_cents = $2,
              status = 'COMPLETE',
              result = $3::jsonb,
              completed_at = now()
        WHERE id = $1 AND session_id = $4`,
      [roundId, plan.payoutCreditCents, JSON.stringify(next.round), sessionId],
    );
  }
}

export class BlackjackRepository {
  async getState(sessionId: string): Promise<BlackjackServerSnapshot> {
    await ensureBlackjackStorage();
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await lockKey(client, `blackjack:session:${sessionId}`);
      const balance = await ensureWalletForUpdate(client, sessionId);
      const state = await ensureTableStateForUpdate(client, sessionId);
      const snapshot = snapshotBlackjackServerSession(
        state,
        safeBalanceNumber(balance),
      );
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async applyAction(
    sessionId: string,
    request: BlackjackServerActionRequest,
  ): Promise<BlackjackServerSnapshot> {
    await ensureBlackjackStorage();
    validateIdempotencyKey(request.idempotencyKey);

    const hash = requestHash(request);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await lockKey(client, `blackjack:idem:${request.idempotencyKey}`);
      await lockKey(client, `blackjack:session:${sessionId}`);

      const duplicate = await existingReceipt(client, request.idempotencyKey);
      if (duplicate) {
        if (duplicate.session_id !== sessionId || duplicate.request_hash !== hash) {
          throw new Error("BLACKJACK_IDEMPOTENCY_KEY_REUSED");
        }
        await client.query("COMMIT");
        return duplicate.response_json;
      }

      const walletBalance = await ensureWalletForUpdate(client, sessionId);
      const current = await ensureTableStateForUpdate(client, sessionId);
      const next = transitionBlackjackServerSession(current, request);
      const plan = planBlackjackWalletMutation(current, next, request);
      const debit = BigInt(plan.debitCents);

      if (walletBalance < debit) {
        throw new Error("INSUFFICIENT_BLACKJACK_CREDITS");
      }

      const nextBalance = walletBalance + BigInt(plan.netDeltaCents);
      if (nextBalance < 0n) {
        throw new Error("INSUFFICIENT_BLACKJACK_CREDITS");
      }

      await client.query(
        `UPDATE shared_wallets
            SET balance_cents = $2::bigint,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, nextBalance.toString()],
      );

      await persistTableState(client, sessionId, next);
      await updateRoundAudit(client, sessionId, current, next, request, plan);

      const roundId = next.roundId ?? current.roundId;
      if (roundId) {
        await writeLedger(client, sessionId, roundId, request, plan);
      }

      const response = snapshotBlackjackServerSession(
        next,
        safeBalanceNumber(nextBalance),
      );

      await client.query(
        `INSERT INTO blackjack_action_receipts
          (idempotency_key, session_id, round_id, action, expected_revision,
           request_hash, request_json, response_json, wallet_delta_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`,
        [
          request.idempotencyKey,
          sessionId,
          roundId,
          request.action,
          request.expectedRevision,
          hash,
          JSON.stringify(request),
          JSON.stringify(response),
          plan.netDeltaCents,
        ],
      );

      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const blackjackRepository = new BlackjackRepository();
