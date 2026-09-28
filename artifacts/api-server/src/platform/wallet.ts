import { pool } from "@workspace/db";

export const INITIAL_SHARED_BALANCE_CENTS = 100_000;
export const SHARED_WALLET_TABLE = "shared_wallets" as const;

type SharedWalletRecoveryResult = {
  recovered: boolean;
  insertedCount: number;
};

export async function recoverSharedWalletsIfEmpty(): Promise<SharedWalletRecoveryResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('shared-wallet-recovery-v1', 0))",
    );

    const existing = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM shared_wallets",
    );
    const existingCount = Number(existing.rows[0]?.count ?? "0");

    if (existingCount > 0) {
      await client.query("COMMIT");
      return { recovered: false, insertedCount: 0 };
    }

    const recovery = await client.query<{
      negative_count: string;
      inserted_count: string;
    }>(
      `WITH sessions AS (
         SELECT session_id FROM slot_ledger
         UNION
         SELECT session_id FROM cadi_kazan_ledger
         UNION
         SELECT session_id FROM idle_ledger
         UNION
         SELECT session_id FROM idle_business_states
         UNION
         SELECT session_id FROM idle_action_receipts
         UNION
         SELECT session_id FROM slot_rounds
         UNION
         SELECT session_id FROM slot_wallet_migrations
         UNION
         SELECT session_id FROM cadi_kazan_rounds
       ),
       slot_totals AS (
         SELECT session_id, COALESCE(SUM(amount_cents), 0)::bigint AS delta_cents
           FROM slot_ledger
          GROUP BY session_id
       ),
       cadi_totals AS (
         SELECT session_id, COALESCE(SUM(amount_cents), 0)::bigint AS delta_cents
           FROM cadi_kazan_ledger
          GROUP BY session_id
       ),
       idle_totals AS (
         SELECT session_id, COALESCE(SUM(amount_cents), 0)::bigint AS delta_cents
           FROM idle_ledger
          GROUP BY session_id
       ),
       candidates AS (
         SELECT sessions.session_id,
                (
                  $1::bigint
                  + COALESCE(slot_totals.delta_cents, 0)
                  + COALESCE(cadi_totals.delta_cents, 0)
                  + COALESCE(idle_totals.delta_cents, 0)
                )::bigint AS balance_cents
           FROM sessions
           LEFT JOIN slot_totals USING (session_id)
           LEFT JOIN cadi_totals USING (session_id)
           LEFT JOIN idle_totals USING (session_id)
       ),
       negative AS (
         SELECT count(*)::bigint AS count
           FROM candidates
          WHERE balance_cents < 0
       ),
       inserted AS (
         INSERT INTO shared_wallets (session_id, balance_cents, updated_at)
         SELECT session_id, balance_cents, now()
           FROM candidates
          WHERE (SELECT count FROM negative) = 0
         ON CONFLICT (session_id) DO NOTHING
         RETURNING session_id
       )
       SELECT
         (SELECT count::text FROM negative) AS negative_count,
         (SELECT count(*)::text FROM inserted) AS inserted_count`,
      [INITIAL_SHARED_BALANCE_CENTS],
    );

    const negativeCount = Number(recovery.rows[0]?.negative_count ?? "0");
    if (negativeCount > 0) {
      throw new Error("SHARED_WALLET_RECOVERY_NEGATIVE_BALANCE");
    }

    const insertedCount = Number(recovery.rows[0]?.inserted_count ?? "0");
    await client.query("COMMIT");

    return {
      recovered: insertedCount > 0,
      insertedCount,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
