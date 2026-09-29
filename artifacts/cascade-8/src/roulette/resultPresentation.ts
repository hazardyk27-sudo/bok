import {
  type RouletteRoundSettlement,
} from "./betRules";
import {
  EUROPEAN_WHEEL_SEQUENCE,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  TOP_SEGMENT_CENTER,
} from "./config";
import {
  getWinningColor,
  type RouletteWinningColor,
} from "./spinResult";

export type RouletteResultPresentation = {
  winningNumber: number;
  winningNumberBetId: string;
  winningPocketIndex: number;
  winningColor: RouletteWinningColor;
  leftNeighborNumber: number;
  rightNeighborNumber: number;
  markerRelativeAngle: number;
  winningBetIds: string[];
  grossReturn: number;
  grossReturnText: string;
  netProfitText: string;
  hasPayout: boolean;
  outcome: "win" | "loss" | "push";
};

function formatSignedAmount(
  amount: number,
) {
  if (amount > 0) {
    return `+${amount}`;
  }

  return String(amount);
}

function normalizePocketIndex(
  index: number,
) {
  return (
    (index % SEGMENT_COUNT) +
    SEGMENT_COUNT
  ) % SEGMENT_COUNT;
}

export function getRouletteResultWheelContext(
  winningNumber: number,
) {
  const pocketIndex =
    EUROPEAN_WHEEL_SEQUENCE.indexOf(
      winningNumber as
        (typeof EUROPEAN_WHEEL_SEQUENCE)[number],
    );

  if (pocketIndex < 0) {
    throw new Error(
      `Invalid roulette winning number: ${winningNumber}`,
    );
  }

  const leftIndex =
    normalizePocketIndex(
      pocketIndex - 1,
    );
  const rightIndex =
    normalizePocketIndex(
      pocketIndex + 1,
    );

  return {
    pocketIndex,
    leftNeighborNumber:
      EUROPEAN_WHEEL_SEQUENCE[
        leftIndex
      ],
    rightNeighborNumber:
      EUROPEAN_WHEEL_SEQUENCE[
        rightIndex
      ],
    markerRelativeAngle:
      TOP_SEGMENT_CENTER +
      pocketIndex *
        SEGMENT_ANGLE,
  };
}

export function createRouletteResultPresentation(
  settlement: RouletteRoundSettlement,
): RouletteResultPresentation {
  const outcome =
    settlement.netProfit > 0
      ? "win"
      : settlement.netProfit < 0
        ? "loss"
        : "push";
  const wheelContext =
    getRouletteResultWheelContext(
      settlement.winningNumber,
    );

  return {
    winningNumber:
      settlement.winningNumber,
    winningNumberBetId:
      `straight-${settlement.winningNumber}`,
    winningPocketIndex:
      wheelContext.pocketIndex,
    winningColor:
      getWinningColor(
        settlement.winningNumber,
      ),
    leftNeighborNumber:
      wheelContext.leftNeighborNumber,
    rightNeighborNumber:
      wheelContext.rightNeighborNumber,
    markerRelativeAngle:
      wheelContext.markerRelativeAngle,
    winningBetIds: [
      ...settlement.winningBetIds,
    ],
    grossReturn:
      settlement.grossReturn,
    grossReturnText:
      String(
        settlement.grossReturn,
      ),
    netProfitText:
      formatSignedAmount(
        settlement.netProfit,
      ),
    hasPayout:
      settlement.grossReturn > 0,
    outcome,
  };
}
