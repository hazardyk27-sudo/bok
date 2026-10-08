import type { BlackjackCard } from "./blackjackCore";
import type {
  BlackjackInsuranceDecision,
  BlackjackHandResult,
  BlackjackRoundHandStatus,
  BlackjackRoundPhase,
} from "./roundState";
import type { BlackjackSeatId } from "./seatState";

export const BLACKJACK_TABLE_MIN = 10;

export type BlackjackServerActionName =
  | "deal"
  | "hit"
  | "stand"
  | "double"
  | "split"
  | "insurance"
  | "declineInsurance"
  | "next";

export type BlackjackDealSeat = {
  seatId: BlackjackSeatId;
  wager: number;
};

export type BlackjackServerActionRequest = {
  expectedRevision: number;
  idempotencyKey: string;
  action: BlackjackServerActionName;
  seats?: BlackjackDealSeat[];
};

export type BlackjackPublicHand = {
  handId: string;
  seatId: BlackjackSeatId;
  handIndex: number;
  splitDepth: number;
  splitFromAces: boolean;
  wager: number;
  cards: BlackjackCard[];
  status: BlackjackRoundHandStatus;
  doubled: boolean;
  insuranceDecision: BlackjackInsuranceDecision;
  insuranceWager: number;
  insuranceReturnAmount: number | null;
  insuranceNetAmount: number | null;
  result: BlackjackHandResult | null;
  returnAmount: number | null;
  netAmount: number | null;
};

export type BlackjackPublicDealer = {
  cards: [BlackjackCard, BlackjackCard | null];
  blackjack: boolean | null;
};

export type BlackjackPublicRound = {
  phase: BlackjackRoundPhase;
  hands: BlackjackPublicHand[];
  dealer: BlackjackPublicDealer;
  activeHandId: string | null;
  activeSeatId: BlackjackSeatId | null;
};

export type BlackjackServerSnapshot = {
  revision: number;
  roundId: string | null;
  tableMin: number;
  wallet: {
    balanceCents: number;
  };
  round: BlackjackPublicRound | null;
  allowedActions: BlackjackServerActionName[];
  shoe: {
    cardsRemaining: number;
    shufflePending: boolean;
  };
  serverTimeMs: number;
};

export type BlackjackServerErrorPayload = {
  error: string;
  snapshot?: BlackjackServerSnapshot;
};
