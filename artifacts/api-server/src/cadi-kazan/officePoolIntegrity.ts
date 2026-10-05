import { pool } from "@workspace/db";

// Must match the repository's Office pool advisory lock so retirement and
// ticket claiming cannot mutate the active/ready pool set concurrently.
const OFFICE_POOL_ADVISORY_LOCK = 2_607_075;

export async function retireOfficePoolsWithJackpotLeak(sessionId: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // A duplicate purchase attempt must never retire the pool underneath an
    // already-active round. createRound will reject that purchase normally.
    const activeRound = await client.query<{ id: string }>(
      "SELECT id FROM cadi_kazan_rounds WHERE session_id = $1 AND status = 'ACTIVE' LIMIT 1",
      [sessionId],
    );
    if (activeRound.rows[0]) {
      await client.query("COMMIT");
      return 0;
    }

    await client.query("SELECT pg_advisory_xact_lock($1)", [OFFICE_POOL_ADVISORY_LOCK]);

    // The original 200-ticket generator allowed MICHAEL to appear as a filler
    // on non-jackpot cards. Those pools still have the right outcome counts, so
    // the old distribution-only validation cannot distinguish them from the
    // corrected format. Retire only affected ACTIVE/READY pools; claimed rounds
    // remain immutable and auditable.
    const retired = await client.query(
      `UPDATE cadi_kazan_office_pools p
          SET status = 'EXHAUSTED',
              exhausted_at = COALESCE(exhausted_at, now())
        WHERE p.status IN ('ACTIVE', 'READY')
          AND EXISTS (
            SELECT 1
              FROM cadi_kazan_office_tickets t
             WHERE t.pool_id = p.id
               AND (
                 (
                   t.outcome_symbol IS DISTINCT FROM 'MICHAEL'
                   AND t.office_cells @> '["MICHAEL"]'::jsonb
                 )
                 OR (
                   t.outcome_symbol = 'MICHAEL'
                   AND (
                     SELECT COUNT(*)
                       FROM jsonb_array_elements_text(t.office_cells) AS cell(value)
                      WHERE cell.value = 'MICHAEL'
                   ) <> 3
                 )
               )
          )`,
    );

    await client.query("COMMIT");
    return retired.rowCount ?? 0;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
