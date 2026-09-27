import { describe, expect, it } from "vitest";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
} from "./domain";
import {
  createBlackjackReservationBook,
  reserveBlackjackWager,
  settleBlackjackWagerReservation,
} from "./reservations";
import {
  type BlackjackSettlementAccount,
  settleBlackjackRound,
} from "./settlement";
import { createBlackjackWalletLedgerState } from "./walletLedger";

let cardSequence = 0;

function card(rank: BlackjackCard["rank"]): BlackjackCard {
  cardSequence += 1;
  return {
    cardId: `settlement-card-${cardSequence}`,
    deckIndex: 0,
    suit: "CLUBS",
    rank,
  };
}

function hand(input: {
  handId: string;
  playerId?: string;
  seatNumber?: 1 | 2;
  ranks: readonly BlackjackCard["rank"][];
  betCents: number;
  status?: BlackjackHand["status"];
  origin?: BlackjackHand["origin"];
  isDoubled?: boolean;
}): BlackjackHand {
  return {
    handId: input.handId,
    playerId: input.playerId ?? "player-1",
    seatNumber: input.seatNumber ?? 1,
    cards: input.ranks.map(card),
    betCents: input.betCents,
    status: input.status ?? "STOOD",
    origin: input.origin ?? "INITIAL",
    splitDepth: input.origin === "SPLIT" ? 1 : 0,
    isSplitAce: false,
    isDoubled: input.isDoubled ?? false,
    result: null,
    payoutCents: 0,
  };
}

function round(
  hands: readonly BlackjackHand[],
  dealerRanks: readonly BlackjackCard["rank"][],
): BlackjackRound {
  return {
    roundId: "round-settlement",
    roundNumber: 1,
    phase: "SETTLEMENT",
    activeSeatOrder: Array.from(
      new Set(hands.map((candidate) => candidate.seatNumber)),
    ),
    hands,
    dealer: {
      cards: dealerRanks.map(card),
      holeCardRevealed: true,
    },
    currentTurn: null,
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };
}

function emptyAccount(
  playerId = "player-1",
  userId = "user-1",
  balance = 20_000,
): BlackjackSettlementAccount {
  return {
    playerId,
    userId,
    wallet: createBlackjackWalletLedgerState({
      userId,
      totalBalanceCents: balance,
    }),
    book: createBlackjackReservationBook(userId),
  };
}

function reserve(
  account: BlackjackSettlementAccount,
  input: {
    reservationId: string;
    handId: string;
    amountCents: number;
    kind?: "INITIAL" | "DOUBLE" | "SPLIT";
  },
): BlackjackSettlementAccount {
  const reserved = reserveBlackjackWager(account.wallet, account.book, {
    reservationId: input.reservationId,
    reserveTransactionId: `reserve:${input.reservationId}`,
    userId: account.userId,
    roundId: "round-settlement",
    handId: input.handId,
    kind: input.kind ?? "INITIAL",
    amountCents: input.amountCents,
    createdAtMs: 1,
  });

  return {
    ...account,
    wallet: reserved.wallet,
    book: reserved.book,
  };
}

describe("blackjack round settlement", () => {
  it("settles a normal win and marks the hand COMPLETE", () => {
    const h1 = hand({
      handId: "h1",
      ranks: ["10", "8"],
      betCents: 4_000,
    });
    const account = reserve(emptyAccount(), {
      reservationId: "r-h1",
      handId: "h1",
      amountCents: 4_000,
    });

    const result = settleBlackjackRound(
      round([h1], ["10", "7"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 10 },
    );

    expect(result.hands[0]).toMatchObject({
      handId: "h1",
      result: "WIN",
      stakeCents: 4_000,
      returnCents: 8_000,
      reservationCount: 1,
    });
    expect(result.round.hands[0]).toMatchObject({
      status: "COMPLETE",
      result: "WIN",
      payoutCents: 8_000,
    });
    expect(result.round.phase).toBe("ROUND_END");
    expect(result.round.finishedAtMs).toBe(10);
    expect(result.accounts[0].wallet.availableBalanceCents).toBe(24_000);
    expect(result.accounts[0].wallet.reservedBalanceCents).toBe(0);
  });

  it("settles loss and push without money drift", () => {
    const losing = hand({
      handId: "loss",
      ranks: ["10", "6"],
      betCents: 4_000,
    });
    const pushing = hand({
      handId: "push",
      ranks: ["10", "7"],
      betCents: 3_000,
    });

    let account = emptyAccount();
    account = reserve(account, {
      reservationId: "r-loss",
      handId: "loss",
      amountCents: 4_000,
    });
    account = reserve(account, {
      reservationId: "r-push",
      handId: "push",
      amountCents: 3_000,
      kind: "SPLIT",
    });

    const result = settleBlackjackRound(
      round([losing, pushing], ["10", "7"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 20 },
    );

    expect(result.hands.map((summary) => summary.result)).toEqual([
      "LOSS",
      "PUSH",
    ]);
    expect(result.accounts[0].wallet.availableBalanceCents).toBe(16_000);
    expect(result.accounts[0].wallet.reservedBalanceCents).toBe(0);
  });

  it("pays natural Blackjack at exact 3:2", () => {
    const blackjack = hand({
      handId: "bj",
      ranks: ["A", "K"],
      betCents: 4_000,
      status: "BLACKJACK",
    });
    const account = reserve(emptyAccount(), {
      reservationId: "r-bj",
      handId: "bj",
      amountCents: 4_000,
    });

    const result = settleBlackjackRound(
      round([blackjack], ["10", "9"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 30 },
    );

    expect(result.hands[0].result).toBe("BLACKJACK_WIN");
    expect(result.hands[0].returnCents).toBe(10_000);
    expect(result.accounts[0].wallet.availableBalanceCents).toBe(26_000);
  });

  it("pushes natural Blackjack against dealer natural Blackjack", () => {
    const blackjack = hand({
      handId: "bj-push",
      ranks: ["A", "K"],
      betCents: 4_000,
      status: "BLACKJACK",
    });
    const account = reserve(emptyAccount(), {
      reservationId: "r-bj-push",
      handId: "bj-push",
      amountCents: 4_000,
    });

    const result = settleBlackjackRound(
      round([blackjack], ["A", "Q"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 40 },
    );

    expect(result.hands[0].result).toBe("PUSH");
    expect(result.accounts[0].wallet.availableBalanceCents).toBe(20_000);
  });

  it("settles all reservations on a doubled hand without double-paying", () => {
    const doubled = hand({
      handId: "double",
      ranks: ["10", "9", "2"],
      betCents: 8_000,
      isDoubled: true,
    });

    let account = emptyAccount();
    account = reserve(account, {
      reservationId: "r-double-base",
      handId: "double",
      amountCents: 4_000,
    });
    account = reserve(account, {
      reservationId: "r-double-extra",
      handId: "double",
      amountCents: 4_000,
      kind: "DOUBLE",
    });

    const result = settleBlackjackRound(
      round([doubled], ["10", "8"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 50 },
    );

    expect(result.hands[0]).toMatchObject({
      result: "WIN",
      stakeCents: 8_000,
      returnCents: 16_000,
      reservationCount: 2,
    });
    expect(result.accounts[0].wallet.availableBalanceCents).toBe(28_000);
    expect(result.accounts[0].wallet.reservedBalanceCents).toBe(0);
  });

  it("settles split hands independently against the same dealer result", () => {
    const left = hand({
      handId: "split-left",
      ranks: ["10", "9"],
      betCents: 4_000,
      origin: "SPLIT",
    });
    const right = hand({
      handId: "split-right",
      ranks: ["10", "6"],
      betCents: 4_000,
      origin: "SPLIT",
    });

    let account = emptyAccount();
    account = reserve(account, {
      reservationId: "r-left",
      handId: "split-left",
      amountCents: 4_000,
    });
    account = reserve(account, {
      reservationId: "r-right",
      handId: "split-right",
      amountCents: 4_000,
      kind: "SPLIT",
    });

    const result = settleBlackjackRound(
      round([left, right], ["10", "8"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 60 },
    );

    expect(result.hands.map((summary) => summary.result)).toEqual([
      "WIN",
      "LOSS",
    ]);
    expect(result.accounts[0].wallet.availableBalanceCents).toBe(20_000);
    expect(result.accounts[0].wallet.reservedBalanceCents).toBe(0);
  });

  it("supports multiple players with isolated wallets", () => {
    const p1 = hand({
      handId: "p1-hand",
      playerId: "player-1",
      seatNumber: 1,
      ranks: ["10", "9"],
      betCents: 4_000,
    });
    const p2 = hand({
      handId: "p2-hand",
      playerId: "player-2",
      seatNumber: 2,
      ranks: ["10", "6"],
      betCents: 5_000,
    });

    let account1 = emptyAccount("player-1", "user-1", 20_000);
    account1 = reserve(account1, {
      reservationId: "r-p1",
      handId: "p1-hand",
      amountCents: 4_000,
    });

    let account2 = emptyAccount("player-2", "user-2", 30_000);
    account2 = reserve(account2, {
      reservationId: "r-p2",
      handId: "p2-hand",
      amountCents: 5_000,
    });

    const result = settleBlackjackRound(
      round([p1, p2], ["10", "8"]),
      [account1, account2],
      { transactionIdPrefix: "settle", nowMs: 70 },
    );

    expect(result.accounts[0].wallet.availableBalanceCents).toBe(24_000);
    expect(result.accounts[1].wallet.availableBalanceCents).toBe(25_000);
    expect(result.accounts.every((account) => account.wallet.reservedBalanceCents === 0)).toBe(true);
  });

  it("resumes safely after one reservation was already settled before a crash", () => {
    const doubled = hand({
      handId: "crash-double",
      ranks: ["10", "9", "2"],
      betCents: 8_000,
      isDoubled: true,
    });

    let account = emptyAccount();
    account = reserve(account, {
      reservationId: "crash-base",
      handId: "crash-double",
      amountCents: 4_000,
    });
    account = reserve(account, {
      reservationId: "crash-extra",
      handId: "crash-double",
      amountCents: 4_000,
      kind: "DOUBLE",
    });

    const partial = settleBlackjackWagerReservation(
      account.wallet,
      account.book,
      {
        reservationId: "crash-base",
        transactionId:
          "settle:round-settlement:crash-double:crash-base",
        type: "WIN_PAYOUT",
        returnCents: 8_000,
        createdAtMs: 79,
      },
    );
    account = {
      ...account,
      wallet: partial.wallet,
      book: partial.book,
    };

    const result = settleBlackjackRound(
      round([doubled], ["10", "8"]),
      [account],
      { transactionIdPrefix: "settle", nowMs: 80 },
    );

    expect(result.accounts[0].wallet.availableBalanceCents).toBe(28_000);
    expect(result.accounts[0].wallet.reservedBalanceCents).toBe(0);
    expect(result.accounts[0].book.reservations.every((r) => r.status === "SETTLED")).toBe(true);
  });

  it("rejects reservation stake mismatch and orphan reserves", () => {
    const h1 = hand({
      handId: "h1",
      ranks: ["10", "8"],
      betCents: 4_000,
    });
    let account = emptyAccount();
    account = reserve(account, {
      reservationId: "r-small",
      handId: "h1",
      amountCents: 3_000,
    });

    expect(() =>
      settleBlackjackRound(
        round([h1], ["10", "7"]),
        [account],
        { transactionIdPrefix: "settle", nowMs: 90 },
      ),
    ).toThrow(/stake mismatch/);

    let orphanAccount = emptyAccount();
    orphanAccount = reserve(orphanAccount, {
      reservationId: "orphan",
      handId: "ghost-hand",
      amountCents: 4_000,
    });

    expect(() =>
      settleBlackjackRound(
        round([h1], ["10", "7"]),
        [orphanAccount],
        { transactionIdPrefix: "settle", nowMs: 91 },
      ),
    ).toThrow(/orphan reserved wager/);
  });

  it("rejects unresolved hands, hidden dealer card and missing player account", () => {
    const active = hand({
      handId: "active",
      ranks: ["10", "5"],
      betCents: 4_000,
      status: "ACTIVE",
    });
    const account = reserve(emptyAccount(), {
      reservationId: "r-active",
      handId: "active",
      amountCents: 4_000,
    });

    expect(() =>
      settleBlackjackRound(
        round([active], ["10", "7"]),
        [account],
        { transactionIdPrefix: "settle", nowMs: 100 },
      ),
    ).toThrow(/active player hand/);

    const validHand = hand({
      handId: "valid",
      ranks: ["10", "8"],
      betCents: 4_000,
    });
    const validAccount = reserve(emptyAccount(), {
      reservationId: "r-valid",
      handId: "valid",
      amountCents: 4_000,
    });
    const hidden = {
      ...round([validHand], ["10", "7"]),
      dealer: {
        cards: [card("10"), card("7")],
        holeCardRevealed: false,
      },
    };

    expect(() =>
      settleBlackjackRound(
        hidden,
        [validAccount],
        { transactionIdPrefix: "settle", nowMs: 101 },
      ),
    ).toThrow(/hole card revealed/);

    expect(() =>
      settleBlackjackRound(
        round([validHand], ["10", "7"]),
        [],
        { transactionIdPrefix: "settle", nowMs: 102 },
      ),
    ).toThrow(/account missing/);
  });
});
