import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const purchaseSource = readFileSync(
  fileURLToPath(new URL("./seatPurchase.ts", import.meta.url)),
  "utf8",
);

const routeSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

const schemaSource = readFileSync(
  fileURLToPath(
    new URL("../../../../lib/db/src/schema/idle.ts", import.meta.url),
  ),
  "utf8",
);

describe("Stadium seat purchase transaction contract", () => {
  it("accepts only quantity and idempotency key from the seat-purchase route", () => {
    expect(routeSource).toContain(
      'router.post("/idle/stadium/seats/buy"',
    );
    expect(routeSource).toContain("quantity?: unknown;");
    expect(routeSource).toContain("idempotencyKey?: unknown;");
    expect(routeSource).not.toContain("submittedSeatPrice");
    expect(routeSource).not.toContain("unitPriceFromClient");
  });

  it("derives the price on the server from the locked settled seat count", () => {
    expect(purchaseSource).toContain(
      "quoteSeatPurchase(\n        settledState.ownedSeats,\n        quantity,",
    );
    expect(purchaseSource).toContain(
      "quote.resultingOwnedSeats > stadiumConfig.maxSeats",
    );
    expect(purchaseSource).toContain(
      'throw new Error("IDLE_STADIUM_CAPACITY_EXCEEDED")',
    );
  });

  it("uses the checkpoint-before-mutation transaction boundary", () => {
    expect(purchaseSource).toContain(
      "runCheckpointedStadiumMutation(",
    );
    expect(purchaseSource).toContain(
      "async ({ client, settledState }) =>",
    );
    expect(purchaseSource).toContain(
      "ownedSeats: quote.resultingOwnedSeats",
    );
  });

  it("locks and debits the shared wallet inside the same transaction", () => {
    expect(purchaseSource).toContain("FROM roulette_wallets");
    expect(purchaseSource).toContain("FOR UPDATE");
    expect(purchaseSource).toContain(
      "balanceBeforeCents - quote.totalCostCents",
    );
    expect(purchaseSource).toContain(
      "UPDATE roulette_wallets",
    );
    expect(purchaseSource).toContain(
      'throw new Error("INSUFFICIENT_IDLE_CREDITS")',
    );
  });

  it("stores a payload-aware idempotency receipt for exact replay", () => {
    expect(schemaSource).toContain(
      'export const idleStadiumActionReceipts = pgTable(',
    );
    expect(schemaSource).toContain(
      '"idle_stadium_action_receipts"',
    );
    expect(schemaSource).toContain(
      '"idle_stadium_action_receipts_idempotency_unique"',
    );

    expect(purchaseSource).toContain(
      "requested_quantity",
    );
    expect(purchaseSource).toContain(
      "purchased_seats",
    );
    expect(purchaseSource).toContain(
      "resulting_owned_seats",
    );
    expect(purchaseSource).toContain(
      'throw new Error("IDEMPOTENCY_KEY_REUSED")',
    );
    expect(purchaseSource).toContain("replayed: true");
  });

  it("revalidates replayed seat economics instead of trusting receipt totals", () => {
    expect(purchaseSource).toContain(
      "const startingOwnedSeats =",
    );
    expect(purchaseSource).toContain(
      "expectedCostCents = quoteSeatPurchase(",
    );
    expect(purchaseSource).toContain(
      "expectedCostCents !== costCents",
    );
    expect(purchaseSource).toContain(
      "purchasedSeats !== requestedQuantity",
    );
  });

  it("guards receipt completion by key, session, and action", () => {
    expect(purchaseSource).toContain(
      "AND session_id = $6",
    );
    expect(purchaseSource).toContain(
      "AND action_type = $7",
    );
    expect(purchaseSource).toContain("RETURNING id");
    expect(purchaseSource).toContain(
      'throw new Error("IDLE_STADIUM_RECEIPT_UPDATE_CONFLICT")',
    );
  });

  it("maps capacity conflicts and insufficient wallet funds to explicit API errors", () => {
    expect(routeSource).toContain(
      '"IDLE_STADIUM_CAPACITY_EXCEEDED"',
    );
    expect(routeSource).toContain(
      '"IDLE_STADIUM_MAX_SEATS_REACHED"',
    );
    expect(routeSource).toContain(
      '"IDLE_STADIUM_MAX_SEATS_EXCEEDED"',
    );
    expect(routeSource).toContain(
      'message === "INSUFFICIENT_IDLE_CREDITS" ? 402',
    );
  });
});
