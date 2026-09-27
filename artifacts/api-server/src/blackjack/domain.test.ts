import { describe, expect, it } from "vitest";
import {
  BLACKJACK_CARDS_PER_DECK,
  BLACKJACK_DECK_COUNT,
  BLACKJACK_MAX_SEATS,
  BLACKJACK_RANKS,
  BLACKJACK_SHOE_SIZE,
  BLACKJACK_SUITS,
  createEmptyBlackjackSeats,
  isValidBlackjackMoneyCents,
  type BlackjackCard,
  type BlackjackHand,
  type BlackjackTable,
} from "./domain";

describe("blackjack authoritative domain", () => {
  it("defines the canonical six-deck, five-seat foundation", () => {
    expect(BLACKJACK_MAX_SEATS).toBe(5);
    expect(BLACKJACK_DECK_COUNT).toBe(6);
    expect(BLACKJACK_CARDS_PER_DECK).toBe(52);
    expect(BLACKJACK_SHOE_SIZE).toBe(312);
    expect(BLACKJACK_SUITS).toHaveLength(4);
    expect(BLACKJACK_RANKS).toHaveLength(13);
  });

  it("creates exactly five stable empty seats", () => {
    expect(createEmptyBlackjackSeats()).toEqual([
      { seatNumber: 1, playerId: null },
      { seatNumber: 2, playerId: null },
      { seatNumber: 3, playerId: null },
      { seatNumber: 4, playerId: null },
      { seatNumber: 5, playerId: null },
    ]);
  });

  it("keeps physical card identity separate from rank and suit", () => {
    const firstAce: BlackjackCard = {
      cardId: "shoe-1:deck-0:SPADES:A",
      deckIndex: 0,
      suit: "SPADES",
      rank: "A",
    };
    const secondAce: BlackjackCard = {
      cardId: "shoe-1:deck-1:SPADES:A",
      deckIndex: 1,
      suit: "SPADES",
      rank: "A",
    };

    expect(firstAce.rank).toBe(secondAce.rank);
    expect(firstAce.suit).toBe(secondAce.suit);
    expect(firstAce.cardId).not.toBe(secondAce.cardId);
  });

  it("models split hands independently", () => {
    const base = {
      playerId: "player-1",
      seatNumber: 3 as const,
      cards: [],
      betCents: 10_000,
      status: "WAITING" as const,
      origin: "SPLIT" as const,
      splitDepth: 1,
      isSplitAce: false,
      isDoubled: false,
      result: null,
      payoutCents: 0,
    };

    const left: BlackjackHand = { ...base, handId: "hand-left" };
    const right: BlackjackHand = { ...base, handId: "hand-right" };

    expect(left.handId).not.toBe(right.handId);
    expect(left.betCents).toBe(right.betCents);
  });

  it("requires safe non-negative integer money values", () => {
    expect(isValidBlackjackMoneyCents(0)).toBe(true);
    expect(isValidBlackjackMoneyCents(100_000)).toBe(true);
    expect(isValidBlackjackMoneyCents(-1)).toBe(false);
    expect(isValidBlackjackMoneyCents(1.5)).toBe(false);
    expect(isValidBlackjackMoneyCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
  });

  it("allows a table snapshot to bind shoe, round and monotonic versions", () => {
    const table: BlackjackTable = {
      tableId: "main-blackjack",
      maxSeats: 5,
      seats: createEmptyBlackjackSeats(),
      players: [],
      shoe: {
        shoeId: "shoe-1",
        cards: [],
        nextIndex: 0,
        reshufflePending: false,
        createdAtMs: 1,
        shuffleAlgorithmVersion: "foundation",
      },
      round: null,
      stateVersion: 0,
      eventSequence: 0,
    };

    expect(table.maxSeats).toBe(5);
    expect(table.stateVersion).toBe(0);
    expect(table.eventSequence).toBe(0);
  });
});
