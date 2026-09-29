import { randomUUID } from "node:crypto";
import { type PoolClient } from "@workspace/db";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";
import { STADIUM_LEVELS } from "../../../cascade-8/src/idle/config";
import type {
  IdleStadiumLevelUpgradeResponse,
  StadiumLevel,
} from "../../../cascade-8/src/idle/types";
import {
  projectPersistedStadiumState,
  stadiumProjectionToServerState,
} from "./stadiumRepository";
import { runCheckpointedStadiumMutation } from "./stadiumMutation";

const STADIUM_UPGRADE_ACTION = "STADIUM_UPGRADE" as const;

type StadiumUpgradeReceiptRow = {
  session_id: string;
  action_type: string;
  target_level: number | null;
  cost_cents: number;
  balance_cents: number;
};

async function ensureSharedWalletForUpdate(
  client: PoolClient,
  sessionId: string,
) {
  await client.query(
    `INSERT INTO roulette_wallets (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  const result = await client.query<{ balance_cents: number }>(
    `SELECT balance_cents
       FROM roulette_wallets
      WHERE session_id = $1
      FOR UPDATE`,
    [sessionId],
  );

  const balanceCents = Number(
    result.rows[0]?.balance_cents ?? INITIAL_SHARED_BALANCE_CENTS,
  );

  if (!Number.isSafeInteger(balanceCents) || balanceCents < 0) {
    throw new Error("INVALID_IDLE_WALLET_BALANCE");
  }

  return balanceCents;
}

function assertUpgradeReplay(
  receipt: StadiumUpgradeReceiptRow,
  sessionId: string,
) {
  if (
    receipt.session_id !== sessionId
    || receipt.action_type !== STADIUM_UPGRADE_ACTION
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }

  const targetLevel = Number(receipt.target_level);
  if (
    receipt.target_level === null
    || !Number.isInteger(targetLevel)
    || targetLevel < 2
    || targetLevel > 10
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }

  return targetLevel as StadiumLevel;
}

/**
 * Unlocks exactly the next Stadium capacity level.
 *
 * Lv1 is the free baseline created with the canonical Stadium row, so this
 * action only advances Lv1→Lv2 through Lv9→Lv10. The server derives the next
 * level and price from canonical config; the client cannot choose a target
 * level or submit a price.
 *
 * Owned seats are intentionally NOT inspected as an unlock prerequisite.
 * Players may unlock the next Stadium level before filling current capacity.
 */
export async function upgradeStadiumLevel(
  sessionId: string,
  idempotencyKey: string,
  serverNow = new Date(),
): Promise<IdleStadiumLevelUpgradeResponse> {
  const mutation = await runCheckpointedStadiumMutation(
    sessionId,
    serverNow,
    async ({ client, settledState }) => {
      const reserved = await client.query<{ id: string }>(
        `INSERT INTO idle_stadium_action_receipts
           (id, session_id, action_type, idempotency_key)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          sessionId,
          STADIUM_UPGRADE_ACTION,
          idempotencyKey,
        ],
      );

      if (!reserved.rows[0]) {
        const replayResult = await client.query<StadiumUpgradeReceiptRow>(
          `SELECT session_id, action_type, target_level,
                  cost_cents, balance_cents
             FROM idle_stadium_action_receipts
            WHERE idempotency_key = $1`,
          [idempotencyKey],
        );

        const receipt = replayResult.rows[0];
        if (!receipt) {
          throw new Error("IDLE_STADIUM_RECEIPT_MISSING");
        }

        const targetStadiumLevel = assertUpgradeReplay(
          receipt,
          sessionId,
        );

        return {
          patch: {},
          result: {
            targetStadiumLevel,
            costCents: Number(receipt.cost_cents),
            balanceCents: Number(receipt.balance_cents),
            replayed: true,
          },
        };
      }

      const targetLevelNumber = settledState.stadiumLevel + 1;
      const targetConfig = STADIUM_LEVELS.find(
        (entry) => entry.level === targetLevelNumber,
      );

      if (!targetConfig) {
        throw new Error("IDLE_STADIUM_MAX_LEVEL");
      }

      const balanceBeforeCents = await ensureSharedWalletForUpdate(
        client,
        sessionId,
      );

      if (balanceBeforeCents < targetConfig.unlockCostCents) {
        throw new Error("INSUFFICIENT_IDLE_CREDITS");
      }

      const balanceCents =
        balanceBeforeCents - targetConfig.unlockCostCents;

      await client.query(
        `UPDATE roulette_wallets
            SET balance_cents = $2,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, balanceCents],
      );

      await client.query(
        `UPDATE idle_stadium_action_receipts
            SET target_level = $2,
                cost_cents = $3,
                balance_cents = $4
          WHERE idempotency_key = $1`,
        [
          idempotencyKey,
          targetConfig.level,
          targetConfig.unlockCostCents,
          balanceCents,
        ],
      );

      return {
        patch: {
          stadiumLevel: targetConfig.level,
        },
        result: {
          targetStadiumLevel: targetConfig.level,
          costCents: targetConfig.unlockCostCents,
          balanceCents,
          replayed: false,
        },
      };
    },
  );

  const settledProjection = projectPersistedStadiumState(
    mutation.state,
    mutation.state.productionCheckpointAt,
  );

  return {
    serverTime: serverNow.toISOString(),
    targetStadiumLevel: mutation.result.targetStadiumLevel,
    costCents: mutation.result.costCents,
    balanceCents: mutation.result.balanceCents,
    replayed: mutation.result.replayed,
    stadium: stadiumProjectionToServerState(settledProjection),
  };
}
