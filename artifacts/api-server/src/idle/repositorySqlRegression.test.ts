import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const stateSource = readFileSync(
  fileURLToPath(
    new URL("./stadiumState.ts", import.meta.url),
  ),
  "utf8",
);

describe("canonical Idle state SQL regression", () => {
  it("reads only canonical Stadium + shared wallet state", () => {
    expect(stateSource).toContain(
      "ensureStadiumState(",
    );
    expect(stateSource).toContain(
      "roulette_wallets",
    );
    expect(stateSource).not.toContain(
      "idle_business_states",
    );
    expect(stateSource).not.toContain(
      "idle_action_receipts",
    );
    expect(stateSource).not.toContain(
      "idle_ledger",
    );
  });

  it("uses one transaction and the canonical Stadium-then-wallet lock order", () => {
    const beginIndex = stateSource.indexOf(
      'await client.query("BEGIN")',
    );
    const stadiumIndex = stateSource.indexOf(
      "await ensureStadiumState(",
    );
    const walletIndex = stateSource.indexOf(
      "FROM roulette_wallets",
    );
    const commitIndex = stateSource.indexOf(
      'await client.query("COMMIT")',
    );

    expect(beginIndex).toBeGreaterThan(-1);
    expect(stadiumIndex).toBeGreaterThan(beginIndex);
    expect(walletIndex).toBeGreaterThan(stadiumIndex);
    expect(commitIndex).toBeGreaterThan(walletIndex);
    expect(stateSource).toContain("FOR UPDATE");
  });
});
