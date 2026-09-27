import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
  BlackjackShoe,
} from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { splitBlackjackCurrentHand } from "./split";
import { startBlackjackPlayerTurns } from "./turnEngine";
import { createBlackjackWalletLedgerState } from "./walletLedger";

let sequence = 0;

function card(rank: BlackjackCard["rank"]): BlackjackCard {
  sequence += 1;
  return {
    cardId: `split-hand-card-${sequence}`,
    deckIndex: 0,
    suit: "SPADES",
    rank,
  };
}

function hand(
  handId: string,
  seatNumber: 1 | 2,
  ranks: readonly BlackjackCard["rank"][],
  playerId = `player-${seatNumber}`,
): BlackjackHand {
  return {
    handId,
    playerId,
    seatNumber,
    cards: ranks.map(card),
    betCents: 4_000,
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
  otherHands: readonly BlackjackHand[] = [],
  activeSeatOrder: readonly (1 | 2)[] = [1],
): BlackjackRound {
  const source: BlackjackRound = {
    roundId: "round-split",
    roundNumber: 1,
    phase: "INITIAL_DEAL",
    activeSeatOrder,
    hands: [firstHand, ...otherHands],
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

function shoeWithNextRanks(
  firstRank: BlackjackCard["rank"],
  secondRank: BlackjackCard["rank"],
  shoeId: string,
): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId,
    createdAtMs: 1,
  });
  const cards = [...source.cards];

  const firstIndex = cards.findIndex((candidate) => candidate.rank === firstRank);
  [cards[0], cards[firstIndex]] = [cards[firstIndex], cards[0]];

  const secondIndex = cards.findIndex(
    (candidate, index) => index !== 0 && candidate.rank === secondRank,
  );
  [cards[1], cards[secondIndex]] = [cards[secondIndex], cards[1]];

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

describe("blackjack SPLIT engine", () => {
  it("splits one pair into two hands and deals opening cards left then right", () => {
    const round = startedRound(hand("h1", 1, ["8", "8"]));
    const sourceShoe = shoeWithNextRanks("3", "4", "split-normal");
    const funds = money();

    const result = splitBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "split-res-1",
        reserveTransactionId: "split-tx-1",
        nowMs: 2_000,
      },
    );

    expect(result.leftCard.rank).toBe("3");
    expect(result.rightCard.rank).toBe("4");
    expect(result.shoe.nextIndex).toBe(sourceShoe.nextIndex + 2);
    expect(sourceShoe.nextIndex).toBe(0);

    expect(result.round.hands).toHaveLength(2);
    expect(result.round.hands[0]).toMatchObject({
      handId: "h1",
      origin: "SPLIT",
      splitDepth: 1,
      betCents: 4_000,
      status: "ACTIVE",
      isSplitAce: false,
    });
    expect(result.round.hands[0].cards.map((candidate) => candidate.rank)).toEqual([
      "8",
      "3",
    ]);
    expect(result.round.hands[1]).toMatchObject({
      handId: result.rightHandId,
      origin: "SPLIT",
      splitDepth: 1,
      betCents: 4_000,
      status: "WAITING",
      isSplitAce: false,
    });
    expect(result.round.hands[1].cards.map((candidate) => candidate.rank)).toEqual([
      "8",
      "4",
    ]);

    expect(result.round.currentTurn).toEqual({
      seatNumber: 1,
      handId: "h1",
      startedAtMs: 2_000,
      endsAtMs: 17_000,
    });

    expect(result.wallet.availableBalanceCents).toBe(16_000);
    expect(result.wallet.reservedBalanceCents).toBe(4_000);
    expect(result.book.reservations[0]).toMatchObject({
      reservationId: "split-res-1",
      roundId: "round-split",
      handId: result.rightHandId,
      kind: "SPLIT",
      amountCents: 4_000,
      status: "RESERVED",
    });
  });

  it("auto-stands a split hand opening on 21 and activates the right hand", () => {
    const round = startedRound(hand("h1", 1, ["10", "10"]));
    const sourceShoe = shoeWithNextRanks("A", "5", "split-left-21");
    const funds = money();

    const result = splitBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "split-res-21",
        reserveTransactionId: "split-tx-21",
        nowMs: 2_000,
      },
    );

    expect(result.round.hands[0].status).toBe("STOOD");
    expect(result.round.hands[1].status).toBe("ACTIVE");
    expect(result.round.currentTurn?.handId).toBe(result.rightHandId);
    expect(result.round.currentTurn?.startedAtMs).toBe(2_000);
  });

  it("gives split Aces one card each and auto-stands both under V1", () => {
    const round = startedRound(hand("h1", 1, ["A", "A"]));
    const sourceShoe = shoeWithNextRanks("K", "9", "split-aces");
    const funds = money();

    const result = splitBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "split-res-aces",
        reserveTransactionId: "split-tx-aces",
        nowMs: 2_000,
      },
    );

    expect(result.round.hands).toHaveLength(2);
    expect(result.round.hands[0]).toMatchObject({
      status: "STOOD",
      origin: "SPLIT",
      isSplitAce: true,
    });
    expect(result.round.hands[1]).toMatchObject({
      status: "STOOD",
      origin: "SPLIT",
      isSplitAce: true,
    });
    expect(result.round.hands[0].cards.map((candidate) => candidate.rank)).toEqual([
      "A",
      "K",
    ]);
    expect(result.round.hands[1].cards.map((candidate) => candidate.rank)).toEqual([
      "A",
      "9",
    ]);
    expect(result.round.phase).toBe("DEALER_TURN");
    expect(result.round.currentTurn).toBeNull();
  });

  it("after auto-resolved split Aces advances to the next player's hand", () => {
    const first = hand("h1", 1, ["A", "A"]);
    const second = hand("h2", 2, ["9", "7"]);
    const round = startedRound(first, [second], [1, 2]);
    const sourceShoe = shoeWithNextRanks("K", "9", "split-aces-next-player");
    const funds = money();

    const result = splitBlackjackCurrentHand(
      round,
      sourceShoe,
      funds.wallet,
      funds.book,
      {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "split-res-next",
        reserveTransactionId: "split-tx-next",
        nowMs: 2_000,
      },
    );

    expect(result.round.currentTurn?.handId).toBe("h2");
    expect(result.round.currentTurn?.seatNumber).toBe(2);
    expect(result.round.hands.find((candidate) => candidate.handId === "h2")?.status).toBe(
      "ACTIVE",
    );
  });

  it("rejects insufficient funds before drawing either opening card", () => {
    const round = startedRound(hand("h1", 1, ["8", "8"]));
    const sourceShoe = shoeWithNextRanks("3", "4", "split-no-funds");
    const funds = money(3_999);

    expect(() =>
      splitBlackjackCurrentHand(
        round,
        sourceShoe,
        funds.wallet,
        funds.book,
        {
          expectedHandId: "h1",
          expectedSeatNumber: 1,
          userId: "user-1",
          reservationId: "split-res-no-funds",
          reserveTransactionId: "split-tx-no-funds",
          nowMs: 2_000,
        },
      ),
    ).toThrow(/insufficient available balance/);

    expect(sourceShoe.nextIndex).toBe(0);
    expect(funds.wallet.reservedBalanceCents).toBe(0);
    expect(funds.book.reservations).toHaveLength(0);
    expect(round.hands).toHaveLength(1);
  });

  it("rejects stale, foreign, late and non-pair split requests", () => {
    const round = startedRound(hand("h1", 1, ["8", "8"]));
    const sourceShoe = shoeWithNextRanks("3", "4", "split-reject");
    const funds = money();

    expect(() =>
      splitBlackjackCurrentHand(round, sourceShoe, funds.wallet, funds.book, {
        expectedHandId: "old",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "r1",
        reserveTransactionId: "t1",
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      splitBlackjackCurrentHand(round, sourceShoe, funds.wallet, funds.book, {
        expectedHandId: "h1",
        expectedSeatNumber: 2,
        userId: "user-1",
        reservationId: "r2",
        reserveTransactionId: "t2",
        nowMs: 2_000,
      }),
    ).toThrow(/stale or foreign/);

    expect(() =>
      splitBlackjackCurrentHand(round, sourceShoe, funds.wallet, funds.book, {
        expectedHandId: "h1",
        expectedSeatNumber: 1,
        userId: "user-1",
        reservationId: "r3",
        reserveTransactionId: "t3",
        nowMs: 16_000,
      }),
    ).toThrow(/after the turn deadline/);

    const nonPair: BlackjackRound = {
      ...round,
      hands: [
        {
          ...round.hands[0],
          cards: [card("8"), card("9")],
        },
      ],
    };
    expect(() =>
      splitBlackjackCurrentHand(
        nonPair,
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
    expect(funds.wallet.reservedBalanceCents).toBe(0);
  });

  it("enforces the four-hand V1 split limit before reserving or drawing", () => {
    const h1 = hand("h1", 1, ["8", "8"], "player-1");
    const h2 = hand("h2", 1, ["5", "6"], "player-1");
    const h3 = hand("h3", 1, ["7", "4"], "player-1");
    const h4 = hand("h4", 1, ["9", "2"], "player-1");
    const round = startedRound(h1, [h2, h3, h4], [1]);
    const sourceShoe = shoeWithNextRanks("3", "4", "split-max");
    const funds = money();

    expect(() =>
      splitBlackjackCurrentHand(
        round,
        sourceShoe,
        funds.wallet,
        funds.book,
        {
          expectedHandId: "h1",
          expectedSeatNumber: 1,
          userId: "user-1",
          reservationId: "split-res-max",
          reserveTransactionId: "split-tx-max",
          nowMs: 2_000,
        },
      ),
    ).toThrow(/not legal/);

    expect(sourceShoe.nextIndex).toBe(0);
    expect(funds.wallet.reservedBalanceCents).toBe(0);
  });
});
