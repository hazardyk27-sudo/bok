import {
  dealerShouldHit,
  evaluateBlackjackHand,
  type BlackjackCard,
} from "./blackjackCore";
import {
  drawBlackjackCard,
  type BlackjackShoe,
} from "./shoe";
import {
  type BlackjackSeatId,
  type BlackjackSeatState,
} from "./seatState";

export type BlackjackRoundPhase = "playerTurns" | "dealerTurn" | "complete";

export type BlackjackRoundHandStatus =
  | "playing"
  | "stood"
  | "bust"
  | "blackjack";

export type BlackjackHandResult = "win" | "lose" | "push" | "blackjack";

export type BlackjackRoundHand = {
  seatId: BlackjackSeatId;
  wager: number;
  cards: BlackjackCard[];
  status: BlackjackRoundHandStatus;
  doubled: boolean;
  result: BlackjackHandResult | null;
  returnAmount: number | null;
  netAmount: number | null;
};

export type BlackjackDealerHand = {
  cards: BlackjackCard[];
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

export type BlackjackRoundMutationResult = {
  round: BlackjackRoundState;
  shoe: BlackjackShoe;
};

export type StartBlackjackRoundResult = BlackjackRoundMutationResult;

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

function nextPlayingSeatId(
  hands: readonly BlackjackRoundHand[],
  afterSeatId: BlackjackSeatId,
): BlackjackSeatId | null {
  const startIndex = hands.findIndex((hand) => hand.seatId === afterSeatId);

  for (let index = startIndex + 1; index < hands.length; index += 1) {
    const hand = hands[index];
    if (hand?.status === "playing") {
      return hand.seatId;
    }
  }

  return null;
}

function settlementFor(
  hand: BlackjackRoundHand,
  dealerCards: readonly BlackjackCard[],
  dealerBlackjack: boolean,
): Pick<BlackjackRoundHand, "result" | "returnAmount" | "netAmount"> {
  let result: BlackjackHandResult;

  if (dealerBlackjack) {
    result = hand.status === "blackjack" ? "push" : "lose";
  } else if (hand.status === "blackjack") {
    result = "blackjack";
  } else if (hand.status === "bust") {
    result = "lose";
  } else {
    const player = evaluateBlackjackHand(hand.cards);
    const dealer = evaluateBlackjackHand(dealerCards);

    if (dealer.bust || player.total > dealer.total) {
      result = "win";
    } else if (player.total < dealer.total) {
      result = "lose";
    } else {
      result = "push";
    }
  }

  const returnAmount =
    result === "blackjack"
      ? hand.wager * 2.5
      : result === "win"
        ? hand.wager * 2
        : result === "push"
          ? hand.wager
          : 0;

  return {
    result,
    returnAmount,
    netAmount: returnAmount - hand.wager,
  };
}

export function resolveBlackjackDealerTurn(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
  hitSoft17 = true,
): BlackjackRoundMutationResult {
  if (round.phase === "complete") {
    return { round, shoe };
  }

  let nextShoe = shoe;
  let dealerCards = [...round.dealer.cards];

  const hasComparablePlayerHand = round.hands.some(
    (hand) => hand.status === "stood",
  );

  if (!round.dealer.blackjack && hasComparablePlayerHand) {
    while (dealerShouldHit(dealerCards, hitSoft17)) {
      const drawn = drawBlackjackCard(nextShoe);
      dealerCards = [...dealerCards, drawn.card];
      nextShoe = drawn.shoe;
    }
  }

  const settledHands = round.hands.map((hand) => ({
    ...hand,
    ...settlementFor(hand, dealerCards, round.dealer.blackjack),
  }));

  return {
    shoe: nextShoe,
    round: {
      ...round,
      phase: "complete",
      activeSeatId: null,
      dealer: {
        cards: dealerCards,
        blackjack: round.dealer.blackjack,
      },
      hands: settledHands,
    },
  };
}

function advanceAfterFinishedHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
  finishedSeatId: BlackjackSeatId,
): BlackjackRoundMutationResult {
  const nextSeatId = nextPlayingSeatId(round.hands, finishedSeatId);

  if (nextSeatId !== null) {
    return {
      shoe,
      round: {
        ...round,
        phase: "playerTurns",
        activeSeatId: nextSeatId,
      },
    };
  }

  return resolveBlackjackDealerTurn(
    {
      ...round,
      phase: "dealerTurn",
      activeSeatId: null,
    },
    shoe,
  );
}

export function hitBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (round.phase !== "playerTurns" || round.activeSeatId === null) {
    return { round, shoe };
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.seatId === round.activeSeatId,
  );
  const activeHand = round.hands[handIndex];

  if (!activeHand || activeHand.status !== "playing") {
    return { round, shoe };
  }

  const drawn = drawBlackjackCard(shoe);
  const cards = [...activeHand.cards, drawn.card];
  const value = evaluateBlackjackHand(cards);
  const status: BlackjackRoundHandStatus = value.bust
    ? "bust"
    : value.total === 21
      ? "stood"
      : "playing";

  const hands = round.hands.map((hand, index) =>
    index === handIndex ? { ...hand, cards, status } : hand,
  );
  const nextRound: BlackjackRoundState = { ...round, hands };

  if (status === "playing") {
    return { round: nextRound, shoe: drawn.shoe };
  }

  return advanceAfterFinishedHand(nextRound, drawn.shoe, activeHand.seatId);
}

export function standBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (round.phase !== "playerTurns" || round.activeSeatId === null) {
    return { round, shoe };
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.seatId === round.activeSeatId,
  );
  const activeHand = round.hands[handIndex];

  if (!activeHand || activeHand.status !== "playing") {
    return { round, shoe };
  }

  const hands = round.hands.map((hand, index) =>
    index === handIndex ? { ...hand, status: "stood" as const } : hand,
  );

  return advanceAfterFinishedHand(
    { ...round, hands },
    shoe,
    activeHand.seatId,
  );
}

export function canDoubleBlackjackHand(round: BlackjackRoundState): boolean {
  if (round.phase !== "playerTurns" || round.activeSeatId === null) {
    return false;
  }

  const activeHand = round.hands.find(
    (hand) => hand.seatId === round.activeSeatId,
  );

  return Boolean(
    activeHand &&
      activeHand.status === "playing" &&
      activeHand.cards.length === 2 &&
      !activeHand.doubled,
  );
}

export function doubleBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (!canDoubleBlackjackHand(round) || round.activeSeatId === null) {
    return { round, shoe };
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.seatId === round.activeSeatId,
  );
  const activeHand = round.hands[handIndex];

  if (!activeHand) {
    return { round, shoe };
  }

  const drawn = drawBlackjackCard(shoe);
  const cards = [...activeHand.cards, drawn.card];
  const value = evaluateBlackjackHand(cards);
  const status: BlackjackRoundHandStatus = value.bust ? "bust" : "stood";

  const hands = round.hands.map((hand, index) =>
    index === handIndex
      ? {
          ...hand,
          cards,
          wager: hand.wager * 2,
          doubled: true,
          status,
        }
      : hand,
  );

  return advanceAfterFinishedHand(
    { ...round, hands },
    drawn.shoe,
    activeHand.seatId,
  );
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
      doubled: false,
      result: null,
      returnAmount: null,
      netAmount: null,
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

  const initialRound: BlackjackRoundState = {
    phase: activeSeatId === null ? "dealerTurn" : "playerTurns",
    hands,
    dealer: {
      cards: dealerCards,
      blackjack: dealerBlackjack,
    },
    activeSeatId,
  };

  if (activeSeatId === null) {
    return resolveBlackjackDealerTurn(initialRound, nextShoe);
  }

  return {
    shoe: nextShoe,
    round: initialRound,
  };
}
