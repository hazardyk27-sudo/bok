import { type PoolClient } from "@workspace/db";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";
import type {
  IdleSpeedUpgradeResponse,
  SpeedLevel,
} from "../../../cascade-8/src/idle/types";
import {
  projectPersistedStadiumState,
  stadiumProjectionToServerState,
} from "./stadiumRepository";
import { runCheckpointedStadiumMutation } from "./stadiumMutation";
import { reserveStadiumActionReceipt } from "./stadiumActionReceipt";
import { resolveNextSpeedUpgrade } from "./stadiumPolicy";

const SPEED_UPGRADE_ACTION = "SPEED_UPGRADE" as const;

type SpeedUpgradeReceiptRow = {
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
  receipt: SpeedUpgradeReceiptRow,
  sessionId: string,
) {
  if (
    receipt.session_id !== sessionId
    || receipt.action_type !== SPEED_UPGRADE_ACTION
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }

  const targetLevel = Number(receipt.target_level);
  if (
    receipt.target_level === null
    || !Number.isInteger(targetLevel)
    || targetLevel < 2
    || targetLevel > 20
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }

  return targetLevel as SpeedLevel;
}

/**
 * Upgrades the independent ticket-production Speed track by exactly one level.
 *
 * The action has no Stadium-level, seat-count, or Storage prerequisite. All
 * elapsed production is checkpointed first by runCheckpointedStadiumMutation,
 * so the old Speed remains authoritative for the entire pre-upgrade interval.
 */
export async function upgradeStadiumSpeed(
  sessionId: string,
  idempotencyKey: string,
  serverNow = new Date(),
): Promise<IdleSpeedUpgradeResponse> {
  const mutation = await runCheckpointedStadiumMutation(
    sessionId,
    serverNow,
    async ({ client, settledState }) => {
      const reservation = await reserveStadiumActionReceipt(
        client,
        {
          sessionId,
          actionType: "SPEED_UPGRADE",
          idempotencyKey,
        },
      );

      if (!reservation.created) {
        const replayResult = await client.query<SpeedUpgradeReceiptRow>(
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

        const targetSpeedLevel = assertUpgradeReplay(
          receipt,
          sessionId,
        );

        return {
          patch: {},
          result: {
            targetSpeedLevel,
            costCents: Number(receipt.cost_cents),
            balanceCents: Number(receipt.balance_cents),
            replayed: true,
          },
        };
      }

      const balanceBeforeCents = await ensureSharedWalletForUpdate(
        client,
        sessionId,
      );

      const upgrade = resolveNextSpeedUpgrade(
        settledState.speedLevel,
        balanceBeforeCents,
      );
      const balanceCents = upgrade.balanceAfterCents;

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
          upgrade.targetSpeedLevel,
          upgrade.costCents,
          balanceCents,
        ],
      );

      return {
        patch: {
          speedLevel: upgrade.targetSpeedLevel,
        },
        result: {
          targetSpeedLevel: upgrade.targetSpeedLevel,
          costCents: upgrade.costCents,
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
    targetSpeedLevel: mutation.result.targetSpeedLevel,
    costCents: mutation.result.costCents,
    balanceCents: mutation.result.balanceCents,
    replayed: mutation.result.replayed,
    stadium: stadiumProjectionToServerState(settledProjection),
  };
}
