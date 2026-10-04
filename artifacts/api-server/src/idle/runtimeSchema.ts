import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";

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
  `);
}

/**
 * Idempotent runtime guard for the canonical Stadium schema.
 *
 * Replit preview can receive owned game code before an operator runs a
 * workspace-wide Drizzle push. Idle therefore bootstraps only its own new
 * canonical tables/indexes and never mutates shared/platform tables.
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
