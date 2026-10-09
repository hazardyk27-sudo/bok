import { randomInt, randomUUID } from "node:crypto";
import {
  BLACKJACK_TABLE_MIN,
  type BlackjackDealSeat,
  type BlackjackPublicRound,
  type BlackjackServerActionName,
  type BlackjackServerActionRequest,
  type BlackjackServerSnapshot,
} from "../../../cascade-8/src/blackjack/serverContract";
import {
  canDoubleBlackjackHand,
  canSplitBlackjackHand,
  canTakeBlackjackInsurance,
  declineBlackjackInsurance,
  doubleBlackjackHand,
  getActiveBlackjackRoundHand,
  hitBlackjackHand,
  splitBlackjackHand,
  standBlackjackHand,
  startBlackjackRound,
  takeBlackjackInsurance,
  type BlackjackRoundState,
} from "../../../cascade-8/src/blackjack/roundState";
import {
  type BlackjackSeatId,
  type BlackjackSeatState,
} from "../../../cascade-8/src/blackjack/seatState";
import {
  createBlackjackShoe,
  reshuffleBlackjackShoeAtRoundBoundary,
  type BlackjackRandom,
  type BlackjackShoe,
} from "../../../cascade-8/src/blackjack/shoe";

const SEAT_IDS: BlackjackSeatId[] = [1, 2, 3, 4, 5];

export type BlackjackServerTableSession = {
  revision: number;
  roundId: string | null;
  round: BlackjackRoundState | null;
  shoe: BlackjackShoe;
};

export type BlackjackServerTableOptions = {
  random?: BlackjackRandom;
  now?: () => number;
  createRoundId?: () => string;
  createShoe?: () => BlackjackShoe;
};

export function secureBlackjackRandom(): number {
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

function isSeatId(value: number): value is BlackjackSeatId {
  return SEAT_IDS.includes(value as BlackjackSeatId);
}

export function normalizeBlackjackDealSeats(
  seats: readonly BlackjackDealSeat[] | undefined,
): BlackjackDealSeat[] {
  if (!Array.isArray(seats) || seats.length < 1 || seats.length > 5) {
    throw new Error("BLACKJACK_DEAL_SEATS_REQUIRED");
  }

  const seen = new Set<BlackjackSeatId>();
  const normalized = seats.map((seat) => {
    const seatId = seat?.seatId;
    const wager = seat?.wager;

    if (typeof seatId !== "number" || !Number.isInteger(seatId) || !isSeatId(seatId)) {
      throw new Error("BLACKJACK_INVALID_SEAT");
    }
    if (
      typeof wager !== "number" ||
      !Number.isSafeInteger(wager) ||
      wager < BLACKJACK_TABLE_MIN ||
      !Number.isSafeInteger(wager * 100)
    ) {
      throw new Error("BLACKJACK_INVALID_WAGER");
    }
    if (seen.has(seatId)) {
      throw new Error("BLACKJACK_DUPLICATE_SEAT");
    }

    seen.add(seatId);
    return { seatId, wager };
  });

  return normalized.sort((left, right) => left.seatId - right.seatId);
}

function seatStateForDeal(seats: readonly BlackjackDealSeat[]): BlackjackSeatState {
  const bySeat = new Map(seats.map((seat) => [seat.seatId, seat.wager]));
  const selectedSeatId = seats[0]?.seatId ?? null;

  return {
    selectedSeatId,
    seats: SEAT_IDS.map((id) => {
      const wager = bySeat.get(id) ?? 0;
      return {
        id,
        status: wager >= BLACKJACK_TABLE_MIN ? "betReady" as const : "empty" as const,
        bet: wager,
        chips: [],
      };
    }),
  };
}

/**
 * The core round engine knows the physical dealer hole card immediately because
 * it owns the shoe. The live table policy is NO PEEK: a dealer natural must not
 * end a playable player hand before that player has acted. If the core engine
 * already settled a dealer natural, reopen only the still-playable hands and
 * remove the early settlement values from the persisted/public state.
 */
function reopenDealerNaturalForNoPeek(round: BlackjackRoundState): BlackjackRoundState {
  if (round.phase !== "complete" || !round.dealer.blackjack) {
    return round;
  }

  const firstPlayableHand = round.hands.find((hand) => hand.status === "playing") ?? null;
  if (!firstPlayableHand) {
    return round;
  }

  return {
    ...round,
    phase: "playerTurns",
    activeHandId: firstPlayableHand.handId,
    activeSeatId: firstPlayableHand.seatId,
    hands: round.hands.map((hand) => ({
      ...hand,
      result: null,
      returnAmount: null,
      netAmount: null,
      insuranceReturnAmount:
        hand.insuranceDecision === "taken" || hand.insuranceDecision === "declined"
          ? null
          : hand.insuranceReturnAmount,
      insuranceNetAmount:
        hand.insuranceDecision === "taken" || hand.insuranceDecision === "declined"
          ? null
          : hand.insuranceNetAmount,
    })),
  };
}

/** Insurance must not leak the dealer hole-card result during NO PEEK play. */
function deferInsuranceSettlement(round: BlackjackRoundState): BlackjackRoundState {
  if (round.phase === "complete") {
    return round;
  }

  return {
    ...round,
    hands: round.hands.map((hand) =>
      hand.insuranceDecision === "taken" || hand.insuranceDecision === "declined"
        ? {
            ...hand,
            insuranceReturnAmount: null,
            insuranceNetAmount: null,
          }
        : hand,
    ),
  };
}

/** Settle insurance only when the dealer hand is actually revealed. */
function settleDeferredInsurance(round: BlackjackRoundState): BlackjackRoundState {
  if (round.phase !== "complete") {
    return round;
  }

  return {
    ...round,
    hands: round.hands.map((hand) => {
      if (hand.insuranceDecision === "taken") {
        const insuranceReturnAmount = round.dealer.blackjack
          ? hand.insuranceWager * 3
          : 0;
        return {
          ...hand,
          insuranceReturnAmount,
          insuranceNetAmount: insuranceReturnAmount - hand.insuranceWager,
        };
      }

      if (hand.insuranceDecision === "declined") {
        return {
          ...hand,
          insuranceReturnAmount: 0,
          insuranceNetAmount: 0,
        };
      }

      return hand;
    }),
  };
}

function applyCanonicalNoPeekPolicy(
  round: BlackjackRoundState,
  action: BlackjackServerActionName,
): BlackjackRoundState {
  let nextRound = round;

  if (action === "deal" || action === "insurance" || action === "declineInsurance") {
    nextRound = reopenDealerNaturalForNoPeek(nextRound);
  }

  if (action === "insurance" || action === "declineInsurance") {
    nextRound = deferInsuranceSettlement(nextRound);
  }

  if (nextRound.phase === "complete") {
    nextRound = settleDeferredInsurance(nextRound);
  }

  return nextRound;
}

export function allowedBlackjackServerActions(
  round: BlackjackRoundState | null,
): BlackjackServerActionName[] {
  if (!round) {
    return ["deal"];
  }

  if (round.phase === "insurance") {
    return canTakeBlackjackInsurance(round)
      ? ["insurance", "declineInsurance"]
      : [];
  }

  if (round.phase === "playerTurns") {
    const activeHand = getActiveBlackjackRoundHand(round);
    if (!activeHand || activeHand.status !== "playing") {
      return [];
    }

    const actions: BlackjackServerActionName[] = ["hit", "stand"];
    if (canDoubleBlackjackHand(round)) actions.push("double");
    if (canSplitBlackjackHand(round)) actions.push("split");
    return actions;
  }

  if (round.phase === "complete") {
    return ["next"];
  }

  return [];
}

export function publicBlackjackRound(round: BlackjackRoundState): BlackjackPublicRound {
  const upcard = round.dealer.cards[0];
  if (!upcard) {
    throw new Error("BLACKJACK_DEALER_UPCARD_MISSING");
  }

  const revealDealerHand = round.phase === "complete";

  return {
    phase: round.phase,
    hands: round.hands.map((hand) => ({
      ...hand,
      cards: [...hand.cards],
    })),
    dealer: {
      cards: revealDealerHand
        ? [...round.dealer.cards]
        : [upcard, null],
      blackjack: revealDealerHand ? round.dealer.blackjack : null,
    },
    activeHandId: round.activeHandId,
    activeSeatId: round.activeSeatId,
  };
}

export function createBlackjackServerSession(
  options: BlackjackServerTableOptions = {},
): BlackjackServerTableSession {
  const random = options.random ?? secureBlackjackRandom;
  const createShoe = options.createShoe ?? (() => createBlackjackShoe(random));

  return {
    revision: 0,
    roundId: null,
    round: null,
    shoe: createShoe(),
  };
}

export function snapshotBlackjackServerSession(
  session: BlackjackServerTableSession,
  walletBalanceCents: number,
  now: () => number = Date.now,
): BlackjackServerSnapshot {
  return {
    revision: session.revision,
    roundId: session.roundId,
    tableMin: BLACKJACK_TABLE_MIN,
    wallet: { balanceCents: walletBalanceCents },
    round: session.round ? publicBlackjackRound(session.round) : null,
    allowedActions: allowedBlackjackServerActions(session.round),
    shoe: {
      cardsRemaining: Math.max(0, session.shoe.cards.length - session.shoe.nextIndex),
      shufflePending: session.shoe.shufflePending,
    },
    serverTimeMs: now(),
  };
}

export function transitionBlackjackServerSession(
  current: BlackjackServerTableSession,
  request: BlackjackServerActionRequest,
  options: BlackjackServerTableOptions = {},
): BlackjackServerTableSession {
  if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
    throw new Error("BLACKJACK_REVISION_REQUIRED");
  }
  if (request.expectedRevision !== current.revision) {
    throw new Error("BLACKJACK_STALE_REVISION");
  }

  const random = options.random ?? secureBlackjackRandom;
  const createRoundId = options.createRoundId ?? randomUUID;

  let round = current.round;
  let shoe = current.shoe;
  let roundId = current.roundId;

  switch (request.action) {
    case "deal": {
      if (round !== null) {
        throw new Error("BLACKJACK_ROUND_ALREADY_ACTIVE");
      }
      const seats = normalizeBlackjackDealSeats(request.seats);
      const started = startBlackjackRound(
        seatStateForDeal(seats),
        shoe,
        BLACKJACK_TABLE_MIN,
      );
      round = started.round;
      shoe = started.shoe;
      roundId = createRoundId();
      break;
    }
    case "hit": {
      if (!round || !allowedBlackjackServerActions(round).includes("hit")) {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      const result = hitBlackjackHand(round, shoe);
      round = result.round;
      shoe = result.shoe;
      break;
    }
    case "stand": {
      if (!round || !allowedBlackjackServerActions(round).includes("stand")) {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      const result = standBlackjackHand(round, shoe);
      round = result.round;
      shoe = result.shoe;
      break;
    }
    case "double": {
      if (!round || !canDoubleBlackjackHand(round)) {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      const result = doubleBlackjackHand(round, shoe);
      round = result.round;
      shoe = result.shoe;
      break;
    }
    case "split": {
      if (!round || !canSplitBlackjackHand(round)) {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      const result = splitBlackjackHand(round, shoe);
      round = result.round;
      shoe = result.shoe;
      break;
    }
    case "insurance": {
      if (!round || !canTakeBlackjackInsurance(round)) {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      const result = takeBlackjackInsurance(round, shoe);
      round = result.round;
      shoe = result.shoe;
      break;
    }
    case "declineInsurance": {
      if (!round || !allowedBlackjackServerActions(round).includes("declineInsurance")) {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      const result = declineBlackjackInsurance(round, shoe);
      round = result.round;
      shoe = result.shoe;
      break;
    }
    case "next": {
      if (!round || round.phase !== "complete") {
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
      }
      shoe = reshuffleBlackjackShoeAtRoundBoundary(shoe, random);
      round = null;
      roundId = null;
      break;
    }
    default:
      throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
  }

  if (round) {
    round = applyCanonicalNoPeekPolicy(round, request.action);
  }

  return {
    revision: current.revision + 1,
    roundId,
    round,
    shoe,
  };
}

export class BlackjackServerTableStore {
  private readonly sessions = new Map<string, BlackjackServerTableSession>();
  private readonly options: BlackjackServerTableOptions;
  private readonly now: () => number;

  constructor(options: BlackjackServerTableOptions = {}) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  private ensureSession(sessionId: string): BlackjackServerTableSession {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const created = createBlackjackServerSession(this.options);
    this.sessions.set(sessionId, created);
    return created;
  }

  getState(sessionId: string): BlackjackServerSnapshot {
    return snapshotBlackjackServerSession(this.ensureSession(sessionId), 0, this.now);
  }

  applyAction(
    sessionId: string,
    request: BlackjackServerActionRequest,
  ): BlackjackServerSnapshot {
    const current = this.ensureSession(sessionId);
    const next = transitionBlackjackServerSession(current, request, this.options);
    this.sessions.set(sessionId, next);
    return snapshotBlackjackServerSession(next, 0, this.now);
  }

  clearForTests(): void {
    this.sessions.clear();
  }
}

export const blackjackServerTable = new BlackjackServerTableStore();
