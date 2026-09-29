import { randomUUID } from "node:crypto";
import { type PoolClient } from "@workspace/db";
import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";
import { STADIUM_LEVELS } from "../../../cascade-8/src/idle/config";
import type { IdleSeatPurchaseResponse } from "../../../cascade-8/src/idle/types";
import { quoteSeatPurchase } from "./seatPricing";
import {
  projectPersistedStadiumState,
  stadiumProjectionToServerState,
} from "./stadiumRepository";
import { runCheckpointedStadiumMutation } from "./stadiumMutation";

const SEAT_PURCHASE_ACTION = "SEAT_PURCHASE" as const;

type SeatPurchaseReceiptRow = {
  session_id: string;
  action_type: string;
  requested_quantity: number | null;
  purchased_seats: number;
  cost_cents: number;
  resulting_owned_seats: number | null;
  balance_cents: number;
};

function requireSeatPurchaseQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("INVALID_IDLE_SEAT_PURCHASE_QUANTITY");
  }
  return quantity;
}

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

function assertSeatPurchaseReplay(
  receipt: SeatPurchaseReceiptRow,
  sessionId: string,
  requestedQuantity: number,
) {
  if (
    receipt.session_id !== sessionId
    || receipt.action_type !== SEAT_PURCHASE_ACTION
    || Number(receipt.requested_quantity) !== requestedQuantity
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }

  if (
    !Number.isSafeInteger(Number(receipt.purchased_seats))
    || Number(receipt.purchased_seats) <= 0
    || receipt.resulting_owned_seats === null
  ) {
    throw new Error("IDLE_STADIUM_RECEIPT_INCOMPLETE");
  }
}

/**
 * Purchases seats using server-side pricing only.
 *
 * The client supplies quantity + idempotency key. Price and total cost are
 * always derived after the Stadium row has been locked and elapsed production
 * has been checkpointed under the old seat count.
 */
export async function buyStadiumSeats(
  sessionId: string,
  quantity: number,
  idempotencyKey: string,
  serverNow = new Date(),
): Promise<IdleSeatPurchaseResponse> {
  requireSeatPurchaseQuantity(quantity);

  const mutation = await runCheckpointedStadiumMutation(
    sessionId,
    serverNow,
    async ({ client, settledState }) => {
      const reserved = await client.query<{ id: string }>(
        `INSERT INTO idle_stadium_action_receipts
           (id, session_id, action_type, idempotency_key, requested_quantity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          sessionId,
          SEAT_PURCHASE_ACTION,
          idempotencyKey,
          quantity,
        ],
      );

      if (!reserved.rows[0]) {
        const replayResult = await client.query<SeatPurchaseReceiptRow>(
          `SELECT session_id, action_type, requested_quantity,
                  purchased_seats, cost_cents, resulting_owned_seats,
                  balance_cents
             FROM idle_stadium_action_receipts
            WHERE idempotency_key = $1`,
          [idempotencyKey],
        );

        const receipt = replayResult.rows[0];
        if (!receipt) {
          throw new Error("IDLE_STADIUM_RECEIPT_MISSING");
        }

        assertSeatPurchaseReplay(
          receipt,
          sessionId,
          quantity,
        );

        return {
          patch: {},
          result: {
            purchasedSeats: Number(receipt.purchased_seats),
            costCents: Number(receipt.cost_cents),
            balanceCents: Number(receipt.balance_cents),
            replayed: true,
          },
        };
      }

      const quote = quoteSeatPurchase(
        settledState.ownedSeats,
        quantity,
      );

      const stadiumConfig = STADIUM_LEVELS.find(
        (entry) => entry.level === settledState.stadiumLevel,
      );
      if (!stadiumConfig) {
        throw new Error("INVALID_IDLE_STADIUM_LEVEL");
      }

      if (quote.resultingOwnedSeats > stadiumConfig.maxSeats) {
        throw new Error("IDLE_STADIUM_CAPACITY_EXCEEDED");
      }

      const balanceBeforeCents = await ensureSharedWalletForUpdate(
        client,
        sessionId,
      );

      if (balanceBeforeCents < quote.totalCostCents) {
        throw new Error("INSUFFICIENT_IDLE_CREDITS");
      }

      const balanceCents =
        balanceBeforeCents - quote.totalCostCents;

      await client.query(
        `UPDATE roulette_wallets
            SET balance_cents = $2,
                updated_at = now()
          WHERE session_id = $1`,
        [sessionId, balanceCents],
      );

      await client.query(
        `UPDATE idle_stadium_action_receipts
            SET purchased_seats = $2,
                cost_cents = $3,
                resulting_owned_seats = $4,
                balance_cents = $5
          WHERE idempotency_key = $1`,
        [
          idempotencyKey,
          quantity,
          quote.totalCostCents,
          quote.resultingOwnedSeats,
          balanceCents,
        ],
      );

      return {
        patch: {
          ownedSeats: quote.resultingOwnedSeats,
        },
        result: {
          purchasedSeats: quantity,
          costCents: quote.totalCostCents,
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
    purchasedSeats: mutation.result.purchasedSeats,
    costCents: mutation.result.costCents,
    balanceCents: mutation.result.balanceCents,
    replayed: mutation.result.replayed,
    stadium: stadiumProjectionToServerState(settledProjection),
  };
}
