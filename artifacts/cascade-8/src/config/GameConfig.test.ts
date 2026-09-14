import { describe, expect, it } from "vitest";
import { BETS_CENTS, MULTIPLIER_CORE_ARTWORK } from "./GameConfig";

describe("bet configuration", () => {
  it("allows bets up to $500", () => {
    expect(BETS_CENTS.at(-1)).toBe(50_000);
  });

  it("maps every supplied multiplier portrait to a circular asset", () => {
    expect(Object.keys(MULTIPLIER_CORE_ARTWORK).map(Number)).toEqual([
      2, 3, 5, 10, 15, 20, 25, 50, 100, 250,
    ]);
    expect(Object.values(MULTIPLIER_CORE_ARTWORK).every((path) => path.endsWith(".png"))).toBe(true);
  });
});