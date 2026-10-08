import {
  dealerShouldHit,
  evaluateBlackjackHand,
  getBlackjackRankValue,
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

export const BLACKJACK_MAX_HANDS_PER_SEAT = 4;

export type BlackjackRoundPhase = "playerTurns" | "dealerTurn" | "complete";

export type BlackjackRoundHandStatus =
  | "playing"
  | "stood"
  | "bust"
  | "blackjack";

export type BlackjackHandResult = "win" | "lose" | "push" | "blackjack";

export type BlackjackRoundHand = {
  handId: string;
  seatId: BlackjackSeatId;
  handIndex: number;
  splitDepth: number;
  splitFromAces: boolean;
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
  activeHandId: string | null;
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

export function getActiveBlackjackRoundHand(
  round: BlackjackRoundState,
): BlackjackRoundHand | null {
  if (round.activeHandId === null) {
    return null;
  }

  return round.hands.find((hand) => hand.handId === round.activeHandId) ?? null;
}

function withActiveHand(
  round: BlackjackRoundState,
  activeHandId: string | null,
): BlackjackRoundState {
  const activeHand = activeHandId
    ? round.hands.find((hand) => hand.handId === activeHandId) ?? null
    : null;

  return {
    ...round,
    activeHandId: activeHand?.handId ?? null,
    activeSeatId: activeHand?.seatId ?? null,
  };
}

function nextPlayingHandId(
  hands: readonly BlackjackRoundHand[],
  afterHandId: string,
): string | null {
  const startIndex = hands.findIndex((hand) => hand.handId === afterHandId);

  for (let index = startIndex + 1; index < hands.length; index += 1) {
    const hand = hands[index];
    if (hand?.status === "playing") {
      return hand.handId;
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
      activeHandId: null,
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
  finishedHandId: string,
): BlackjackRoundMutationResult {
  const nextHandId = nextPlayingHandId(round.hands, finishedHandId);

  if (nextHandId !== null) {
    return {
      shoe,
      round: withActiveHand(
        {
          ...round,
          phase: "playerTurns",
        },
        nextHandId,
      ),
    };
  }

  return resolveBlackjackDealerTurn(
    {
      ...round,
      phase: "dealerTurn",
      activeHandId: null,
      activeSeatId: null,
    },
    shoe,
  );
}

export function hitBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (round.phase !== "playerTurns") {
    return { round, shoe };
  }

  const activeHand = getActiveBlackjackRoundHand(round);
  if (
    !activeHand ||
    activeHand.status !== "playing" ||
    activeHand.splitFromAces
  ) {
    return { round, shoe };
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === activeHand.handId,
  );
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

  return advanceAfterFinishedHand(nextRound, drawn.shoe, activeHand.handId);
}

export function standBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (round.phase !== "playerTurns") {
    return { round, shoe };
  }

  const activeHand = getActiveBlackjackRoundHand(round);
  if (!activeHand || activeHand.status !== "playing") {
    return { round, shoe };
  }

  const hands = round.hands.map((hand) =>
    hand.handId === activeHand.handId
      ? { ...hand, status: "stood" as const }
      : hand,
  );

  return advanceAfterFinishedHand(
    { ...round, hands },
    shoe,
    activeHand.handId,
  );
}

export function canDoubleBlackjackHand(round: BlackjackRoundState): boolean {
  if (round.phase !== "playerTurns") {
    return false;
  }

  const activeHand = getActiveBlackjackRoundHand(round);

  return Boolean(
    activeHand &&
      activeHand.status === "playing" &&
      activeHand.cards.length === 2 &&
      !activeHand.doubled &&
      !activeHand.splitFromAces,
  );
}

export function doubleBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (!canDoubleBlackjackHand(round)) {
    return { round, shoe };
  }

  const activeHand = getActiveBlackjackRoundHand(round);
  if (!activeHand) {
    return { round, shoe };
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === activeHand.handId,
  );
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
    activeHand.handId,
  );
}

export function canSplitBlackjackHand(round: BlackjackRoundState): boolean {
  if (round.phase !== "playerTurns") {
    return false;
  }

  const activeHand = getActiveBlackjackRoundHand(round);
  if (
    !activeHand ||
    activeHand.status !== "playing" ||
    activeHand.cards.length !== 2 ||
    activeHand.doubled ||
    activeHand.splitFromAces
  ) {
    return false;
  }

  const seatHandCount = round.hands.filter(
    (hand) => hand.seatId === activeHand.seatId,
  ).length;
  if (seatHandCount >= BLACKJACK_MAX_HANDS_PER_SEAT) {
    return false;
  }

  const [first, second] = activeHand.cards;
  if (!first || !second) {
    return false;
  }

  return getBlackjackRankValue(first.rank) === getBlackjackRankValue(second.rank);
}

function splitHandStatus(
  cards: readonly BlackjackCard[],
  splitFromAces: boolean,
): BlackjackRoundHandStatus {
  if (splitFromAces) {
    return "stood";
  }

  const value = evaluateBlackjackHand(cards);
  return value.total === 21 ? "stood" : "playing";
}

function reindexSeatHands(
  hands: readonly BlackjackRoundHand[],
  seatId: BlackjackSeatId,
): BlackjackRoundHand[] {
  let handIndex = 0;

  return hands.map((hand) => {
    if (hand.seatId !== seatId) {
      return hand;
    }

    const reindexed = { ...hand, handIndex };
    handIndex += 1;
    return reindexed;
  });
}

export function splitBlackjackHand(
  round: BlackjackRoundState,
  shoe: BlackjackShoe,
): BlackjackRoundMutationResult {
  if (!canSplitBlackjackHand(round)) {
    return { round, shoe };
  }

  const activeHand = getActiveBlackjackRoundHand(round);
  if (!activeHand) {
    return { round, shoe };
  }

  const [firstCard, secondCard] = activeHand.cards;
  if (!firstCard || !secondCard) {
    return { round, shoe };
  }

  const firstDraw = drawBlackjackCard(shoe);
  const secondDraw = drawBlackjackCard(firstDraw.shoe);
  const firstCards = [firstCard, firstDraw.card];
  const secondCards = [secondCard, secondDraw.card];
  const splittingAces = firstCard.rank === "A" && secondCard.rank === "A";
  const splitDepth = activeHand.splitDepth + 1;

  const firstHand: BlackjackRoundHand = {
    ...activeHand,
    handId: `${activeHand.handId}-L`,
    splitDepth,
    splitFromAces: splittingAces,
    cards: firstCards,
    status: splitHandStatus(firstCards, splittingAces),
    doubled: false,
    result: null,
    returnAmount: null,
    netAmount: null,
  };
  const secondHand: BlackjackRoundHand = {
    ...activeHand,
    handId: `${activeHand.handId}-R`,
    splitDepth,
    splitFromAces: splittingAces,
    cards: secondCards,
    status: splitHandStatus(secondCards, splittingAces),
    doubled: false,
    result: null,
    returnAmount: null,
    netAmount: null,
  };

  const activeIndex = round.hands.findIndex(
    (hand) => hand.handId === activeHand.handId,
  );
  const insertedHands = [
    ...round.hands.slice(0, activeIndex),
    firstHand,
    secondHand,
    ...round.hands.slice(activeIndex + 1),
  ];
  const hands = reindexSeatHands(insertedHands, activeHand.seatId);
  const nextRound: BlackjackRoundState = { ...round, hands };
  const nextFirst = hands.find((hand) => hand.handId === firstHand.handId) ?? firstHand;
  const nextSecond = hands.find((hand) => hand.handId === secondHand.handId) ?? secondHand;

  if (nextFirst.status === "playing") {
    return {
      shoe: secondDraw.shoe,
      round: withActiveHand(nextRound, nextFirst.handId),
    };
  }

  if (nextSecond.status === "playing") {
    return {
      shoe: secondDraw.shoe,
      round: withActiveHand(nextRound, nextSecond.handId),
    };
  }

  return advanceAfterFinishedHand(
    nextRound,
    secondDraw.shoe,
    nextSecond.handId,
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
      handId: `seat-${seatId}-hand-0`,
      seatId,
      handIndex: 0,
      splitDepth: 0,
      splitFromAces: false,
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
  const activeHand = dealerBlackjack
    ? null
    : hands.find((hand) => hand.status === "playing") ?? null;

  const initialRound: BlackjackRoundState = {
    phase: activeHand === null ? "dealerTurn" : "playerTurns",
    hands,
    dealer: {
      cards: dealerCards,
      blackjack: dealerBlackjack,
    },
    activeHandId: activeHand?.handId ?? null,
    activeSeatId: activeHand?.seatId ?? null,
  };

  if (activeHand === null) {
    return resolveBlackjackDealerTurn(initialRound, nextShoe);
  }

  return {
    shoe: nextShoe,
    round: initialRound,
  };
}
