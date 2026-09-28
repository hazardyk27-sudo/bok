import type {
  BlackjackHandId,
  BlackjackRound,
  BlackjackSeatNumber,
} from "./domain";
import { canStand } from "./rules";
import { advanceBlackjackTurnAfterHandResolution } from "./turnEngine";

export type BlackjackStandResult = Readonly<{
  round: BlackjackRound;
  handId: BlackjackHandId;
  turnAdvanced: true;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack nowMs must be a non-negative safe integer");
  }
}

export function standBlackjackCurrentHand(
  round: BlackjackRound,
  input: {
    expectedHandId: BlackjackHandId;
    expectedSeatNumber: BlackjackSeatNumber;
    nowMs: number;
  },
): BlackjackStandResult {
  assertNowMs(input.nowMs);

  if (round.phase !== "PLAYER_TURNS" || round.currentTurn === null) {
    throw new Error("Blackjack STAND requires an active player turn");
  }

  if (
    round.currentTurn.handId !== input.expectedHandId ||
    round.currentTurn.seatNumber !== input.expectedSeatNumber
  ) {
    throw new Error("Blackjack STAND targets a stale or foreign turn");
  }

  if (input.nowMs >= round.currentTurn.endsAtMs) {
    throw new Error("Blackjack STAND arrived after the turn deadline");
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === input.expectedHandId,
  );
  if (handIndex < 0) {
    throw new Error("Blackjack STAND target hand does not exist");
  }

  const currentHand = round.hands[handIndex];
  if (currentHand.seatNumber !== input.expectedSeatNumber) {
    throw new Error("Blackjack STAND seat does not own the target hand");
  }

  if (!canStand(currentHand)) {
    throw new Error("Blackjack STAND is not legal for the current hand");
  }

  const hands = Object.freeze(
    round.hands.map((hand, index) =>
      index === handIndex
        ? Object.freeze({ ...hand, status: "STOOD" as const })
        : hand,
    ),
  );

  const stoodRound: BlackjackRound = Object.freeze({
    ...round,
    hands,
  });

  const advanced = advanceBlackjackTurnAfterHandResolution(
    stoodRound,
    input.nowMs,
  );

  return Object.freeze({
    round: advanced,
    handId: currentHand.handId,
    turnAdvanced: true,
  });
}
