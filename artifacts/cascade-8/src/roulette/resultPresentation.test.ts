import {
  describe,
  expect,
  it,
} from "vitest";
import {
  settleRouletteBets,
} from "./betRules";
import {
  createRouletteResultPresentation,
} from "./resultPresentation";

describe("roulette result presentation", () => {
  it("marks the physical winning number independently of placed wagers", () => {
    const settlement =
      settleRouletteBets(
        [],
        32,
      );
    const presentation =
      createRouletteResultPresentation(
        settlement,
      );

    expect(
      presentation.winningNumberBetId,
    ).toBe("straight-32");
    expect(
      presentation.winningBetIds,
    ).toEqual([]);
    expect(
      presentation.grossReturnText,
    ).toBe("0");
    expect(
      presentation.netProfitText,
    ).toBe("0");
    expect(
      presentation.outcome,
    ).toBe("push");
  });

  it("formats a winning round for table highlighting and payout display", () => {
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
            amount: 5,
          },
        ],
        17,
      );
    const presentation =
      createRouletteResultPresentation(
        settlement,
      );

    expect(
      presentation.winningBetIds,
    ).toEqual([
      "straight-17",
      "red",
      "odd",
    ]);
    expect(
      presentation.grossReturnText,
    ).toBe("380");
    expect(
      presentation.netProfitText,
    ).toBe("+360");
    expect(
      presentation.outcome,
    ).toBe("win");
  });

  it("formats a losing round without changing the physical result", () => {
    const settlement =
      settleRouletteBets(
        [
          {
            betId: "black",
            amount: 25,
          },
        ],
        32,
      );
    const presentation =
      createRouletteResultPresentation(
        settlement,
      );

    expect(
      presentation.winningNumber,
    ).toBe(32);
    expect(
      presentation.winningNumberBetId,
    ).toBe("straight-32");
    expect(
      presentation.winningBetIds,
    ).toEqual([]);
    expect(
      presentation.grossReturnText,
    ).toBe("0");
    expect(
      presentation.netProfitText,
    ).toBe("-25");
    expect(
      presentation.outcome,
    ).toBe("loss");
  });
});
