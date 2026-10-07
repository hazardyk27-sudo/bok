import { randomUUID } from "node:crypto";
import { type PoolClient } from "@workspace/db";
import type { StadiumStorageState } from "./stadiumRepository";
import { calculateInvestedCapitalCents } from "./investmentCapital";

export const IDLE_INVESTMENT_BASELINE_VERSION = 1;

function baselineKey(sessionId: string) {
  return `IDLE_INVESTMENT_BASELINE_V${IDLE_INVESTMENT_BASELINE_VERSION}:${sessionId}`;
}

function requirePositiveInvestment(
  amountCents: number,
) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("INVALID_IDLE_INVESTMENT_AMOUNT");
  }
  return amountCents;
}

export async function ensureIdleInvestmentBaseline(
  client: PoolClient,
  state: Pick<
    StadiumStorageState,
    | "sessionId"
    | "stadiumLevel"
    | "ownedSeats"
    | "speedLevel"
    | "storageLevel"
  >,
) {
  const amountCents = calculateInvestedCapitalCents({
    stadiumLevel: state.stadiumLevel,
    ownedSeats: state.ownedSeats,
    speedLevel: state.speedLevel,
    storageLevel: state.storageLevel,
  });

  await client.query(
    `INSERT INTO idle_investment_ledger
       (id, session_id, business_id, action_type,
        amount_cents, idempotency_key)
     VALUES ($1, $2, 'stadium', 'BASELINE', $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      randomUUID(),
      state.sessionId,
      amountCents,
      baselineKey(state.sessionId),
    ],
  );
}

export async function recordIdleInvestment(
  client: PoolClient,
  stateBeforeInvestment: Pick<
    StadiumStorageState,
    | "sessionId"
    | "stadiumLevel"
    | "ownedSeats"
    | "speedLevel"
    | "storageLevel"
  >,
  actionType: string,
  idempotencyKey: string,
  amountCents: number,
) {
  requirePositiveInvestment(amountCents);
  await ensureIdleInvestmentBaseline(
    client,
    stateBeforeInvestment,
  );

  const result = await client.query<{ id: string }>(
    `INSERT INTO idle_investment_ledger
       (id, session_id, business_id, action_type,
        amount_cents, idempotency_key)
     VALUES ($1, $2, 'stadium', $3, $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      stateBeforeInvestment.sessionId,
      actionType,
      amountCents,
      idempotencyKey,
    ],
  );

  if (!result.rows[0]) {
    throw new Error("IDLE_INVESTMENT_LEDGER_CONFLICT");
  }
}
