import {
  type BlackjackDealer,
  type BlackjackHand,
  type BlackjackPlayerId,
  type BlackjackSeatNumber,
  type BlackjackShoe,
} from "./domain";
import {
  drawNextBlackjackCard,
  getBlackjackShoeRemainingCards,
} from "./draw";
import { isNaturalBlackjack } from "./rules";
import { isBlackjackSeatNumber } from "./seats";

export type BlackjackInitialDealParticipant = Readonly<{
  playerId: BlackjackPlayerId;
  seatNumber: BlackjackSeatNumber;
  betCents: number;
}>;

export type BlackjackInitialDealEvent = Readonly<
  | {
      sequence: number;
      recipient: "PLAYER";
      seatNumber: BlackjackSeatNumber;
      pass: 1 | 2;
      cardId: string;
      faceUp: true;
    }
  | {
      sequence: number;
      recipient: "DEALER";
      pass: 1 | 2;
      cardId: string;
      faceUp: boolean;
    }
>;

export type BlackjackInitialDealResult = Readonly<{
  shoe: BlackjackShoe;
  activeSeatOrder: readonly BlackjackSeatNumber[];
  hands: readonly BlackjackHand[];
  dealer: BlackjackDealer;
  events: readonly BlackjackInitialDealEvent[];
}>;

function assertId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function assertBetCents(betCents: number): void {
  if (!Number.isSafeInteger(betCents) || betCents <= 0) {
    throw new RangeError(
      "Blackjack initial deal betCents must be a positive safe integer",
    );
  }
}

function validateParticipants(
  participants: readonly BlackjackInitialDealParticipant[],
): readonly BlackjackInitialDealParticipant[] {
  if (participants.length < 1 || participants.length > 5) {
    throw new RangeError(
      "Blackjack initial deal requires between 1 and 5 participants",
    );
  }

  const playerIds = new Set<string>();
  const seats = new Set<number>();

  for (const participant of participants) {
    assertId("playerId", participant.playerId);
    assertBetCents(participant.betCents);

    if (!isBlackjackSeatNumber(participant.seatNumber)) {
      throw new RangeError(
        "Blackjack initial deal seatNumber must be between 1 and 5",
      );
    }
    if (playerIds.has(participant.playerId)) {
      throw new Error("Blackjack initial deal contains duplicate playerId");
    }
    if (seats.has(participant.seatNumber)) {
      throw new Error("Blackjack initial deal contains duplicate seatNumber");
    }

    playerIds.add(participant.playerId);
    seats.add(participant.seatNumber);
  }

  return Object.freeze(
    [...participants].sort((a, b) => a.seatNumber - b.seatNumber),
  );
}

function createInitialHand(
  roundId: string,
  participant: BlackjackInitialDealParticipant,
): BlackjackHand {
  return {
    handId: `${roundId}:seat-${participant.seatNumber}:initial`,
    playerId: participant.playerId,
    seatNumber: participant.seatNumber,
    cards: [],
    betCents: participant.betCents,
    status: "WAITING",
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  };
}

export function dealInitialBlackjackCards(input: {
  roundId: string;
  shoe: BlackjackShoe;
  participants: readonly BlackjackInitialDealParticipant[];
}): BlackjackInitialDealResult {
  assertId("roundId", input.roundId);

  const participants = validateParticipants(input.participants);
  const cardsRequired = participants.length * 2 + 2;
  const cardsRemaining = getBlackjackShoeRemainingCards(input.shoe);

  if (cardsRemaining < cardsRequired) {
    throw new RangeError(
      `Blackjack initial deal requires ${cardsRequired} cards but only ${cardsRemaining} remain`,
    );
  }

  let shoe = input.shoe;
  const mutableHands = participants.map((participant) =>
    createInitialHand(input.roundId, participant),
  );
  const dealerCards = [];
  const events: BlackjackInitialDealEvent[] = [];
  let sequence = 0;

  for (const pass of [1, 2] as const) {
    for (let index = 0; index < participants.length; index += 1) {
      const draw = drawNextBlackjackCard(shoe);
      shoe = draw.shoe;

      const hand = mutableHands[index];
      mutableHands[index] = {
        ...hand,
        cards: [...hand.cards, draw.card],
      };

      sequence += 1;
      events.push(
        Object.freeze({
          sequence,
          recipient: "PLAYER" as const,
          seatNumber: participants[index].seatNumber,
          pass,
          cardId: draw.card.cardId,
          faceUp: true as const,
        }),
      );
    }

    const dealerDraw = drawNextBlackjackCard(shoe);
    shoe = dealerDraw.shoe;
    dealerCards.push(dealerDraw.card);

    sequence += 1;
    events.push(
      Object.freeze({
        sequence,
        recipient: "DEALER" as const,
        pass,
        cardId: dealerDraw.card.cardId,
        faceUp: pass === 1,
      }),
    );
  }

  const hands = Object.freeze(
    mutableHands.map((candidate) => {
      const completed: BlackjackHand = {
        ...candidate,
        cards: Object.freeze([...candidate.cards]),
      };
      return Object.freeze({
        ...completed,
        status: isNaturalBlackjack(completed) ? "BLACKJACK" : "WAITING",
      });
    }),
  );

  const dealer: BlackjackDealer = Object.freeze({
    cards: Object.freeze([...dealerCards]),
    holeCardRevealed: false,
  });

  return Object.freeze({
    shoe,
    activeSeatOrder: Object.freeze(
      participants.map((participant) => participant.seatNumber),
    ),
    hands,
    dealer,
    events: Object.freeze(events),
  });
}
