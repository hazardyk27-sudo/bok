import {
  describe,
  expect,
  it,
} from "vitest";
import {
  getRouletteProfitOdds,
  getWinningRouletteBetIds,
  isRouletteBetWinner,
  settleRouletteBets,
} from "./betRules";

describe("European roulette betting rules", () => {
  it("pays straight-up bets at 35 to 1", () => {
    expect(
      getRouletteProfitOdds(
        "straight-17",
      ),
    ).toBe(35);
    expect(
      isRouletteBetWinner(
        "straight-17",
        17,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "straight-17",
        18,
      ),
    ).toBe(false);
  });

  it("keeps zero outside every dozen, column and even-money bet", () => {
    const zeroLoses = [
      "column-1",
      "column-2",
      "column-3",
      "dozen-1",
      "dozen-2",
      "dozen-3",
      "low",
      "high",
      "even",
      "odd",
      "red",
      "black",
    ];

    zeroLoses.forEach(
      (betId) => {
        expect(
          isRouletteBetWinner(
            betId,
            0,
          ),
        ).toBe(false);
      },
    );

    expect(
      isRouletteBetWinner(
        "straight-0",
        0,
      ),
    ).toBe(true);
  });

  it("maps all three dozens to the correct ranges", () => {
    expect(
      isRouletteBetWinner(
        "dozen-1",
        1,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "dozen-1",
        12,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "dozen-2",
        13,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "dozen-2",
        24,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "dozen-3",
        25,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "dozen-3",
        36,
      ),
    ).toBe(true);
    expect(
      getRouletteProfitOdds(
        "dozen-2",
      ),
    ).toBe(2);
  });

  it("maps the three 2-to-1 columns correctly", () => {
    expect(
      isRouletteBetWinner(
        "column-1",
        1,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "column-1",
        34,
      ),
    ).toBe(true);

    expect(
      isRouletteBetWinner(
        "column-2",
        2,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "column-2",
        35,
      ),
    ).toBe(true);

    expect(
      isRouletteBetWinner(
        "column-3",
        3,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "column-3",
        36,
      ),
    ).toBe(true);

    expect(
      isRouletteBetWinner(
        "column-1",
        35,
      ),
    ).toBe(false);
  });

  it("applies low/high, odd/even and canonical red/black rules", () => {
    expect(
      isRouletteBetWinner(
        "low",
        18,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "high",
        19,
      ),
    ).toBe(true);

    expect(
      isRouletteBetWinner(
        "even",
        24,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "odd",
        23,
      ),
    ).toBe(true);

    expect(
      isRouletteBetWinner(
        "red",
        32,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "black",
        15,
      ),
    ).toBe(true);
    expect(
      isRouletteBetWinner(
        "red",
        15,
      ),
    ).toBe(false);
  });

  it("settles stacked wagers with gross return and net profit separated", () => {
    const settlement =
      settleRouletteBets(
        [
          {
            betId:
              "straight-17",
            amount: 10,
          },
          {
            betId: "red",
            amount: 5,
          },
          {
            betId: "odd",
            amount: 25,
          },
          {
            betId:
              "dozen-2",
            amount: 10,
          },
          {
            betId:
              "column-2",
            amount: 5,
          },
        ],
        17,
      );

    expect(
      settlement.totalStake,
    ).toBe(55);
    expect(
      settlement.winningStake,
    ).toBe(50);
    expect(
      settlement.grossReturn,
    ).toBe(455);
    expect(
      settlement.netProfit,
    ).toBe(400);
    expect(
      settlement.winningBetIds,
    ).toEqual([
      "straight-17",
      "odd",
      "dozen-2",
      "column-2",
    ]);
  });

  it("returns unique winning ids for UI highlighting", () => {
    expect(
      getWinningRouletteBetIds(
        32,
        [
          "red",
          "straight-32",
          "red",
          "even",
          "dozen-3",
          "column-2",
        ],
      ),
    ).toEqual([
      "red",
      "straight-32",
      "even",
      "dozen-3",
      "column-2",
    ]);
  });

  it("rejects invalid result numbers and unknown bet ids during settlement", () => {
    expect(() =>
      settleRouletteBets(
        [],
        37,
      ),
    ).toThrow(
      "Invalid roulette winning number",
    );

    expect(() =>
      settleRouletteBets(
        [
          {
            betId:
              "split-1-2",
            amount: 10,
          },
        ],
        1,
      ),
    ).toThrow(
      "Unknown roulette bet id",
    );
  });
});
