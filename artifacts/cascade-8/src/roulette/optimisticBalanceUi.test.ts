import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getRouletteOptimisticBalanceCents } from "./optimisticBalanceUi";

const indexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("Roulette optimistic balance", () => {
  it("subtracts a newly placed local bet immediately before server acknowledgement", () => {
    expect(
      getRouletteOptimisticBalanceCents(
        100_000,
        0,
        1_000,
      ),
    ).toBe(99_000);
  });

  it("keeps rapid consecutive bets visually correct while an older server response arrives", () => {
    expect(
      getRouletteOptimisticBalanceCents(
        99_000,
        1_000,
        2_000,
      ),
    ).toBe(98_000);
  });

  it("shows an undo or clear refund immediately while the server still holds the old reserve", () => {
    expect(
      getRouletteOptimisticBalanceCents(
        98_000,
        2_000,
        1_000,
      ),
    ).toBe(99_000);

    expect(
      getRouletteOptimisticBalanceCents(
        98_000,
        2_000,
        0,
      ),
    ).toBe(100_000);
  });

  it("never renders a negative balance during a transient local/server mismatch", () => {
    expect(
      getRouletteOptimisticBalanceCents(
        500,
        0,
        1_000,
      ),
    ).toBe(0);
  });

  it("installs the wallet bridge before runtime bootstrap and the UI observer immediately after mount", () => {
    const bridgeAt = indexSource.indexOf(
      "installRouletteOptimisticBalanceBridge();",
    );
    const runtimeAt = indexSource.indexOf(
      "mountRouletteRuntime(app);",
    );
    const uiAt = indexSource.indexOf(
      "installRouletteOptimisticBalanceUi(app);",
    );

    expect(bridgeAt).toBeGreaterThan(-1);
    expect(runtimeAt).toBeGreaterThan(bridgeAt);
    expect(uiAt).toBeGreaterThan(runtimeAt);
  });
});
