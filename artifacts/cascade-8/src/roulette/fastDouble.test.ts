import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getRouletteChipTier } from "./chipVisual";
import { doubleRoulettePlacementsForFastWrite } from "./fastDouble";

const source = readFileSync(
  fileURLToPath(new URL("./fastDouble.ts", import.meta.url)),
  "utf8",
);

describe("roulette fast x2", () => {
  it("changes placed-chip color tier as aggregate wager grows", () => {
    let bets = [{ betId: "straight-8", amount: 10 }];

    bets = doubleRoulettePlacementsForFastWrite(bets);
    expect(bets[0]!.amount).toBe(20);
    expect(getRouletteChipTier(bets[0]!.amount)).toBe("white");

    bets = doubleRoulettePlacementsForFastWrite(bets);
    expect(bets[0]!.amount).toBe(40);
    expect(getRouletteChipTier(bets[0]!.amount)).toBe("white");

    bets = doubleRoulettePlacementsForFastWrite(bets);
    expect(bets[0]!.amount).toBe(80);
    expect(getRouletteChipTier(bets[0]!.amount)).toBe("blue");

    bets = doubleRoulettePlacementsForFastWrite(bets);
    expect(bets[0]!.amount).toBe(160);
    expect(getRouletteChipTier(bets[0]!.amount)).toBe("green");
  });

  it("dispatches x2 through the server-stamped latest endpoint in capture phase", () => {
    expect(source).toContain(
      '"/api/roulette/global-bets/latest"',
    );
    expect(source).toContain(
      "reserveRouletteExternalLatestMutation()",
    );
    expect(source).toContain(
      "{ capture: true }",
    );
  });
});
