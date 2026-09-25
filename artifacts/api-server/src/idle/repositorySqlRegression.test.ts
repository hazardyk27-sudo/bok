import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  fileURLToPath(new URL("./repository.ts", import.meta.url)),
  "utf8",
);

describe("Idle repository SQL regression", () => {
  it("does not ask PostgreSQL to add two untyped collect parameters", () => {
    expect(repositorySource).not.toContain("VALUES ($1, $2 + $3, now())");
    expect(repositorySource).toContain(
      "INITIAL_ROULETTE_BALANCE_CENTS + settlement.walletCreditCents",
    );
    expect(repositorySource).toContain("VALUES ($1, $2, now())");
  });

  it("keeps existing-wallet collect credit typed by the balance column", () => {
    expect(repositorySource).toContain(
      "SET balance_cents = roulette_wallets.balance_cents + $3",
    );
  });
});