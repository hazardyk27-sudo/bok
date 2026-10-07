import { type PoolClient } from "@workspace/db";
import {
  INITIAL_SHARED_BALANCE_CENTS,
  SHARED_WALLET_TABLE,
} from "../platform/wallet";
import { STORAGE_LEVELS } from "../../../cascade-8/src/idle/config";
import type {
  IdleStorageUpgradeResponse,
  StorageLevel,
} from "../../../cascade-8/src/idle/types";
import {
  projectPersistedStadiumState,
  stadiumProjectionToServerState,
} from "./stadiumRepository";
import { runCheckpointedStadiumMutation } from "./stadiumMutation";
import { reserveStadiumActionReceipt } from "./stadiumActionReceipt";
import { resolveNextStorageUpgrade } from "./stadiumPolicy";
import { recordIdleInvestment } from "./investmentLedger";

const STORAGE_UPGRADE_ACTION = "STORAGE_UPGRADE" as const;

type StorageUpgradeReceiptRow = {
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
    `INSERT INTO ${SHARED_WALLET_TABLE} (session_id, balance_cents)
     VALUES ($1, $2)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, INITIAL_SHARED_BALANCE_CENTS],
  );

  const result = await client.query<{ balance_cents: number }>(
    `SELECT balance_cents
       FROM ${SHARED_WALLET_TABLE}
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
  receipt: StorageUpgradeReceiptRow,
  sessionId: string,
) {
  if (
    receipt.session_id !== sessionId
    || receipt.action_type !== STORAGE_UPGRADE_ACTION
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }

  const targetLevel = Number(receipt.target_level);
  const costCents = Number(receipt.cost_cents);
  const balanceCents = Number(receipt.balance_cents);
  const targetConfig = STORAGE_LEVELS.find(
    (entry) => entry.level === targetLevel,
  );

  if (
    receipt.target_level === null
    || !Number.isInteger(targetLevel)
    || targetLevel < 2
    || targetLevel > 20
    || !targetConfig
    || !Number.isSafeInteger(costCents)
    || costCents !== targetConfig.upgradeCostCents
    || !Number.isSafeInteger(balanceCents)
    || balanceCents < 0
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }

  return targetLevel as StorageLevel;
}

export async function upgradeStadiumStorage(
  sessionId: string,
  idempotencyKey: string,
  serverNow = new Date(),
): Promise<IdleStorageUpgradeResponse> {
  const mutation = await runCheckpointedStadiumMutation(
    sessionId,
    serverNow,
    async ({ client, settledState }) => {
      const reservation = await reserveStadiumActionReceipt(
        client,
        {
          sessionId,
          actionType: "STORAGE_UPGRADE",
          idempotencyKey,
        },
      );

      if (!reservation.created) {
        const replayResult = await client.query<StorageUpgradeReceiptRow>(
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

        const targetStorageLevel = assertUpgradeReplay(
          receipt,
          sessionId,
        );

        const currentBalanceCents =
          await ensureSharedWalletForUpdate(
            client,
            sessionId,
          );

        return {
          patch: {},
          result: {
            targetStorageLevel,
            costCents: Number(receipt.cost_cents),
            balanceCents: currentBalanceCents,
            replayed: true,
          },
        };
      }

      const balanceBeforeCents = await ensureSharedWalletForUpdate(
        client,
        sessionId,
      );

      const upgrade = resolveNextStorageUpgrade(
        settledState.storageLevel,
        balanceBeforeCents,
      );

      await recordIdleInvestment(
        client,
        settledState,
        STORAGE_UPGRADE_ACTION,
        idempotencyKey,
        upgrade.costCents,
      );

      const balanceCents = upgrade.balanceAfterCents;

      await client.query(
        `UPDATE ${SHARED_WALLET_TABLE}
            SET balance_cents = $2,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, balanceCents],
      );

      const receiptUpdate = await client.query<{ id: string }>(
        `UPDATE idle_stadium_action_receipts
            SET target_level = $2,
                cost_cents = $3,
                balance_cents = $4
          WHERE idempotency_key = $1
            AND session_id = $5
            AND action_type = $6
        RETURNING id`,
        [
          idempotencyKey,
          upgrade.targetStorageLevel,
          upgrade.costCents,
          balanceCents,
          sessionId,
          STORAGE_UPGRADE_ACTION,
        ],
      );

      if (!receiptUpdate.rows[0]) {
        throw new Error("IDLE_STADIUM_RECEIPT_UPDATE_CONFLICT");
      }

      return {
        patch: {
          storageLevel: upgrade.targetStorageLevel,
        },
        result: {
          targetStorageLevel: upgrade.targetStorageLevel,
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
    targetStorageLevel: mutation.result.targetStorageLevel,
    costCents: mutation.result.costCents,
    balanceCents: mutation.result.balanceCents,
    replayed: mutation.result.replayed,
    stadium: stadiumProjectionToServerState(settledProjection),
  };
}
