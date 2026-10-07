import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(
    new URL(
      "./globalBetStore.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("roulette global bet locking", () => {
  it("does not serialize every player on the shared immutable round row", () => {
    const roundLookupStart =
      source.indexOf(
        "FROM roulette_global_rounds",
      );
    expect(roundLookupStart).toBeGreaterThanOrEqual(0);

    const roundLookup =
      source.slice(
        roundLookupStart,
        roundLookupStart + 220,
      );
    expect(roundLookup).not.toContain(
      "FOR UPDATE",
    );
  });

  it("keeps serialization scoped to the current player's slip", () => {
    expect(source).toContain(
      "roulette-global-slip:${input.roundId}:${input.sessionId}",
    );
  });
});
