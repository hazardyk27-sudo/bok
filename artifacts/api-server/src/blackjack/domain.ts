export const BLACKJACK_SUITS = [
  "CLUBS",
  "DIAMONDS",
  "HEARTS",
  "SPADES",
] as const;

export type BlackjackSuit = (typeof BLACKJACK_SUITS)[number];

export const BLACKJACK_RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;

export type BlackjackRank = (typeof BLACKJACK_RANKS)[number];

export const BLACKJACK_MAX_SEATS = 5 as const;
export const BLACKJACK_DECK_COUNT = 6 as const;
export const BLACKJACK_CARDS_PER_DECK = 52 as const;
export const BLACKJACK_SHOE_SIZE =
  BLACKJACK_DECK_COUNT * BLACKJACK_CARDS_PER_DECK;

export type BlackjackTableId = string;
export type BlackjackRoundId = string;
export type BlackjackShoeId = string;
export type BlackjackPlayerId = string;
export type BlackjackUserId = string;
export type BlackjackSessionId = string;
export type BlackjackHandId = string;
export type BlackjackBetId = string;
export type BlackjackTransactionId = string;
export type BlackjackActionId = string;

export type BlackjackSeatNumber = 1 | 2 | 3 | 4 | 5;

export type BlackjackCard = Readonly<{
  cardId: string;
  deckIndex: number;
  suit: BlackjackSuit;
  rank: BlackjackRank;
}>;

export type BlackjackShoe = Readonly<{
  shoeId: BlackjackShoeId;
  cards: readonly BlackjackCard[];
  nextIndex: number;
  reshufflePending: boolean;
  createdAtMs: number;
  shuffleAlgorithmVersion: string;
}>;

export const BLACKJACK_HAND_STATUSES = [
  "WAITING",
  "ACTIVE",
  "STOOD",
  "BUST",
  "BLACKJACK",
  "COMPLETE",
] as const;

export type BlackjackHandStatus =
  (typeof BLACKJACK_HAND_STATUSES)[number];

export const BLACKJACK_HAND_ORIGINS = [
  "INITIAL",
  "SPLIT",
] as const;

export type BlackjackHandOrigin =
  (typeof BLACKJACK_HAND_ORIGINS)[number];

export const BLACKJACK_HAND_RESULTS = [
  "WIN",
  "LOSS",
  "PUSH",
  "BLACKJACK_WIN",
] as const;

export type BlackjackHandResult =
  (typeof BLACKJACK_HAND_RESULTS)[number];

export type BlackjackHand = Readonly<{
  handId: BlackjackHandId;
  playerId: BlackjackPlayerId;
  seatNumber: BlackjackSeatNumber;
  cards: readonly BlackjackCard[];
  betCents: number;
  status: BlackjackHandStatus;
  origin: BlackjackHandOrigin;
  splitDepth: number;
  isSplitAce: boolean;
  isDoubled: boolean;
  result: BlackjackHandResult | null;
  payoutCents: number;
}>;

export const BLACKJACK_PLAYER_STATUSES = [
  "SEATED_WAITING",
  "BETTING",
  "READY",
  "PLAYING",
  "DISCONNECTED",
] as const;

export type BlackjackPlayerStatus =
  (typeof BLACKJACK_PLAYER_STATUSES)[number];

export type BlackjackPlayer = Readonly<{
  playerId: BlackjackPlayerId;
  userId: BlackjackUserId;
  sessionId: BlackjackSessionId;
  seatNumber: BlackjackSeatNumber;
  status: BlackjackPlayerStatus;
  connected: boolean;
  disconnectedAtMs: number | null;
  handIds: readonly BlackjackHandId[];
}>;

export type BlackjackSeat = Readonly<{
  seatNumber: BlackjackSeatNumber;
  playerId: BlackjackPlayerId | null;
}>;

export type BlackjackDealer = Readonly<{
  cards: readonly BlackjackCard[];
  holeCardRevealed: boolean;
}>;

export const BLACKJACK_ROUND_PHASES = [
  "BETTING",
  "BETTING_LOCKED",
  "INITIAL_DEAL",
  "PLAYER_TURNS",
  "DEALER_TURN",
  "SETTLEMENT",
  "ROUND_END",
] as const;

export type BlackjackRoundPhase =
  (typeof BLACKJACK_ROUND_PHASES)[number];

export const BLACKJACK_TABLE_PHASES = [
  "TABLE_IDLE",
  "SHUFFLING",
  ...BLACKJACK_ROUND_PHASES,
  "RECOVERING",
] as const;

export type BlackjackTablePhase =
  (typeof BLACKJACK_TABLE_PHASES)[number];

export type BlackjackTurn = Readonly<{
  seatNumber: BlackjackSeatNumber;
  handId: BlackjackHandId;
  startedAtMs: number;
  endsAtMs: number;
}>;

export type BlackjackRound = Readonly<{
  roundId: BlackjackRoundId;
  roundNumber: number;
  phase: BlackjackRoundPhase;
  activeSeatOrder: readonly BlackjackSeatNumber[];
  hands: readonly BlackjackHand[];
  dealer: BlackjackDealer;
  currentTurn: BlackjackTurn | null;
  startedAtMs: number;
  bettingClosesAtMs: number | null;
  finishedAtMs: number | null;
}>;

export const BLACKJACK_BET_KINDS = [
  "INITIAL",
  "DOUBLE",
  "SPLIT",
] as const;

export type BlackjackBetKind =
  (typeof BLACKJACK_BET_KINDS)[number];

export const BLACKJACK_BET_STATUSES = [
  "RESERVED",
  "SETTLED",
  "RELEASED",
] as const;

export type BlackjackBetStatus =
  (typeof BLACKJACK_BET_STATUSES)[number];

export type BlackjackBet = Readonly<{
  betId: BlackjackBetId;
  roundId: BlackjackRoundId;
  playerId: BlackjackPlayerId;
  handId: BlackjackHandId | null;
  kind: BlackjackBetKind;
  amountCents: number;
  status: BlackjackBetStatus;
  createdAtMs: number;
}>;

export const BLACKJACK_WALLET_TRANSACTION_TYPES = [
  "BET_RESERVE",
  "DOUBLE_RESERVE",
  "SPLIT_RESERVE",
  "WIN_PAYOUT",
  "BLACKJACK_PAYOUT",
  "PUSH_RETURN",
  "BET_RELEASE",
] as const;

export type BlackjackWalletTransactionType =
  (typeof BLACKJACK_WALLET_TRANSACTION_TYPES)[number];

export type BlackjackWalletTransaction = Readonly<{
  transactionId: BlackjackTransactionId;
  userId: BlackjackUserId;
  roundId: BlackjackRoundId;
  handId: BlackjackHandId | null;
  type: BlackjackWalletTransactionType;
  deltaCents: number;
  createdAtMs: number;
}>;

export type BlackjackTable = Readonly<{
  tableId: BlackjackTableId;
  phase: BlackjackTablePhase;
  maxSeats: typeof BLACKJACK_MAX_SEATS;
  seats: readonly BlackjackSeat[];
  players: readonly BlackjackPlayer[];
  shoe: BlackjackShoe;
  round: BlackjackRound | null;
  stateVersion: number;
  eventSequence: number;
}>;

export function createEmptyBlackjackSeats(): readonly BlackjackSeat[] {
  return [1, 2, 3, 4, 5].map((seatNumber) => ({
    seatNumber: seatNumber as BlackjackSeatNumber,
    playerId: null,
  }));
}

export function isValidBlackjackMoneyCents(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
