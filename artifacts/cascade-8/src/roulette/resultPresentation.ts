import {
  type RouletteRoundSettlement,
} from "./betRules";

export type RouletteResultPresentation = {
  winningNumber: number;
  winningNumberBetId: string;
  winningBetIds: string[];
  grossReturnText: string;
  netProfitText: string;
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

export function createRouletteResultPresentation(
  settlement: RouletteRoundSettlement,
): RouletteResultPresentation {
  const outcome =
    settlement.netProfit > 0
      ? "win"
      : settlement.netProfit < 0
        ? "loss"
        : "push";

  return {
    winningNumber:
      settlement.winningNumber,
    winningNumberBetId:
      `straight-${settlement.winningNumber}`,
    winningBetIds: [
      ...settlement.winningBetIds,
    ],
    grossReturnText:
      String(
        settlement.grossReturn,
      ),
    netProfitText:
      formatSignedAmount(
        settlement.netProfit,
      ),
    outcome,
  };
}
