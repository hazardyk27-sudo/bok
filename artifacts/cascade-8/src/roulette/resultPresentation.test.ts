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
  getRouletteResultWheelContext,
} from "./resultPresentation";

describe("roulette result presentation", () => {
  it("derives real European wheel neighbors and marker geometry", () => {
    expect(
      getRouletteResultWheelContext(27),
    ).toMatchObject({
      pocketIndex: 11,
      leftNeighborNumber: 6,
      rightNeighborNumber: 13,
    });

    expect(
      getRouletteResultWheelContext(0),
    ).toMatchObject({
      pocketIndex: 0,
      leftNeighborNumber: 26,
      rightNeighborNumber: 32,
    });

    expect(
      getRouletteResultWheelContext(26),
    ).toMatchObject({
      pocketIndex: 36,
      leftNeighborNumber: 3,
      rightNeighborNumber: 0,
    });

    expect(
      getRouletteResultWheelContext(27)
        .markerRelativeAngle,
    ).toBeCloseTo(
      -Math.PI / 2 +
        11 *
          ((Math.PI * 2) / 37),
      10,
    );
  });

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
      presentation.winningPocketIndex,
    ).toBe(1);
    expect(
      presentation.leftNeighborNumber,
    ).toBe(0);
    expect(
      presentation.rightNeighborNumber,
    ).toBe(15);
    expect(
      presentation.winningColor,
    ).toBe("red");
    expect(
      presentation.hasPayout,
    ).toBe(false);
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
      presentation.grossReturn,
    ).toBe(380);
    expect(
      presentation.grossReturnText,
    ).toBe("380");
    expect(
      presentation.hasPayout,
    ).toBe(true);
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
