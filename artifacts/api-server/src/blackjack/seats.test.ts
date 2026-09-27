import { describe, expect, it } from "vitest";
import type { BlackjackSeat } from "./domain";
import {
  BLACKJACK_SEAT_NUMBERS,
  assertCanonicalBlackjackSeats,
  createBlackjackTableFoundation,
  getBlackjackSeat,
  getOpenBlackjackSeatNumbers,
  isBlackjackSeatNumber,
} from "./seats";
import { createShuffledBlackjackShoe } from "./shuffle";

function emptySeats(): BlackjackSeat[] {
  return BLACKJACK_SEAT_NUMBERS.map((seatNumber) => ({
    seatNumber,
    playerId: null,
  }));
}

describe("blackjack canonical five-seat table", () => {
  it("locks the seat numbers to exactly 1 through 5", () => {
    expect(BLACKJACK_SEAT_NUMBERS).toEqual([1, 2, 3, 4, 5]);
    expect(BLACKJACK_SEAT_NUMBERS).toHaveLength(5);

    for (const seat of BLACKJACK_SEAT_NUMBERS) {
      expect(isBlackjackSeatNumber(seat)).toBe(true);
    }
    expect(isBlackjackSeatNumber(0)).toBe(false);
    expect(isBlackjackSeatNumber(6)).toBe(false);
  });

  it("accepts only a complete canonical seat set", () => {
    expect(() => assertCanonicalBlackjackSeats(emptySeats())).not.toThrow();

    expect(() =>
      assertCanonicalBlackjackSeats(emptySeats().slice(0, 4)),
    ).toThrow(/exactly five seats/);

    const duplicate = emptySeats();
    duplicate[4] = { seatNumber: 4, playerId: null };
    expect(() => assertCanonicalBlackjackSeats(duplicate)).toThrow(
      /duplicate seat number/,
    );

    const invalid = emptySeats();
    invalid[4] = { seatNumber: 6 as never, playerId: null };
    expect(() => assertCanonicalBlackjackSeats(invalid)).toThrow(
      /invalid seat number/,
    );
  });

  it("prevents one player from occupying two seats", () => {
    const seats = emptySeats();
    seats[0] = { seatNumber: 1, playerId: "player-1" };
    seats[1] = { seatNumber: 2, playerId: "player-1" };

    expect(() => assertCanonicalBlackjackSeats(seats)).toThrow(
      /multiple seats/,
    );
  });

  it("reads seats and open positions from the canonical layout", () => {
    const seats = emptySeats();
    seats[2] = { seatNumber: 3, playerId: "player-3" };

    expect(getBlackjackSeat(seats, 3).playerId).toBe("player-3");
    expect(getOpenBlackjackSeatNumbers(seats)).toEqual([1, 2, 4, 5]);
  });

  it("creates an immutable idle table with exactly five empty seats", () => {
    const table = createBlackjackTableFoundation({
      tableId: "main-blackjack",
      shoe: createShuffledBlackjackShoe({
        shoeId: "seat-foundation-shoe",
        createdAtMs: 1,
      }),
    });

    expect(table.tableId).toBe("main-blackjack");
    expect(table.phase).toBe("TABLE_IDLE");
    expect(table.maxSeats).toBe(5);
    expect(table.seats).toHaveLength(5);
    expect(getOpenBlackjackSeatNumbers(table.seats)).toEqual([1, 2, 3, 4, 5]);
    expect(table.players).toEqual([]);
    expect(table.round).toBeNull();
    expect(table.stateVersion).toBe(0);
    expect(table.eventSequence).toBe(0);
    expect(Object.isFrozen(table)).toBe(true);
    expect(Object.isFrozen(table.seats)).toBe(true);
  });

  it("rejects invalid table identity or shoe input", () => {
    const shoe = createShuffledBlackjackShoe({
      shoeId: "valid-shoe",
      createdAtMs: 2,
    });

    expect(() =>
      createBlackjackTableFoundation({
        tableId: "   ",
        shoe,
      }),
    ).toThrow(/tableId/);

    expect(() =>
      createBlackjackTableFoundation({
        tableId: "main-blackjack",
        shoe: {
          ...shoe,
          cards: shoe.cards.slice(0, -1),
        },
      }),
    ).toThrow(/valid six-deck shoe/);
  });
});
