import {
  BLACKJACK_MAX_SEATS,
  createEmptyBlackjackSeats,
  type BlackjackPlayerId,
  type BlackjackSeat,
  type BlackjackSeatNumber,
  type BlackjackShoe,
  type BlackjackTable,
} from "./domain";
import { getBlackjackShoeRemainingCards } from "./draw";
import { validateBlackjackShoeComposition } from "./shoe";

export const BLACKJACK_SEAT_NUMBERS = [1, 2, 3, 4, 5] as const satisfies
  readonly BlackjackSeatNumber[];

export function isBlackjackSeatNumber(
  value: number,
): value is BlackjackSeatNumber {
  return BLACKJACK_SEAT_NUMBERS.includes(value as BlackjackSeatNumber);
}

export function assertCanonicalBlackjackSeats(
  seats: readonly BlackjackSeat[],
): void {
  if (seats.length !== BLACKJACK_MAX_SEATS) {
    throw new Error("Blackjack table must contain exactly five seats");
  }

  const seenSeatNumbers = new Set<number>();
  const seenPlayerIds = new Set<BlackjackPlayerId>();

  for (const seat of seats) {
    if (!isBlackjackSeatNumber(seat.seatNumber)) {
      throw new Error("Blackjack table contains an invalid seat number");
    }
    if (seenSeatNumbers.has(seat.seatNumber)) {
      throw new Error("Blackjack table contains a duplicate seat number");
    }
    seenSeatNumbers.add(seat.seatNumber);

    if (seat.playerId !== null) {
      if (seenPlayerIds.has(seat.playerId)) {
        throw new Error("Blackjack player cannot occupy multiple seats");
      }
      seenPlayerIds.add(seat.playerId);
    }
  }

  for (const seatNumber of BLACKJACK_SEAT_NUMBERS) {
    if (!seenSeatNumbers.has(seatNumber)) {
      throw new Error("Blackjack table is missing a canonical seat");
    }
  }
}

export function getBlackjackSeat(
  seats: readonly BlackjackSeat[],
  seatNumber: BlackjackSeatNumber,
): BlackjackSeat {
  assertCanonicalBlackjackSeats(seats);

  const seat = seats.find((candidate) => candidate.seatNumber === seatNumber);
  if (!seat) {
    throw new Error(`Blackjack seat ${seatNumber} is missing`);
  }
  return seat;
}

export function getOpenBlackjackSeatNumbers(
  seats: readonly BlackjackSeat[],
): readonly BlackjackSeatNumber[] {
  assertCanonicalBlackjackSeats(seats);

  return seats
    .filter((seat) => seat.playerId === null)
    .map((seat) => seat.seatNumber);
}

function assertTableId(tableId: string): void {
  if (!tableId.trim()) {
    throw new RangeError("Blackjack tableId must be a non-empty string");
  }
}

function freezeCanonicalEmptySeats(): readonly BlackjackSeat[] {
  const seats = createEmptyBlackjackSeats().map((seat) =>
    Object.freeze({ ...seat }),
  );
  assertCanonicalBlackjackSeats(seats);
  return Object.freeze(seats);
}

export function createBlackjackTableFoundation(input: {
  tableId: string;
  shoe: BlackjackShoe;
}): BlackjackTable {
  assertTableId(input.tableId);

  if (!validateBlackjackShoeComposition(input.shoe.cards)) {
    throw new Error("Blackjack table requires a valid six-deck shoe");
  }
  getBlackjackShoeRemainingCards(input.shoe);

  return Object.freeze({
    tableId: input.tableId,
    phase: "TABLE_IDLE" as const,
    maxSeats: BLACKJACK_MAX_SEATS,
    seats: freezeCanonicalEmptySeats(),
    players: Object.freeze([]),
    shoe: input.shoe,
    round: null,
    stateVersion: 0,
    eventSequence: 0,
  });
}
