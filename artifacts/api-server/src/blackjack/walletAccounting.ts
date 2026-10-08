import type { BlackjackServerActionRequest } from "../../../cascade-8/src/blackjack/serverContract";
import type { BlackjackRoundHand } from "../../../cascade-8/src/blackjack/roundState";
import type { BlackjackServerTableSession } from "./serverTable";

export type BlackjackDebitKind =
  | "INITIAL_STAKE_DEBIT"
  | "INSURANCE_DEBIT"
  | "DOUBLE_DEBIT"
  | "SPLIT_DEBIT";

export type BlackjackWalletMutationPlan = {
  debitCents: number;
  debitKind: BlackjackDebitKind | null;
  payoutCreditCents: number;
  netDeltaCents: number;
};

export function blackjackMoneyToCents(amount: number): number {
  const cents = amount * 100;
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents)) {
    throw new Error("BLACKJACK_AMOUNT_OUT_OF_RANGE");
  }
  return cents;
}

function activeHand(session: BlackjackServerTableSession): BlackjackRoundHand {
  const handId = session.round?.activeHandId;
  const hand = handId
    ? session.round?.hands.find((candidate) => candidate.handId === handId)
    : null;

  if (!hand) {
    throw new Error("BLACKJACK_ACTIVE_HAND_MISSING");
  }
  return hand;
}

function debitForAction(
  current: BlackjackServerTableSession,
  request: BlackjackServerActionRequest,
): Pick<BlackjackWalletMutationPlan, "debitCents" | "debitKind"> {
  switch (request.action) {
    case "deal": {
      const seats = request.seats ?? [];
      const debitCents = seats.reduce(
        (total, seat) => total + blackjackMoneyToCents(Number(seat.wager)),
        0,
      );
      if (!Number.isSafeInteger(debitCents)) {
        throw new Error("BLACKJACK_AMOUNT_OUT_OF_RANGE");
      }
      return { debitCents, debitKind: "INITIAL_STAKE_DEBIT" };
    }
    case "insurance": {
      const hand = activeHand(current);
      return {
        debitCents: blackjackMoneyToCents(hand.wager / 2),
        debitKind: "INSURANCE_DEBIT",
      };
    }
    case "double": {
      const hand = activeHand(current);
      return {
        debitCents: blackjackMoneyToCents(hand.wager),
        debitKind: "DOUBLE_DEBIT",
      };
    }
    case "split": {
      const hand = activeHand(current);
      return {
        debitCents: blackjackMoneyToCents(hand.wager),
        debitKind: "SPLIT_DEBIT",
      };
    }
    default:
      return { debitCents: 0, debitKind: null };
  }
}

function completionPayoutCents(
  current: BlackjackServerTableSession,
  next: BlackjackServerTableSession,
): number {
  if (
    !next.round ||
    next.round.phase !== "complete" ||
    current.round?.phase === "complete"
  ) {
    return 0;
  }

  const payoutCents = next.round.hands.reduce((total, hand) => {
    const mainReturn = hand.returnAmount ?? 0;
    const insuranceReturn = hand.insuranceReturnAmount ?? 0;
    return total
      + blackjackMoneyToCents(mainReturn)
      + blackjackMoneyToCents(insuranceReturn);
  }, 0);

  if (!Number.isSafeInteger(payoutCents)) {
    throw new Error("BLACKJACK_AMOUNT_OUT_OF_RANGE");
  }
  return payoutCents;
}

export function planBlackjackWalletMutation(
  current: BlackjackServerTableSession,
  next: BlackjackServerTableSession,
  request: BlackjackServerActionRequest,
): BlackjackWalletMutationPlan {
  const debit = debitForAction(current, request);
  const payoutCreditCents = completionPayoutCents(current, next);
  const netDeltaCents = payoutCreditCents - debit.debitCents;

  if (!Number.isSafeInteger(netDeltaCents)) {
    throw new Error("BLACKJACK_AMOUNT_OUT_OF_RANGE");
  }

  return {
    ...debit,
    payoutCreditCents,
    netDeltaCents,
  };
}
