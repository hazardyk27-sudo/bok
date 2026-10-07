import { randomUUID } from "node:crypto";
import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";
import { calculateInvestedCapitalCents } from "./investmentCapital";

let schemaReadyPromise: Promise<void> | null = null;

async function applyIdleRuntimeSchema() {
  const { pool } = await import("@workspace/db");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS idle_stadium_states (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      stadium_level integer NOT NULL DEFAULT 1,
      owned_seats integer NOT NULL DEFAULT 0,
      speed_level integer NOT NULL DEFAULT 1,
      storage_level integer NOT NULL DEFAULT 1,
      stored_microtickets bigint NOT NULL DEFAULT 0,
      sale_remainder_microdollars bigint NOT NULL DEFAULT 0,
      production_checkpoint_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS
      idle_stadium_states_session_unique
      ON idle_stadium_states (session_id);

    CREATE INDEX IF NOT EXISTS
      idle_stadium_states_checkpoint_idx
      ON idle_stadium_states (production_checkpoint_at);

    CREATE TABLE IF NOT EXISTS idle_ticket_market_state (
      id text PRIMARY KEY,
      price_microdollars bigint NOT NULL,
      source text NOT NULL,
      feed_status text NOT NULL,
      tick_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS
      idle_ticket_market_state_tick_idx
      ON idle_ticket_market_state (tick_at);

    CREATE TABLE IF NOT EXISTS idle_ticket_market_price_epochs (
      epoch integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );

    WITH newly_applied_epoch AS (
      INSERT INTO idle_ticket_market_price_epochs (epoch)
      VALUES (${MARKET_CONFIG.priceEpoch})
      ON CONFLICT (epoch) DO NOTHING
      RETURNING epoch
    )
    UPDATE idle_ticket_market_state
       SET price_microdollars = ${MARKET_CONFIG.initialTicketPriceMicrodollars},
           source = 'none',
           feed_status = 'FROZEN',
           tick_at = now(),
           updated_at = now()
     WHERE id = 'global'
       AND EXISTS (SELECT 1 FROM newly_applied_epoch);

    CREATE TABLE IF NOT EXISTS idle_ticket_market_ticks (
      id text PRIMARY KEY,
      price_microdollars bigint NOT NULL,
      source text NOT NULL,
      tick_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS
      idle_ticket_market_ticks_tick_unique
      ON idle_ticket_market_ticks (tick_at);

    CREATE INDEX IF NOT EXISTS
      idle_ticket_market_ticks_retention_idx
      ON idle_ticket_market_ticks (tick_at);

    CREATE TABLE IF NOT EXISTS idle_stadium_action_receipts (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      action_type text NOT NULL,
      idempotency_key text NOT NULL,
      requested_quantity integer,
      target_level integer,
      purchased_seats integer NOT NULL DEFAULT 0,
      cost_cents bigint NOT NULL DEFAULT 0,
      resulting_owned_seats integer,
      balance_cents bigint NOT NULL DEFAULT 0,
      sold_tickets integer NOT NULL DEFAULT 0,
      execution_price_microdollars bigint NOT NULL DEFAULT 0,
      gross_sale_microdollars bigint NOT NULL DEFAULT 0,
      wallet_credit_cents bigint NOT NULL DEFAULT 0,
      sale_remainder_microdollars bigint NOT NULL DEFAULT 0,
      market_source text,
      market_feed_status text,
      market_tick_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS
      idle_stadium_action_receipts_idempotency_unique
      ON idle_stadium_action_receipts (idempotency_key);

    CREATE INDEX IF NOT EXISTS
      idle_stadium_action_receipts_session_idx
      ON idle_stadium_action_receipts (session_id);

    CREATE INDEX IF NOT EXISTS
      idle_stadium_action_receipts_action_idx
      ON idle_stadium_action_receipts (action_type);

    CREATE INDEX IF NOT EXISTS
      idle_stadium_action_receipts_retention_idx
      ON idle_stadium_action_receipts (created_at);

    CREATE TABLE IF NOT EXISTS idle_investment_ledger (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      business_id text NOT NULL,
      action_type text NOT NULL,
      amount_cents bigint NOT NULL DEFAULT 0,
      idempotency_key text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS
      idle_investment_ledger_idempotency_unique
      ON idle_investment_ledger (idempotency_key);

    CREATE INDEX IF NOT EXISTS
      idle_investment_ledger_session_idx
      ON idle_investment_ledger (session_id);
  `);

  const baselineRows = await pool.query<{
    session_id: string;
    stadium_level: string | number;
    owned_seats: string | number;
    speed_level: string | number;
    storage_level: string | number;
  }>(
    `SELECT s.session_id, s.stadium_level, s.owned_seats,
            s.speed_level, s.storage_level
       FROM idle_stadium_states s
      WHERE NOT EXISTS (
        SELECT 1
          FROM idle_investment_ledger i
         WHERE i.idempotency_key =
               'IDLE_INVESTMENT_BASELINE_V1:' || s.session_id
      )`,
  );

  for (const row of baselineRows.rows) {
    const capitalCents = calculateInvestedCapitalCents({
      stadiumLevel: Number(row.stadium_level),
      ownedSeats: Number(row.owned_seats),
      speedLevel: Number(row.speed_level),
      storageLevel: Number(row.storage_level),
    });

    await pool.query(
      `INSERT INTO idle_investment_ledger
         (id, session_id, business_id, action_type,
          amount_cents, idempotency_key)
       VALUES ($1, $2, 'stadium', 'BASELINE', $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        randomUUID(),
        row.session_id,
        capitalCents,
        `IDLE_INVESTMENT_BASELINE_V1:${row.session_id}`,
      ],
    );
  }
}

/**
 * Idempotent runtime guard for the canonical Stadium schema.
 *
 * Replit preview can receive owned game code before an operator runs a
 * workspace-wide Drizzle push. Idle therefore bootstraps only its own new
 * canonical tables/indexes and never mutates shared/platform tables.
 *
 * The permanent investment ledger is intentionally NOT part of the 3-day
 * Stadium action-receipt cleanup. Existing Stadium progress receives one
 * immutable baseline row; all later investment costs are recorded exactly at
 * transaction time.
 *
 * A new MARKET_CONFIG.priceEpoch also performs exactly one global price
 * rebase to the canonical bootstrap value. Once that epoch marker exists,
 * later process restarts preserve the persisted live ticket price.
 */
export function ensureIdleRuntimeSchema() {
  if (schemaReadyPromise) {
    return schemaReadyPromise;
  }

  schemaReadyPromise =
    applyIdleRuntimeSchema().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });

  return schemaReadyPromise;
}
