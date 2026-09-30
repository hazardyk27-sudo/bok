import {
  describe,
  expect,
  it,
} from "vitest";
import {
  estimateRouletteServerClockOffset,
  getRouletteGlobalBettingSecondsRemaining,
  getRouletteGlobalClientPhase,
  getRouletteGlobalSpinElapsedMs,
} from "./globalClient";
import type {
  RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

const table: RouletteGlobalTableSnapshot = {
  roundId: "global-1",
  simulationVersion:
    "roulette-full-turn-v2",
  phase: "betting",
  serverTimeMs: 10_000,
  bettingOpenAtMs: 10_000,
  bettingCloseAtMs: 30_000,
  spinStartedAtMs: 30_000,
  resultAtMs: 40_000,
  nextRoundAtMs: 42_200,
  seed: null,
  result: null,
};

describe("roulette global client clock", () => {
  it("estimates server time from the request midpoint", () => {
    expect(
      estimateRouletteServerClockOffset(
        10_100,
        9_900,
        10_000,
      ),
    ).toBe(150);
  });

  it("joins a betting round at the remaining global second", () => {
    expect(
      getRouletteGlobalClientPhase(
        table,
        23_100,
      ),
    ).toBe("betting");
    expect(
      getRouletteGlobalBettingSecondsRemaining(
        table,
        23_100,
      ),
    ).toBe(7);
  });

  it("moves phases only from authoritative timestamps", () => {
    expect(
      getRouletteGlobalClientPhase(
        table,
        29_999,
      ),
    ).toBe("betting");
    expect(
      getRouletteGlobalClientPhase(
        table,
        30_000,
      ),
    ).toBe("spinning");
    expect(
      getRouletteGlobalClientPhase(
        table,
        40_000,
      ),
    ).toBe("result");
    expect(
      getRouletteGlobalClientPhase(
        table,
        42_200,
      ),
    ).toBe("complete");
  });

  it("calculates the exact elapsed global spin time", () => {
    expect(
      getRouletteGlobalSpinElapsedMs(
        table,
        34_250,
      ),
    ).toBe(4_250);
    expect(
      getRouletteGlobalSpinElapsedMs(
        table,
        50_000,
      ),
    ).toBe(10_000);
  });
});
