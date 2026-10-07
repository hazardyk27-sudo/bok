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

  it("keeps the retired optimistic DOM observer out and installs authority before runtime", () => {
    const authorityAt = indexSource.indexOf(
      "installRouletteBetAuthority(app)",
    );
    const runtimeAt = indexSource.indexOf(
      "mountRouletteRuntime(app)",
    );

    expect(indexSource).not.toContain(
      "installRouletteOptimisticBalanceUi(app)",
    );
    expect(authorityAt).toBeGreaterThan(-1);
    expect(runtimeAt).toBeGreaterThan(authorityAt);
  });
});
