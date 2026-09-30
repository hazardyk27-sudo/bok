import { randomUUID } from "node:crypto";
import type { PoolClient } from "@workspace/db";

export type StadiumActionType =
  | "SEAT_PURCHASE"
  | "STADIUM_UPGRADE"
  | "SPEED_UPGRADE"
  | "STORAGE_UPGRADE"
  | "TICKET_SALE";

type ReceiptIdentityRow = {
  session_id: string;
  action_type: string;
  requested_quantity: number | null;
};

export type StadiumActionReceiptReservation = {
  created: boolean;
};

/**
 * Reserves one globally unique Stadium action idempotency key.
 *
 * Concurrency semantics:
 * - the unique index serializes simultaneous INSERT attempts for the same key;
 * - ON CONFLICT waits for the competing transaction to commit/rollback;
 * - replay then SELECTs the committed receipt FOR UPDATE, keeping its identity
 *   stable for the rest of the caller's transaction;
 * - a key is never reusable across another session, action type, or request
 *   quantity.
 */
export async function reserveStadiumActionReceipt(
  client: Pick<PoolClient, "query">,
  input: {
    sessionId: string;
    actionType: StadiumActionType;
    idempotencyKey: string;
    requestedQuantity?: number;
  },
): Promise<StadiumActionReceiptReservation> {
  const requestedQuantity =
    input.requestedQuantity ?? null;

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO idle_stadium_action_receipts
       (id, session_id, action_type, idempotency_key,
        requested_quantity)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      input.sessionId,
      input.actionType,
      input.idempotencyKey,
      requestedQuantity,
    ],
  );

  if (inserted.rows[0]) {
    return { created: true };
  }

  const existing = await client.query<ReceiptIdentityRow>(
    `SELECT session_id, action_type, requested_quantity
       FROM idle_stadium_action_receipts
      WHERE idempotency_key = $1
      FOR UPDATE`,
    [input.idempotencyKey],
  );

  const receipt = existing.rows[0];
  if (!receipt) {
    throw new Error("IDLE_STADIUM_RECEIPT_MISSING");
  }

  const quantityMatches = requestedQuantity === null
    ? receipt.requested_quantity === null
    : Number(receipt.requested_quantity) === requestedQuantity;

  if (
    receipt.session_id !== input.sessionId
    || receipt.action_type !== input.actionType
    || !quantityMatches
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }

  return { created: false };
}
