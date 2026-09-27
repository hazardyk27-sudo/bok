import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
  BlackjackShoe,
} from "./domain";
import { doubleBlackjackCurrentHand } from "./double";
import { createBlackjackReservationBook } from "./reservations";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { startBlackjackPlayerTurns } from "./turnEngine";
import { createBlackjackWalletLedgerState } from "./walletLedger";

let sequence = 0;

function card(rank: BlackjackCard["rank"]): BlackjackCard {
  sequence += 1;
  return {
    cardId: `double-hand-card-${sequence}`,
    deckIndex: 0,
    suit: "DIAMONDS",
    rank,
  };
}

function hand(
  handId: string,
  seatNumber: 1 | 2,
  ranks: readonly BlackjackCard["rank"][],
  betCents = 4_000,
): BlackjackHand {
  return {
    handId,
    playerId: `player-${seatNumber}`,
    seatNumber,
    cards: ranks.map(card),
    betCents,
    status: "WAITING",
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  };
}

function startedRound(
  firstHand: BlackjackHand,
  secondHand?: BlackjackHand,
): BlackjackRound {
  const hands = secondHand ? [firstHand, secondHand] : [firstHand];
  const source: BlackjackRound = {
    roundId: "round-double",
    roundNumber: 1,
    phase: "INITIAL_DEAL",
    activeSeatOrder: secondHand ? [1, 2] : [1],
    hands,
    dealer: {
      cards: [card("10"), card("7")],
      holeCardRevealed: false,
    },
    currentTurn: null,
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };

  return startBlackjackPlayerTurns(source, 1_000);
}

function shoeWithNextRank(
  rank: BlackjackCard["rank"],
  shoeId: string,
): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId,
    createdAtMs: 1,
  });
  const cards = [...source.cards];
  const targetIndex = cards.findIndex((candidate) => candidate.rank === rank);
  [cards[0], cards[targetIndex]] = [cards[targetIndex], cards[0]];
  return { ...source, cards };
}

function money(balance = 20_000) {
  return {
    wallet: createBlackjackWalletLedgerState({
      userId: "user-1",
      totalBalanceCents: balance,
    }),
    book: createBlackjackReservationBook("user-1"),
  };
}

describe("blackjack DOUBLE engine", () => {
  it("reserves exactly one additional stake, draws one card and auto-stands", () => {
    const round = startedRound(hand("h1", 1, ["5", "6"]));
    const sourceShoe = shoeWithNextRank("7", "double-normal");
    const funds = money();

    const result = doubleBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "double-res-1",
        reserveTransactionId: "double-tx-1",
        nowMs: 2_000,
      },
    );

    expect(result.card.rank).toBe("7");
    expect(result.handTotal).toBe(18);
    expect(result.doubledBetCents).toBe(8_000);
    expect(result.shoe.nextIndex).toBe(sourceShoe.nextIndex + 1);
    expect(sourceShoe.nextIndex).toBe(0);
    expect(result.round.hands[0]).toMatchObject({
      handId: "h1",
      betCents: 8_000,
      isDoubled: true,
      status: "STOOD",
    });
    expect(result.round.hands[0].cards).toHaveLength(3);
    expect(result.wallet.availableBalanceCents).toBe(16_000);
    expect(result.wallet.reservedBalanceCents).toBe(4_000);
    expect(result.book.reservations[0]).toMatchObject({
      reservationId: "double-res-1",
      roundId: "round-double",
      handId: "h1",
      kind: "DOUBLE",
      amountCents: 4_000,
      status: "RESERVED",
    });
  });

  it("marks a busting Double card as BUST and still advances", () => {
    const round = startedRound(
      hand("h1", 1, ["10", "6"]),
      hand("h2", 2, ["9", "7"]),
    );
    const sourceShoe = shoeWithNextRank("K", "double-bust");
    const funds = money();

    const result = doubleBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "double-res-bust",
        reserveTransactionId: "double-tx-bust",
        nowMs: 2_000,
      },
    );

    expect(result.handTotal).toBe(26);
    expect(result.round.hands[0].status).toBe("BUST");
    expect(result.round.hands[0].isDoubled).toBe(true);
    expect(result.round.currentTurn?.handId).toBe("h2");
  });

  it("moves directly to DEALER_TURN after the final doubled hand", () => {
    const round = startedRound(hand("h1", 1, ["5", "6"]));
    const sourceShoe = shoeWithNextRank("7", "double-final");
    const funds = money();

    const result = doubleBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "double-res-final",
        reserveTransactionId: "double-tx-final",
        nowMs: 2_000,
      },
    );

    expect(result.round.phase).toBe("DEALER_TURN");
    expect(result.round.currentTurn).toBeNull();
  });

  it("allows Double After Split when V1 rules permit it", () => {
    const round = startedRound({
      ...hand("h1", 1, ["5", "6"]),
      origin: "SPLIT",
      splitDepth: 1,
    });
    const sourceShoe = shoeWithNextRank("7", "double-das");
    const funds = money();

    const result = doubleBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "double-res-das",
        reserveTransactionId: "double-tx-das",
        nowMs: 2_000,
      },
    );

    expect(result.round.hands[0].origin).toBe("SPLIT");
    expect(result.round.hands[0].isDoubled).toBe(true);
    expect(result.round.hands[0].betCents).toBe(8_000);
  });

  it("rejects insufficient funds before consuming the shoe", () => {
    const round = startedRound(hand("h1", 1, ["5", "6"]));
    const sourceShoe = shoeWithNextRank("7", "double-no-funds");
    const funds = money(3_999);

    expect(() =>
      doubleBlackjackCurrentHand(
        round,
        sourceShoe,
        funds.wallet,
        funds.book,
        {
          expectedHandId: "h1",
          expectedSeatNumber: 1,
          userId: "user-1",
          reservationId: "double-res-no-funds",
          reserveTransactionId: "double-tx-no-funds",
          nowMs: 2_000,
        },
      ),
    ).toThrow(/insufficient available balance/);

    expect(sourceShoe.nextIndex).toBe(0);
    expect(funds.wallet.availableBalanceCents).toBe(3_999);
    expect(funds.wallet.reservedBalanceCents).toBe(0);
    expect(funds.book.reservations).toHaveLength(0);
    expect(round.hands[0].status).toBe("ACTIVE");
  });

  it("rejects stale, foreign, late or illegal Double before reserving/drawing", () => {
    const round = startedRound(hand("h1", 1, ["5", "6"]));
    const sourceShoe = shoeWithNextRank("7", "double-reject");
    const funds = money();

    expect(() =>
      doubleBlackjackCurrentHand(round, sourceShoe, funds.wallet, funds.book, {
        expectedHandId: "old",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "r1",
        reserveTransactionId: "t1",
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      doubleBlackjackCurrentHand(round, sourceShoe, funds.wallet, funds.book, {
        expectedHandId: "h1",
        expectedSeatNumber: 2,
        userId: "user-1",
        reservationId: "r2",
        reserveTransactionId: "t2",
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      doubleBlackjackCurrentHand(round, sourceShoe, funds.wallet, funds.book, {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "r3",
        reserveTransactionId: "t3",
        nowMs: 16_000,
      }),
    ).toThrow(/after the turn deadline/);

    const threeCardRound: BlackjackRound = {
      ...round,
      hands: [
        {
          ...round.hands[0],
          cards: [...round.hands[0].cards, card("2")],
        },
      ],
    };
    expect(() =>
      doubleBlackjackCurrentHand(
        threeCardRound,
        sourceShoe,
        funds.wallet,
        funds.book,
        {
          expectedHandId: "h1",
          expectedSeatNumber: 1,
          userId: "user-1",
          reservationId: "r4",
          reserveTransactionId: "t4",
          nowMs: 2_000,
        },
      ),
    ).toThrow(/not legal/);

    expect(sourceShoe.nextIndex).toBe(0);
    expect(funds.wallet.availableBalanceCents).toBe(20_000);
    expect(funds.book.reservations).toHaveLength(0);
  });

  it("rejects unsafe doubled wager math before reserving or drawing", () => {
    const huge = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
    const round = startedRound(hand("h1", 1, ["5", "6"], huge));
    const sourceShoe = shoeWithNextRank("7", "double-overflow");
    const funds = money(Number.MAX_SAFE_INTEGER);

    expect(() =>
      doubleBlackjackCurrentHand(
        round,
        sourceShoe,
        funds.wallet,
        funds.book,
        {
          expectedHandId: "h1",
          expectedSeatNumber: 1,
          userId: "user-1",
          reservationId: "double-overflow-res",
          reserveTransactionId: "double-overflow-tx",
          nowMs: 2_000,
        },
      ),
    ).toThrow(/doubled bet exceeds/);

    expect(sourceShoe.nextIndex).toBe(0);
    expect(funds.wallet.reservedBalanceCents).toBe(0);
  });
});
