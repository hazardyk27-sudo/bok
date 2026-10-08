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

function secureRandom(): number {
  return randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
}

function isSeatId(value: number): value is BlackjackSeatId {
  return SEAT_IDS.includes(value as BlackjackSeatId);
}

function normalizeDealSeats(seats: readonly BlackjackDealSeat[] | undefined): BlackjackDealSeat[] {
  if (!Array.isArray(seats) || seats.length < 1 || seats.length > 5) {
    throw new Error("BLACKJACK_DEAL_SEATS_REQUIRED");
  }

  const seen = new Set<BlackjackSeatId>();
  const normalized = seats.map((seat) => {
    const seatId = Number(seat?.seatId);
    const wager = Number(seat?.wager);

    if (!Number.isInteger(seatId) || !isSeatId(seatId)) {
      throw new Error("BLACKJACK_INVALID_SEAT");
    }
    if (!Number.isSafeInteger(wager) || wager < BLACKJACK_TABLE_MIN) {
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

function allowedActionsFor(round: BlackjackRoundState | null): BlackjackServerActionName[] {
  if (!round) {
    return ["deal"];
  }

  if (round.phase === "insurance") {
    return canTakeBlackjackInsurance(round)
      ? ["insurance", "declineInsurance"]
      : [];
  }

  if (round.phase === "playerTurns") {
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

function publicRound(round: BlackjackRoundState): BlackjackPublicRound {
  const upcard = round.dealer.cards[0];
  if (!upcard) {
    throw new Error("BLACKJACK_DEALER_UPCARD_MISSING");
  }

  const revealHoleCard = round.phase === "complete";
  const holeCard = revealHoleCard ? round.dealer.cards[1] ?? null : null;

  return {
    phase: round.phase,
    hands: round.hands.map((hand) => ({
      ...hand,
      cards: [...hand.cards],
    })),
    dealer: {
      cards: [upcard, holeCard],
      blackjack: revealHoleCard ? round.dealer.blackjack : null,
    },
    activeHandId: round.activeHandId,
    activeSeatId: round.activeSeatId,
  };
}

export class BlackjackServerTableStore {
  private readonly sessions = new Map<string, BlackjackServerTableSession>();
  private readonly random: BlackjackRandom;
  private readonly now: () => number;
  private readonly createRoundId: () => string;
  private readonly createShoe: () => BlackjackShoe;

  constructor(options: BlackjackServerTableOptions = {}) {
    this.random = options.random ?? secureRandom;
    this.now = options.now ?? Date.now;
    this.createRoundId = options.createRoundId ?? randomUUID;
    this.createShoe = options.createShoe ?? (() => createBlackjackShoe(this.random));
  }

  private ensureSession(sessionId: string): BlackjackServerTableSession {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    const created: BlackjackServerTableSession = {
      revision: 0,
      roundId: null,
      round: null,
      shoe: this.createShoe(),
    };
    this.sessions.set(sessionId, created);
    return created;
  }

  private snapshot(session: BlackjackServerTableSession): BlackjackServerSnapshot {
    return {
      revision: session.revision,
      roundId: session.roundId,
      tableMin: BLACKJACK_TABLE_MIN,
      round: session.round ? publicRound(session.round) : null,
      allowedActions: allowedActionsFor(session.round),
      shoe: {
        cardsRemaining: Math.max(0, session.shoe.cards.length - session.shoe.nextIndex),
        shufflePending: session.shoe.shufflePending,
      },
      serverTimeMs: this.now(),
    };
  }

  getState(sessionId: string): BlackjackServerSnapshot {
    return this.snapshot(this.ensureSession(sessionId));
  }

  applyAction(
    sessionId: string,
    request: BlackjackServerActionRequest,
  ): BlackjackServerSnapshot {
    const current = this.ensureSession(sessionId);

    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
      throw new Error("BLACKJACK_REVISION_REQUIRED");
    }
    if (request.expectedRevision !== current.revision) {
      throw new Error("BLACKJACK_STALE_REVISION");
    }

    let round = current.round;
    let shoe = current.shoe;
    let roundId = current.roundId;

    switch (request.action) {
      case "deal": {
        if (round !== null) {
          throw new Error("BLACKJACK_ROUND_ALREADY_ACTIVE");
        }
        const seats = normalizeDealSeats(request.seats);
        const started = startBlackjackRound(
          seatStateForDeal(seats),
          shoe,
          BLACKJACK_TABLE_MIN,
        );
        round = started.round;
        shoe = started.shoe;
        roundId = this.createRoundId();
        break;
      }
      case "hit": {
        if (!round || round.phase !== "playerTurns") {
          throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
        }
        const result = hitBlackjackHand(round, shoe);
        round = result.round;
        shoe = result.shoe;
        break;
      }
      case "stand": {
        if (!round || round.phase !== "playerTurns") {
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
        if (!round || round.phase !== "insurance" || !round.activeHandId) {
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
        shoe = reshuffleBlackjackShoeAtRoundBoundary(shoe, this.random);
        round = null;
        roundId = null;
        break;
      }
      default:
        throw new Error("BLACKJACK_ACTION_NOT_ALLOWED");
    }

    const next: BlackjackServerTableSession = {
      revision: current.revision + 1,
      roundId,
      round,
      shoe,
    };
    this.sessions.set(sessionId, next);
    return this.snapshot(next);
  }

  clearForTests(): void {
    this.sessions.clear();
  }
}

export const blackjackServerTable = new BlackjackServerTableStore();
