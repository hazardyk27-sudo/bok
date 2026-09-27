import {
  type BlackjackCard,
  type BlackjackHand,
  type BlackjackPlayer,
  type BlackjackRound,
  type BlackjackSeat,
  type BlackjackTable,
} from "./domain";
import { getBlackjackShoeRemainingCards } from "./draw";

export type BlackjackPublicCard = Readonly<{
  suit: BlackjackCard["suit"];
  rank: BlackjackCard["rank"];
}>;

export type BlackjackPublicPlayer = Readonly<{
  playerId: string;
  seatNumber: BlackjackPlayer["seatNumber"];
  status: BlackjackPlayer["status"];
  connected: boolean;
}>;

export type BlackjackPublicSeat = Readonly<{
  seatNumber: BlackjackSeat["seatNumber"];
  playerId: string | null;
}>;

export type BlackjackPublicHand = Readonly<{
  handId: string;
  playerId: string;
  seatNumber: BlackjackHand["seatNumber"];
  cards: readonly BlackjackPublicCard[];
  betCents: number;
  status: BlackjackHand["status"];
  origin: BlackjackHand["origin"];
  splitDepth: number;
  isSplitAce: boolean;
  isDoubled: boolean;
  result: BlackjackHand["result"];
  payoutCents: number;
}>;

export type BlackjackPublicRound = Readonly<{
  roundId: string;
  roundNumber: number;
  phase: BlackjackRound["phase"];
  activeSeatOrder: readonly BlackjackHand["seatNumber"][];
  hands: readonly BlackjackPublicHand[];
  dealer: Readonly<{
    cards: readonly (BlackjackPublicCard | null)[];
    holeCardRevealed: boolean;
  }>;
  currentTurn: BlackjackRound["currentTurn"];
  startedAtMs: number;
  bettingClosesAtMs: number | null;
  finishedAtMs: number | null;
}>;

export type BlackjackPublicSnapshot = Readonly<{
  serverTimeMs: number;
  tableId: string;
  phase: BlackjackTable["phase"];
  maxSeats: BlackjackTable["maxSeats"];
  seats: readonly BlackjackPublicSeat[];
  players: readonly BlackjackPublicPlayer[];
  shoe: Readonly<{
    shoeId: string;
    cardsRemaining: number;
    reshufflePending: boolean;
  }>;
  round: BlackjackPublicRound | null;
  stateVersion: number;
  eventSequence: number;
}>;

function assertServerTimeMs(serverTimeMs: number): void {
  if (!Number.isSafeInteger(serverTimeMs) || serverTimeMs < 0) {
    throw new RangeError(
      "Blackjack public snapshot serverTimeMs must be a non-negative safe integer",
    );
  }
}

function publicCard(card: BlackjackCard): BlackjackPublicCard {
  return Object.freeze({
    suit: card.suit,
    rank: card.rank,
  });
}

function publicHand(hand: BlackjackHand): BlackjackPublicHand {
  return Object.freeze({
    handId: hand.handId,
    playerId: hand.playerId,
    seatNumber: hand.seatNumber,
    cards: Object.freeze(hand.cards.map(publicCard)),
    betCents: hand.betCents,
    status: hand.status,
    origin: hand.origin,
    splitDepth: hand.splitDepth,
    isSplitAce: hand.isSplitAce,
    isDoubled: hand.isDoubled,
    result: hand.result,
    payoutCents: hand.payoutCents,
  });
}

function publicRound(round: BlackjackRound): BlackjackPublicRound {
  const dealerCards = round.dealer.cards.map((card, index) =>
    round.dealer.holeCardRevealed || index === 0 ? publicCard(card) : null,
  );

  return Object.freeze({
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    phase: round.phase,
    activeSeatOrder: Object.freeze([...round.activeSeatOrder]),
    hands: Object.freeze(round.hands.map(publicHand)),
    dealer: Object.freeze({
      cards: Object.freeze(dealerCards),
      holeCardRevealed: round.dealer.holeCardRevealed,
    }),
    currentTurn:
      round.currentTurn === null
        ? null
        : Object.freeze({ ...round.currentTurn }),
    startedAtMs: round.startedAtMs,
    bettingClosesAtMs: round.bettingClosesAtMs,
    finishedAtMs: round.finishedAtMs,
  });
}

export function buildBlackjackPublicSnapshot(
  table: BlackjackTable,
  serverTimeMs: number,
): BlackjackPublicSnapshot {
  assertServerTimeMs(serverTimeMs);

  return Object.freeze({
    serverTimeMs,
    tableId: table.tableId,
    phase: table.phase,
    maxSeats: table.maxSeats,
    seats: Object.freeze(
      table.seats.map((seat) =>
        Object.freeze({
          seatNumber: seat.seatNumber,
          playerId: seat.playerId,
        }),
      ),
    ),
    players: Object.freeze(
      table.players.map((player) =>
        Object.freeze({
          playerId: player.playerId,
          seatNumber: player.seatNumber,
          status: player.status,
          connected: player.connected,
        }),
      ),
    ),
    shoe: Object.freeze({
      shoeId: table.shoe.shoeId,
      cardsRemaining: getBlackjackShoeRemainingCards(table.shoe),
      reshufflePending: table.shoe.reshufflePending,
    }),
    round: table.round === null ? null : publicRound(table.round),
    stateVersion: table.stateVersion,
    eventSequence: table.eventSequence,
  });
}
