import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(name: string) {
  return readFileSync(
    fileURLToPath(new URL(`./${name}`, import.meta.url)),
    "utf8",
  );
}

const runtimeSchema = source("runtimeSchema.ts");
const ledger = source("investmentLedger.ts");

describe("Idle durable investment capital", () => {
  it("keeps a permanent ledger separate from 3-day action receipts", () => {
    expect(runtimeSchema).toContain(
      "CREATE TABLE IF NOT EXISTS idle_investment_ledger",
    );
    expect(runtimeSchema).toContain(
      "IDLE_INVESTMENT_BASELINE_V1:",
    );
    expect(ledger).toContain(
      "recordIdleInvestment",
    );
  });

  it("records every active Stadium cash investment path", () => {
    for (const file of [
      "seatPurchase.ts",
      "stadiumUpgrade.ts",
      "speedUpgrade.ts",
      "storageUpgrade.ts",
    ]) {
      expect(source(file)).toContain(
        "recordIdleInvestment(",
      );
    }
  });
});
