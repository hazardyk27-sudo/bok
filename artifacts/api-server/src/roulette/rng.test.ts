import { describe, expect, it } from "vitest";
import {
  MULTIPLIER_DISTRIBUTION,
  chooseMultipliers,
  uniformWinningNumber,
} from "./rng";
import {
  MULTIPLIER_REVEAL_CONFIG,
  MULTIPLIER_VALUES,
  getMultiplierRevealCount,
} from "./types";

describe("roulette multiplier reveal contract", () => {
  it("keeps the reveal window configurable inside the requested range", () => {
    expect(MULTIPLIER_REVEAL_CONFIG.durationMs).toBeGreaterThanOrEqual(8_000);
    expect(MULTIPLIER_REVEAL_CONFIG.durationMs).toBeLessThanOrEqual(10_000);
    expect(getMultiplierRevealCount(0, 5)).toBe(0);
    expect(getMultiplierRevealCount(MULTIPLIER_REVEAL_CONFIG.stepMs, 5)).toBe(1);
    expect(getMultiplierRevealCount(MULTIPLIER_REVEAL_CONFIG.durationMs - 1, 5)).toBe(5);
  });

  it("exposes every allowed multiplier with lower values weighted more heavily", () => {
    expect(MULTIPLIER_DISTRIBUTION.map(({ value }) => value)).toEqual([...MULTIPLIER_VALUES]);
    expect(MULTIPLIER_DISTRIBUTION.map(({ weight }) => weight)).toEqual([52, 24, 10, 6, 3, 2, 1.5, 1]);
    expect(MULTIPLIER_DISTRIBUTION[0].weight).toBeGreaterThan(MULTIPLIER_DISTRIBUTION.at(-1)!.weight);
  });
});

describe("roulette RNG independence", () => {
  it("maps all 37 winning-number draws without consulting multiplier selection", () => {
    const winningNumbers = Array.from({ length: 37 }, (_, draw) => uniformWinningNumber(() => draw));
    expect(winningNumbers).toEqual([...Array(37).keys()]);

    const calls: Array<[number, number]> = [];
    const nextInt = (min: number, max: number) => {
      calls.push([min, max]);
      return min;
    };
    const winningNumber = uniformWinningNumber(nextInt);
    const multipliers = chooseMultipliers(3, nextInt);

    expect(winningNumber).toBe(0);
    expect(multipliers).toHaveLength(3);
    expect(calls[0]).toEqual([0, 37]);
    expect(calls.slice(1)).toEqual([
      [0, 1_000_000],
      [0, 1_000_000],
      [0, 1_000_000],
    ]);
    expect(calls.slice(1).some(([min, max]) => min === 0 && max === 37)).toBe(false);
  });
});