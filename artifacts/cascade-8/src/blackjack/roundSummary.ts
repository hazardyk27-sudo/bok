import type { BlackjackPublicRound } from "./serverContract";

export type BlackjackRoundSummary = {
  seatCount: number;
  handCount: number;
  totalStake: number;
  totalReturn: number;
  net: number;
};

export function summarizeBlackjackRound(
  round: BlackjackPublicRound,
): BlackjackRoundSummary {
  const seatIds = new Set<number>();
  let totalStake = 0;
  let totalReturn = 0;

  for (const hand of round.hands) {
    seatIds.add(hand.seatId);
    totalStake += hand.wager + hand.insuranceWager;
    totalReturn += (hand.returnAmount ?? 0) + (hand.insuranceReturnAmount ?? 0);
  }

  return {
    seatCount: seatIds.size,
    handCount: round.hands.length,
    totalStake,
    totalReturn,
    net: totalReturn - totalStake,
  };
}
