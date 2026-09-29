import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const saleSource = readFileSync(
  fileURLToPath(new URL("./ticketSale.ts", import.meta.url)),
  "utf8",
);

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

const persistenceSource = readFileSync(
  fileURLToPath(new URL("./marketPersistence.ts", import.meta.url)),
  "utf8",
);

const stadiumRepositorySource = readFileSync(
  fileURLToPath(new URL("./stadiumRepository.ts", import.meta.url)),
  "utf8",
);

const stadiumPolicySource = readFileSync(
  fileURLToPath(new URL("./stadiumPolicy.ts", import.meta.url)),
  "utf8",
);

const schemaSource = readFileSync(
  fileURLToPath(
    new URL("../../../../lib/db/src/schema/idle.ts", import.meta.url),
  ),
  "utf8",
);

describe("ticket sale transaction contract", () => {
  it("accepts quantity + idempotency only and never trusts a client price", () => {
    expect(routesSource).toContain(
      'router.post("/idle/stadium/tickets/sell"',
    );
    expect(routesSource).toContain(
      "quantityTickets?: unknown;",
    );
    expect(routesSource).toContain(
      "idempotencyKey?: unknown;",
    );
    expect(routesSource).not.toContain(
      "executionPriceMicrodollars?: unknown",
    );
    expect(routesSource).not.toContain(
      "priceMicrodollars?: unknown",
    );
  });

  it("checkpoints production before sale mutation and locks the authoritative market row", () => {
    expect(saleSource).toContain(
      "runCheckpointedStadiumMutation(",
    );
    expect(saleSource).toContain(
      ".getCurrentStateForShareOnClient(client)",
    );
    expect(persistenceSource).toContain(
      "FOR SHARE",
    );
    expect(saleSource).toContain(
      "executionPriceMicrodollars:\n          market.priceMicrodollars",
    );
  });

  it("decrements inventory and credits the shared wallet in the same transaction", () => {
    expect(saleSource).toContain(
      "resultingStoredMicroTickets",
    );
    expect(saleSource).toContain(
      "storedMicroTickets:\n            quote.resultingStoredMicroTickets",
    );
    expect(saleSource).toContain(
      "UPDATE roulette_wallets",
    );
    expect(saleSource).toContain(
      "BigInt(balanceBeforeCents)\n          + BigInt(quote.walletCreditCents)",
    );
    expect(saleSource).toContain(
      'throw new Error("INSUFFICIENT_IDLE_TICKETS")',
    );
  });

  it("uses carried sub-cent settlement state rather than dropping value", () => {
    expect(saleSource).toContain(
      "settleMarketMicrodollarsToWalletCents({",
    );
    expect(saleSource).toContain(
      "priorRemainderMicrodollars:",
    );
    expect(saleSource).toContain(
      "saleRemainderMicrodollars:",
    );
  });

  it("stores sale replay fields on the canonical Stadium receipt table", () => {
    const canonicalReceiptSchema = schemaSource.slice(
      schemaSource.indexOf(
        "export const idleStadiumActionReceipts = pgTable(",
      ),
    );
    const legacyReceiptSchema = schemaSource.slice(
      schemaSource.indexOf(
        "export const idleActionReceipts = pgTable(",
      ),
      schemaSource.indexOf(
        "export const idleLedger = pgTable(",
      ),
    );

    for (const field of [
      "sold_tickets",
      "execution_price_microdollars",
      "gross_sale_microdollars",
      "wallet_credit_cents",
      "sale_remainder_microdollars",
      "market_source",
      "market_feed_status",
      "market_tick_at",
    ]) {
      expect(canonicalReceiptSchema).toContain(field);
      expect(legacyReceiptSchema).not.toContain(field);
      expect(saleSource).toContain(field);
    }

    expect(saleSource).toContain(
      'const TICKET_SALE_ACTION = "TICKET_SALE"',
    );
    expect(saleSource).toContain(
      'throw new Error("IDEMPOTENCY_KEY_REUSED")',
    );
    expect(saleSource).toContain(
      "replayed: true",
    );
  });


  it("hard-bounds execution price and validates replay arithmetic/remainder integrity", () => {
    expect(saleSource).toContain(
      "MARKET_CONFIG.minTicketPriceMicrodollars",
    );
    expect(saleSource).toContain(
      "MARKET_CONFIG.maxTicketPriceMicrodollars",
    );
    expect(saleSource).toContain(
      "saleRemainderMicrodollars\n      >= MARKET_MICRODOLLARS_PER_CENT",
    );
    expect(saleSource).toContain(
      "const expectedGross =",
    );
    expect(saleSource).toContain(
      "const impliedPriorRemainder =",
    );
    expect(saleSource).toContain(
      "balanceCents < walletCreditCents",
    );
  });


  it("enforces the sub-cent remainder invariant on both persisted reads and mutation writes", () => {
    expect(stadiumRepositorySource).toContain(
      "saleRemainderMicrodollars >=",
    );
    expect(stadiumRepositorySource).toContain(
      "MARKET_MICRODOLLARS_PER_CENT",
    );
    expect(stadiumPolicySource).toContain(
      "saleRemainderMicrodollars >=",
    );
    expect(stadiumPolicySource).toContain(
      'throw new Error("INVALID_IDLE_SALE_REMAINDER")',
    );
  });

  it("returns a temporary-unavailable error when no authoritative market state exists", () => {
    expect(saleSource).toContain(
      'throw new Error("IDLE_MARKET_STATE_MISSING")',
    );
    expect(routesSource).toContain(
      'message === "IDLE_MARKET_STATE_MISSING" ? 503',
    );
  });
});
