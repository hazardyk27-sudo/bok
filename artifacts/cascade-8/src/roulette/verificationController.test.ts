import {
  describe,
  expect,
  it,
} from "vitest";
import {
  aggregateRouletteBetTotals,
  rouletteBetTotalsMatch,
} from "./verificationController";

describe("roulette bet verification helpers", () => {
  it("aggregates multiple chip placements on the same wager target", () => {
    expect(
      aggregateRouletteBetTotals([
        { betId: "straight:29", amount: 10 },
        { betId: "straight:29", amount: 25 },
        { betId: "red", amount: 5 },
      ]),
    ).toEqual({
      "straight:29": 35,
      red: 5,
    });
  });

  it("treats equivalent rendered and server totals as confirmed", () => {
    expect(
      rouletteBetTotalsMatch(
        {
          "straight:29": 35,
          red: 5,
        },
        {
          red: 5,
          "straight:29": 35,
        },
      ),
    ).toBe(true);
  });

  it("detects missing or changed authoritative bets", () => {
    expect(
      rouletteBetTotalsMatch(
        {
          "straight:29": 25,
        },
        {
          "straight:29": 10,
        },
      ),
    ).toBe(false);

    expect(
      rouletteBetTotalsMatch(
        {
          "straight:29": 25,
          black: 5,
        },
        {
          "straight:29": 25,
        },
      ),
    ).toBe(false);
  });
});
