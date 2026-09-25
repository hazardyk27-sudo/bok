import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import {
  IDLE_BUSINESS_IDS,
  type IdleBusinessId,
  type IdleBusinessStorageState,
} from "./storage";

type IdleBusinessRow = {
  id: string;
  session_id: string;
  business_id: IdleBusinessId;
  business_level: number | null;
  vault_level: number;
  accrued_microcents: number;
  checkpoint_at: Date;
  created_at: Date;
  updated_at: Date;
};

function toStorageState(row: IdleBusinessRow): IdleBusinessStorageState {
  return {
    id: row.id,
    sessionId: row.session_id,
    businessId: row.business_id,
    businessLevel: row.business_level === null ? null : Number(row.business_level),
    vaultLevel: Number(row.vault_level),
    accruedMicrocents: Number(row.accrued_microcents),
    checkpointAt: row.checkpoint_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertMissingSessionStates(client: PoolClient, sessionId: string) {
  const ids = IDLE_BUSINESS_IDS.map(() => randomUUID());
  await client.query(
    `INSERT INTO idle_business_states
       (id, session_id, business_id, business_level, vault_level, accrued_microcents, checkpoint_at)
     VALUES
       ($1, $4, $5, NULL, 1, 0, now()),
       ($2, $4, $6, NULL, 1, 0, now()),
       ($3, $4, $7, NULL, 1, 0, now())
     ON CONFLICT (session_id, business_id) DO NOTHING`,
    [
      ids[0],
      ids[1],
      ids[2],
      sessionId,
      IDLE_BUSINESS_IDS[0],
      IDLE_BUSINESS_IDS[1],
      IDLE_BUSINESS_IDS[2],
    ],
  );
}

async function loadSessionStates(client: PoolClient, sessionId: string, forUpdate = false) {
  const result = await client.query<IdleBusinessRow>(
    `SELECT id, session_id, business_id, business_level, vault_level,
            accrued_microcents, checkpoint_at, created_at, updated_at
       FROM idle_business_states
      WHERE session_id = $1
      ORDER BY CASE business_id
        WHEN 'stadium' THEN 1
        WHEN 'club-store' THEN 2
        WHEN 'fan-club' THEN 3
        ELSE 4
      END
      ${forUpdate ? "FOR UPDATE" : ""}`,
    [sessionId],
  );
  return result.rows.map(toStorageState);
}

export class IdleRepository {
  /**
   * Ensures every session owns exactly one persistent state row per business.
   * New businesses start unpurchased with Kasa Lv1 and zero accrued income.
   */
  async ensureSessionState(sessionId: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertMissingSessionStates(client, sessionId);
      const states = await loadSessionStates(client, sessionId);
      if (states.length !== IDLE_BUSINESS_IDS.length) {
        throw new Error("IDLE_SESSION_STATE_INCOMPLETE");
      }
      await client.query("COMMIT");
      return states;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const idleRepository = new IdleRepository();
