import { describe, expect, it } from "vitest";
import { runBlackjackFiveBotSimulation } from "./botSimulation";

describe("blackjack five-bot end-to-end simulation", () => {
  it("completes 250 five-player rounds through the full authoritative engine", () => {
    const result = runBlackjackFiveBotSimulation(250);

    expect(result.roundsCompleted).toBe(250);
    expect(result.totalActions).toBeGreaterThan(0);
    expect(result.hitActions).toBeGreaterThan(0);
    expect(result.standActions).toBeGreaterThan(0);
    expect(result.doubleActions).toBeGreaterThan(0);
    expect(result.splitActions).toBeGreaterThan(0);
    expect(result.shoesCreated).toBeGreaterThan(1);
    expect(result.maximumHandsInRound).toBeGreaterThan(5);
    expect(result.maximumHandsInRound).toBeLessThanOrEqual(20);
    expect(result.finalShoeIndex).toBeGreaterThanOrEqual(0);
    expect(result.finalShoeIndex).toBeLessThanOrEqual(312);
    expect(result.finalBalancesCents).toHaveLength(5);
    expect(
      result.finalBalancesCents.every(
        (balance) => Number.isSafeInteger(balance) && balance >= 0,
      ),
    ).toBe(true);
  });
});
