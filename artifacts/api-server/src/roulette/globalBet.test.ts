import {
  describe,
  expect,
  it,
} from "vitest";
import {
  assertRouletteGlobalBettingOpen,
  getRouletteGlobalStakeCents,
  settleRouletteGlobalBet,
} from "./globalBet";

describe("roulette global bets", () => {
  const round = {
    bettingOpenAtMs:
      1_000,
    bettingCloseAtMs:
      21_000,
  };

  it("accepts bets only inside the authoritative server window", () => {
    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        1_000,
      ),
    ).not.toThrow();

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        20_999,
      ),
    ).not.toThrow();

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        999,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BETTING_NOT_OPEN",
    );

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        21_000,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BETTING_CLOSED",
    );
  });

  it("converts the complete editable bet slip to reserved wallet cents", () => {
    expect(
      getRouletteGlobalStakeCents([
        {
          betId: "red",
          amount: 25,
        },
        {
          betId: "straight-17",
          amount: 10,
        },
      ]),
    ).toBe(3_500);

    expect(
      getRouletteGlobalStakeCents(
        [],
      ),
    ).toBe(0);
  });

  it("settles every player against the same global winning number", () => {
    const first =
      settleRouletteGlobalBet(
        [
          {
            betId: "straight-17",
            amount: 10,
          },
          {
            betId: "odd",
            amount: 10,
          },
        ],
        17,
      );
    const second =
      settleRouletteGlobalBet(
        [
          {
            betId: "black",
            amount: 25,
          },
        ],
        17,
      );

    expect(
      first.settlement.winningNumber,
    ).toBe(17);
    expect(
      second.settlement.winningNumber,
    ).toBe(17);
    expect(
      first.payoutCents,
    ).toBe(
      first.settlement.grossReturn *
        100,
    );
    expect(
      second.payoutCents,
    ).toBe(
      second.settlement.grossReturn *
        100,
    );
  });
});
