import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";
import { INITIAL_ROULETTE_BALANCE_CENTS } from "../roulette/types";
import {
  CLUB_STORE_BUSINESS,
  FAN_CLUB_BUSINESS,
  STADIUM_BUSINESS,
  VAULT_LEVELS,
  VAULT_UPGRADE_STEPS,
} from "../../../cascade-8/src/idle/config";
import { MILLISECONDS_PER_DAY } from "../../../cascade-8/src/idle/utils";
import {
  IDLE_BUSINESS_IDS,
  IDLE_MICROCENTS_PER_CENT,
  type IdleBusinessId,
  type IdleBusinessStorageState,
} from "./storage";
import { settleIdleMicrocents } from "./money";
import { assertIdleActionReceiptReplay } from "./policy";

type IdleActionReceiptRow = {
  session_id: string;
  business_id: IdleBusinessId;
  action_type: string;
  collected_cents: number;
  remainder_microcents: number;
  cost_cents: number;
  target_business_level: number | null;
  target_vault_level: number | null;
  balance_cents: number;
};

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

export type IdleBusinessAccrualProjection = IdleBusinessStorageState & {
  serverNow: Date;
  elapsedMs: number;
  vaultCapacityMicrocents: number;
  earnedSinceCheckpointMicrocents: number;
  creditedSinceCheckpointMicrocents: number;
  projectedAccruedMicrocents: number;
  remainingCapacityMicrocents: number;
  isVaultFull: boolean;
};

const BUSINESS_CONFIGS = {
  stadium: STADIUM_BUSINESS,
  "club-store": CLUB_STORE_BUSINESS,
  "fan-club": FAN_CLUB_BUSINESS,
} as const;

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

function requireCompleteState(states: readonly IdleBusinessStorageState[]) {
  if (states.length !== IDLE_BUSINESS_IDS.length) {
    throw new Error("IDLE_SESSION_STATE_INCOMPLETE");
  }
}

async function ensureWalletForUpdate(client: PoolClient, sessionId: string) {
  await client.query(
    `INSERT INTO roulette_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_ROULETTE_BALANCE_CENTS],
  );
  const result = await client.query<{ balance_cents: number }>(
    "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1 FOR UPDATE",
    [sessionId],
  );
  return Number(result.rows[0]?.balance_cents ?? INITIAL_ROULETTE_BALANCE_CENTS);
}

async function sharedWalletBalance(sessionId: string) {
  const existing = await pool.query<{ balance_cents: number }>(
    "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1",
    [sessionId],
  );
  if (existing.rows[0]) return Number(existing.rows[0].balance_cents);

  await pool.query(
    `INSERT INTO roulette_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_ROULETTE_BALANCE_CENTS],
  );

  const created = await pool.query<{ balance_cents: number }>(
    "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1",
    [sessionId],
  );
  return Number(created.rows[0]?.balance_cents ?? INITIAL_ROULETTE_BALANCE_CENTS);
}

function exactMicrocentsForElapsed(dailyIncomeCents: number, elapsedMs: number) {
  const numerator = BigInt(dailyIncomeCents)
    * BigInt(IDLE_MICROCENTS_PER_CENT)
    * BigInt(elapsedMs);
  return Number(numerator / BigInt(MILLISECONDS_PER_DAY));
}

function exactVaultCapacityMicrocents(dailyIncomeCents: number, capacityHours: number) {
  const numerator = BigInt(dailyIncomeCents)
    * BigInt(IDLE_MICROCENTS_PER_CENT)
    * BigInt(capacityHours);
  return Number(numerator / 24n);
}

/**
 * Projects live passive income from the server clock without writing to SQL.
 * Persistent writes happen only on explicit checkpoint/action boundaries.
 */
export function projectBusinessAccrual(
  state: IdleBusinessStorageState,
  serverNow = new Date(),
): IdleBusinessAccrualProjection {
  const elapsedMs = Math.max(0, Math.floor(serverNow.getTime() - state.checkpointAt.getTime()));

  if (state.businessLevel === null) {
    return {
      ...state,
      serverNow,
      elapsedMs,
      vaultCapacityMicrocents: 0,
      earnedSinceCheckpointMicrocents: 0,
      creditedSinceCheckpointMicrocents: 0,
      projectedAccruedMicrocents: 0,
      remainingCapacityMicrocents: 0,
      isVaultFull: false,
    };
  }

  const business = BUSINESS_CONFIGS[state.businessId];
  const businessLevel = business.levels.find((level) => level.level === state.businessLevel);
  if (!businessLevel) throw new Error("INVALID_IDLE_BUSINESS_LEVEL");

  const vault = VAULT_LEVELS.find((entry) => entry.level === state.vaultLevel);
  if (!vault) throw new Error("INVALID_IDLE_VAULT_LEVEL");

  const vaultCapacityMicrocents = exactVaultCapacityMicrocents(
    businessLevel.dailyIncomeCents,
    vault.capacityHours,
  );
  const earnedSinceCheckpointMicrocents = exactMicrocentsForElapsed(
    businessLevel.dailyIncomeCents,
    elapsedMs,
  );
  const storedMicrocents = Math.max(0, Math.floor(state.accruedMicrocents));
  const availableCapacityMicrocents = Math.max(
    0,
    vaultCapacityMicrocents - storedMicrocents,
  );
  const creditedSinceCheckpointMicrocents = Math.min(
    availableCapacityMicrocents,
    earnedSinceCheckpointMicrocents,
  );
  const projectedAccruedMicrocents = storedMicrocents + creditedSinceCheckpointMicrocents;
  const remainingCapacityMicrocents = Math.max(
    0,
    vaultCapacityMicrocents - projectedAccruedMicrocents,
  );

  return {
    ...state,
    serverNow,
    elapsedMs,
    vaultCapacityMicrocents,
    earnedSinceCheckpointMicrocents,
    creditedSinceCheckpointMicrocents,
    projectedAccruedMicrocents,
    remainingCapacityMicrocents,
    isVaultFull: remainingCapacityMicrocents === 0,
  };
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
      requireCompleteState(states);
      await client.query("COMMIT");
      return states;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Returns server-authoritative live accrual without persisting a ticking
   * balance. The client may animate this projection between requests.
   */
  async getSessionState(sessionId: string, serverNow = new Date()) {
    const [states, balanceCents] = await Promise.all([
      this.ensureSessionState(sessionId),
      sharedWalletBalance(sessionId),
    ]);
    return {
      serverNow,
      wallet: { sessionId, balanceCents },
      businesses: states.map((state) => projectBusinessAccrual(state, serverNow)),
    };
  }

  /**
   * Collects one business at a server-authoritative checkpoint. Whole cents
   * are credited to the shared wallet inside the same SQL transaction, while
   * the sub-cent remainder stays in idle storage.
   */
  async collectBusiness(
    sessionId: string,
    businessId: IdleBusinessId,
    idempotencyKey: string,
    serverNow = new Date(),
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const reserved = await client.query<{ id: string }>(
        `INSERT INTO idle_action_receipts
           (id, session_id, business_id, action_type, idempotency_key)
         VALUES ($1, $2, $3, 'COLLECT', $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [randomUUID(), sessionId, businessId, idempotencyKey],
      );

      if (!reserved.rows[0]) {
        const duplicate = await client.query<IdleActionReceiptRow>(
          `SELECT session_id, business_id, action_type, collected_cents,
                  remainder_microcents, balance_cents
             FROM idle_action_receipts
            WHERE idempotency_key = $1`,
          [idempotencyKey],
        );
        const receipt = duplicate.rows[0];
        if (!receipt) throw new Error("IDLE_IDEMPOTENCY_RECEIPT_MISSING");
        assertIdleActionReceiptReplay(
          {
            sessionId: receipt.session_id,
            businessId: receipt.business_id,
            actionType: receipt.action_type,
          },
          {
            sessionId,
            businessId,
            actionType: "COLLECT",
          },
        );

        await insertMissingSessionStates(client, sessionId);
        const states = await loadSessionStates(client, sessionId);
        requireCompleteState(states);
        const state = states.find((entry) => entry.businessId === businessId);
        if (!state) throw new Error("IDLE_BUSINESS_NOT_FOUND");

        await client.query("COMMIT");
        return {
          serverNow,
          businessId,
          collectedCents: Number(receipt.collected_cents),
          remainderMicrocents: Number(receipt.remainder_microcents),
          balanceCents: Number(receipt.balance_cents),
          business: projectBusinessAccrual(state, serverNow),
          replayed: true,
        };
      }

      await insertMissingSessionStates(client, sessionId);
      const states = await loadSessionStates(client, sessionId, true);
      requireCompleteState(states);

      const state = states.find((entry) => entry.businessId === businessId);
      if (!state) throw new Error("IDLE_BUSINESS_NOT_FOUND");
      if (state.businessLevel === null) throw new Error("IDLE_BUSINESS_NOT_OWNED");

      const projection = projectBusinessAccrual(state, serverNow);
      const settlement = settleIdleMicrocents(
        projection.projectedAccruedMicrocents,
      );

      const walletResult = await client.query<{ balance_cents: number }>(
        `INSERT INTO roulette_wallets (session_id, balance_cents, updated_at)
         VALUES ($1, $2 + $3, now())
         ON CONFLICT (session_id) DO UPDATE
           SET balance_cents = roulette_wallets.balance_cents + $3,
               updated_at = now()
         RETURNING balance_cents`,
        [
          sessionId,
          INITIAL_ROULETTE_BALANCE_CENTS,
          settlement.walletCreditCents,
        ],
      );
      const balanceCents = Number(walletResult.rows[0]?.balance_cents ?? 0);

      await client.query(
        `UPDATE idle_business_states
            SET accrued_microcents = $3,
                checkpoint_at = $4,
                updated_at = now()
          WHERE session_id = $1
            AND business_id = $2`,
        [
          sessionId,
          businessId,
          settlement.remainderMicrocents,
          serverNow,
        ],
      );

      await client.query(
        `INSERT INTO idle_ledger
           (id, session_id, business_id, kind, amount_cents, idempotency_key)
         VALUES ($1, $2, $3, 'COLLECT_CREDIT', $4, $5)`,
        [
          randomUUID(),
          sessionId,
          businessId,
          settlement.walletCreditCents,
          `collect:${idempotencyKey}`,
        ],
      );

      await client.query(
        `UPDATE idle_action_receipts
            SET collected_cents = $2,
                remainder_microcents = $3,
                balance_cents = $4
          WHERE idempotency_key = $1`,
        [
          idempotencyKey,
          settlement.walletCreditCents,
          settlement.remainderMicrocents,
          balanceCents,
        ],
      );

      const refreshedStates = await loadSessionStates(client, sessionId);
      requireCompleteState(refreshedStates);
      const refreshed = refreshedStates.find(
        (entry) => entry.businessId === businessId,
      );
      if (!refreshed) throw new Error("IDLE_BUSINESS_NOT_FOUND");

      await client.query("COMMIT");

      return {
        serverNow,
        businessId,
        collectedCents: settlement.walletCreditCents,
        remainderMicrocents: settlement.remainderMicrocents,
        balanceCents,
        business: projectBusinessAccrual(refreshed, serverNow),
        replayed: false,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Purchases the entry tier or advances exactly one main business level.
   * The old tier accrual is checkpointed first, then the new tier becomes
   * active and its Kasa resets to Lv1 in the same transaction.
   */
  async upgradeBusiness(
    sessionId: string,
    businessId: IdleBusinessId,
    idempotencyKey: string,
    serverNow = new Date(),
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const reserved = await client.query<{ id: string }>(
        `INSERT INTO idle_action_receipts
           (id, session_id, business_id, action_type, idempotency_key)
         VALUES ($1, $2, $3, 'BUSINESS_UPGRADE', $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [randomUUID(), sessionId, businessId, idempotencyKey],
      );

      if (!reserved.rows[0]) {
        const duplicate = await client.query<IdleActionReceiptRow>(
          `SELECT session_id, business_id, action_type, collected_cents,
                  remainder_microcents, cost_cents, target_business_level,
                  balance_cents
             FROM idle_action_receipts
            WHERE idempotency_key = $1`,
          [idempotencyKey],
        );
        const receipt = duplicate.rows[0];
        if (!receipt) throw new Error("IDLE_IDEMPOTENCY_RECEIPT_MISSING");
        if (
          receipt.session_id !== sessionId
          || receipt.business_id !== businessId
          || receipt.action_type !== "BUSINESS_UPGRADE"
          || receipt.target_business_level === null
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }

        await insertMissingSessionStates(client, sessionId);
        const states = await loadSessionStates(client, sessionId);
        requireCompleteState(states);
        const state = states.find((entry) => entry.businessId === businessId);
        if (!state) throw new Error("IDLE_BUSINESS_NOT_FOUND");

        await client.query("COMMIT");
        return {
          serverNow,
          businessId,
          targetBusinessLevel: Number(receipt.target_business_level),
          costCents: Number(receipt.cost_cents),
          balanceCents: Number(receipt.balance_cents),
          business: projectBusinessAccrual(state, serverNow),
          replayed: true,
        };
      }

      await insertMissingSessionStates(client, sessionId);
      const states = await loadSessionStates(client, sessionId, true);
      requireCompleteState(states);

      const state = states.find((entry) => entry.businessId === businessId);
      if (!state) throw new Error("IDLE_BUSINESS_NOT_FOUND");

      const targetBusinessLevel = state.businessLevel === null
        ? 0
        : state.businessLevel + 1;
      const definition = BUSINESS_CONFIGS[businessId];
      const targetStage = definition.levels.find(
        (entry) => entry.level === targetBusinessLevel,
      );
      if (!targetStage) throw new Error("IDLE_BUSINESS_MAX_LEVEL");

      const balanceBeforeCents = await ensureWalletForUpdate(client, sessionId);
      if (balanceBeforeCents < targetStage.costCents) {
        throw new Error("INSUFFICIENT_IDLE_CREDITS");
      }

      const checkpoint = projectBusinessAccrual(state, serverNow);
      const balanceCents = balanceBeforeCents - targetStage.costCents;

      await client.query(
        `UPDATE roulette_wallets
            SET balance_cents = $2,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, balanceCents],
      );

      await client.query(
        `UPDATE idle_business_states
            SET business_level = $3,
                vault_level = 1,
                accrued_microcents = $4,
                checkpoint_at = $5,
                updated_at = now()
          WHERE session_id = $1
            AND business_id = $2`,
        [
          sessionId,
          businessId,
          targetBusinessLevel,
          checkpoint.projectedAccruedMicrocents,
          serverNow,
        ],
      );

      await client.query(
        `INSERT INTO idle_ledger
           (id, session_id, business_id, kind, amount_cents, idempotency_key)
         VALUES ($1, $2, $3, 'BUSINESS_UPGRADE_DEBIT', $4, $5)`,
        [
          randomUUID(),
          sessionId,
          businessId,
          -targetStage.costCents,
          `business-upgrade:${idempotencyKey}`,
        ],
      );

      await client.query(
        `UPDATE idle_action_receipts
            SET cost_cents = $2,
                target_business_level = $3,
                balance_cents = $4
          WHERE idempotency_key = $1`,
        [
          idempotencyKey,
          targetStage.costCents,
          targetBusinessLevel,
          balanceCents,
        ],
      );

      const refreshedStates = await loadSessionStates(client, sessionId);
      requireCompleteState(refreshedStates);
      const refreshed = refreshedStates.find(
        (entry) => entry.businessId === businessId,
      );
      if (!refreshed) throw new Error("IDLE_BUSINESS_NOT_FOUND");

      await client.query("COMMIT");

      return {
        serverNow,
        businessId,
        targetBusinessLevel,
        costCents: targetStage.costCents,
        balanceCents,
        business: projectBusinessAccrual(refreshed, serverNow),
        replayed: false,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Advances the Kasa by exactly one level. Pricing is derived from the
   * currently active main business tier and the approved vault percentage step.
   * Existing accrued money is checkpointed and preserved.
   */
  async upgradeVault(
    sessionId: string,
    businessId: IdleBusinessId,
    idempotencyKey: string,
    serverNow = new Date(),
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const reserved = await client.query<{ id: string }>(
        `INSERT INTO idle_action_receipts
           (id, session_id, business_id, action_type, idempotency_key)
         VALUES ($1, $2, $3, 'VAULT_UPGRADE', $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [randomUUID(), sessionId, businessId, idempotencyKey],
      );

      if (!reserved.rows[0]) {
        const duplicate = await client.query<IdleActionReceiptRow>(
          `SELECT session_id, business_id, action_type, collected_cents,
                  remainder_microcents, cost_cents, target_business_level,
                  target_vault_level, balance_cents
             FROM idle_action_receipts
            WHERE idempotency_key = $1`,
          [idempotencyKey],
        );
        const receipt = duplicate.rows[0];
        if (!receipt) throw new Error("IDLE_IDEMPOTENCY_RECEIPT_MISSING");
        if (
          receipt.session_id !== sessionId
          || receipt.business_id !== businessId
          || receipt.action_type !== "VAULT_UPGRADE"
          || receipt.target_vault_level === null
        ) {
          throw new Error("IDEMPOTENCY_KEY_REUSED");
        }

        await insertMissingSessionStates(client, sessionId);
        const states = await loadSessionStates(client, sessionId);
        requireCompleteState(states);
        const state = states.find((entry) => entry.businessId === businessId);
        if (!state) throw new Error("IDLE_BUSINESS_NOT_FOUND");

        await client.query("COMMIT");
        return {
          serverNow,
          businessId,
          targetVaultLevel: Number(receipt.target_vault_level),
          costCents: Number(receipt.cost_cents),
          balanceCents: Number(receipt.balance_cents),
          business: projectBusinessAccrual(state, serverNow),
          replayed: true,
        };
      }

      await insertMissingSessionStates(client, sessionId);
      const states = await loadSessionStates(client, sessionId, true);
      requireCompleteState(states);

      const state = states.find((entry) => entry.businessId === businessId);
      if (!state) throw new Error("IDLE_BUSINESS_NOT_FOUND");
      if (state.businessLevel === null) throw new Error("IDLE_BUSINESS_NOT_OWNED");

      const step = VAULT_UPGRADE_STEPS.find(
        (entry) => entry.fromLevel === state.vaultLevel,
      );
      if (!step) throw new Error("IDLE_VAULT_MAX_LEVEL");

      const definition = BUSINESS_CONFIGS[businessId];
      const currentStage = definition.levels.find(
        (entry) => entry.level === state.businessLevel,
      );
      if (!currentStage) throw new Error("INVALID_IDLE_BUSINESS_LEVEL");

      const costCents = currentStage.costCents * step.costPercent / 100;
      if (!Number.isSafeInteger(costCents) || costCents < 0) {
        throw new Error("INVALID_IDLE_VAULT_UPGRADE_COST");
      }

      const balanceBeforeCents = await ensureWalletForUpdate(client, sessionId);
      if (balanceBeforeCents < costCents) {
        throw new Error("INSUFFICIENT_IDLE_CREDITS");
      }

      // Checkpoint at the old Kasa capacity first. This prevents a Kasa upgrade
      // from retroactively applying the larger cap to time that already passed.
      const checkpoint = projectBusinessAccrual(state, serverNow);
      const balanceCents = balanceBeforeCents - costCents;

      await client.query(
        `UPDATE roulette_wallets
            SET balance_cents = $2,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, balanceCents],
      );

      await client.query(
        `UPDATE idle_business_states
            SET vault_level = $3,
                accrued_microcents = $4,
                checkpoint_at = $5,
                updated_at = now()
          WHERE session_id = $1
            AND business_id = $2`,
        [
          sessionId,
          businessId,
          step.toLevel,
          checkpoint.projectedAccruedMicrocents,
          serverNow,
        ],
      );

      await client.query(
        `INSERT INTO idle_ledger
           (id, session_id, business_id, kind, amount_cents, idempotency_key)
         VALUES ($1, $2, $3, 'VAULT_UPGRADE_DEBIT', $4, $5)`,
        [
          randomUUID(),
          sessionId,
          businessId,
          -costCents,
          `vault-upgrade:${idempotencyKey}`,
        ],
      );

      await client.query(
        `UPDATE idle_action_receipts
            SET cost_cents = $2,
                target_vault_level = $3,
                balance_cents = $4
          WHERE idempotency_key = $1`,
        [
          idempotencyKey,
          costCents,
          step.toLevel,
          balanceCents,
        ],
      );

      const refreshedStates = await loadSessionStates(client, sessionId);
      requireCompleteState(refreshedStates);
      const refreshed = refreshedStates.find(
        (entry) => entry.businessId === businessId,
      );
      if (!refreshed) throw new Error("IDLE_BUSINESS_NOT_FOUND");

      await client.query("COMMIT");

      return {
        serverNow,
        businessId,
        targetVaultLevel: step.toLevel,
        costCents,
        balanceCents,
        business: projectBusinessAccrual(refreshed, serverNow),
        replayed: false,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Persists one accrual checkpoint for a meaningful action boundary.
   * This is intentionally not a timer/minute write loop.
   */
  async checkpointSessionState(sessionId: string, serverNow = new Date()) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertMissingSessionStates(client, sessionId);
      const states = await loadSessionStates(client, sessionId, true);
      requireCompleteState(states);

      for (const state of states) {
        const projection = projectBusinessAccrual(state, serverNow);
        await client.query(
          `UPDATE idle_business_states
              SET accrued_microcents = $3,
                  checkpoint_at = $4,
                  updated_at = now()
            WHERE session_id = $1
              AND business_id = $2`,
          [
            sessionId,
            state.businessId,
            projection.projectedAccruedMicrocents,
            serverNow,
          ],
        );
      }

      const checkpointed = await loadSessionStates(client, sessionId);
      requireCompleteState(checkpointed);
      await client.query("COMMIT");

      return {
        serverNow,
        businesses: checkpointed.map((state) => projectBusinessAccrual(state, serverNow)),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const idleRepository = new IdleRepository();
