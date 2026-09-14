import { describe, expect, it } from "vitest";
import { BETS_CENTS } from "./GameConfig";

describe("bet configuration", () => {
  it("allows bets up to $500", () => {
    expect(BETS_CENTS.at(-1)).toBe(50_000);
  });
});