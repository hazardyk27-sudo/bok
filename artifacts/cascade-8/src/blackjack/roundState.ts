import { evaluateBlackjackHand, type BlackjackCard } from "./blackjackCore";
import {
  drawBlackjackCard,
  type BlackjackShoe,
} from "./shoe";
import {
  type BlackjackSeatId,
  type BlackjackSeatState,
} from "./seatState";

export type BlackjackRoundPhase = "playerTurns" | "dealerTurn";

export type BlackjackRoundHandStatus = "playing" | "blackjack";

export type BlackjackRoundHand = {
  seatId: BlackjackSeatId;
  wager: number;
  cards: BlackjackCard[];
  status: BlackjackRoundHandStatus;
};

export type BlackjackDealerHand = {
  cards: [BlackjackCard, BlackjackCard];
  blackjack: boolean;
};

export type BlackjackRoundState = {
  phase: BlackjackRoundPhase;
  hands: BlackjackRoundHand[];
  dealer: BlackjackDealerHand;
  activeSeatId: BlackjackSeatId | null;
};

export type BlackjackRoundReadiness = {
  canDeal: boolean;
  participatingSeatIds: BlackjackSeatId[];
  blockingSeatIds: BlackjackSeatId[];
};

export type StartBlackjackRoundResult = {
  round: BlackjackRoundState;
  shoe: BlackjackShoe;
};

export function getBlackjackRoundReadiness(
  state: BlackjackSeatState,
  tableMin: number,
): BlackjackRoundReadiness {
  const participatingSeatIds: BlackjackSeatId[] = [];
  const blockingSeatIds: BlackjackSeatId[] = [];

  for (const seat of state.seats) {
    if (seat.status === "empty" || seat.bet === 0) {
      continue;
    }

    if (seat.bet < tableMin || seat.status !== "betReady") {
      blockingSeatIds.push(seat.id);
      continue;
    }

    participatingSeatIds.push(seat.id);
  }

  return {
    canDeal: participatingSeatIds.length > 0 && blockingSeatIds.length === 0,
    participatingSeatIds,
    blockingSeatIds,
  };
}

export function startBlackjackRound(
  state: BlackjackSeatState,
  shoe: BlackjackShoe,
  tableMin: number,
): StartBlackjackRoundResult {
  const readiness = getBlackjackRoundReadiness(state, tableMin);

  if (!readiness.canDeal) {
    if (readiness.blockingSeatIds.length > 0) {
      throw new Error(
        `Blackjack round blocked by below-minimum wager on seat(s): ${readiness.blockingSeatIds.join(", ")}`,
      );
    }
    throw new Error("Blackjack round requires at least one bet-ready seat");
  }

  const hands: BlackjackRoundHand[] = readiness.participatingSeatIds.map((seatId) => {
    const seat = state.seats.find((candidate) => candidate.id === seatId);
    if (!seat) {
      throw new Error(`Missing blackjack seat ${seatId}`);
    }

    return {
      seatId,
      wager: seat.bet,
      cards: [],
      status: "playing",
    };
  });

  let nextShoe = shoe;

  const draw = () => {
    const result = drawBlackjackCard(nextShoe);
    nextShoe = result.shoe;
    return result.card;
  };

  // Live-table deal order: first card to each participating seat from 1 -> 5,
  // dealer upcard, second card to each participating seat, then dealer hole card.
  for (const hand of hands) {
    hand.cards.push(draw());
  }
  const dealerUpcard = draw();

  for (const hand of hands) {
    hand.cards.push(draw());
  }
  const dealerHoleCard = draw();

  for (const hand of hands) {
    if (evaluateBlackjackHand(hand.cards).blackjack) {
      hand.status = "blackjack";
    }
  }

  const dealerCards: [BlackjackCard, BlackjackCard] = [
    dealerUpcard,
    dealerHoleCard,
  ];
  const dealerBlackjack = evaluateBlackjackHand(dealerCards).blackjack;

  const activeSeatId = dealerBlackjack
    ? null
    : hands.find((hand) => hand.status === "playing")?.seatId ?? null;

  return {
    shoe: nextShoe,
    round: {
      phase: activeSeatId === null ? "dealerTurn" : "playerTurns",
      hands,
      dealer: {
        cards: dealerCards,
        blackjack: dealerBlackjack,
      },
      activeSeatId,
    },
  };
}
