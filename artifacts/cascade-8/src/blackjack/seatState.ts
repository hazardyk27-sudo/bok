export type BlackjackSeatId = 1 | 2 | 3 | 4 | 5;

export type BlackjackSeatStatus = "empty" | "seated" | "betReady";

export type BlackjackChipValue = 1 | 5 | 25 | 100 | 500;

export const BLACKJACK_CHIP_VALUES: BlackjackChipValue[] = [1, 5, 25, 100, 500];

export type BlackjackSeat = {
  id: BlackjackSeatId;
  status: BlackjackSeatStatus;
  bet: number;
  chips: BlackjackChipValue[];
};

export type BlackjackSeatState = {
  seats: BlackjackSeat[];
  selectedSeatId: BlackjackSeatId | null;
};

const SEAT_IDS: BlackjackSeatId[] = [1, 2, 3, 4, 5];

function chipsForDemoSeat(id: BlackjackSeatId): BlackjackChipValue[] {
  if (id === 1) return [25, 25];
  if (id === 3) return [100];
  if (id === 5) return [100, 25];
  return [];
}

export function createInitialSeatState(): BlackjackSeatState {
  return {
    seats: SEAT_IDS.map((id) => {
      const chips = chipsForDemoSeat(id);
      const bet = chips.reduce((total, chip) => total + chip, 0);

      return {
        id,
        status: bet >= 10 ? "betReady" : "empty",
        bet,
        chips,
      };
    }),
    selectedSeatId: 3,
  };
}

export function getSeat(
  state: BlackjackSeatState,
  seatId: BlackjackSeatId,
): BlackjackSeat {
  const seat = state.seats.find((candidate) => candidate.id === seatId);
  if (!seat) {
    throw new Error(`Unknown blackjack seat: ${seatId}`);
  }
  return seat;
}

export function sitAtSeat(
  state: BlackjackSeatState,
  seatId: BlackjackSeatId,
): BlackjackSeatState {
  const seat = getSeat(state, seatId);
  if (seat.status !== "empty") {
    return selectSeat(state, seatId);
  }

  return {
    selectedSeatId: seatId,
    seats: state.seats.map((candidate) =>
      candidate.id === seatId
        ? { ...candidate, status: "seated" as const, bet: 0, chips: [] }
        : candidate,
    ),
  };
}

export function selectSeat(
  state: BlackjackSeatState,
  seatId: BlackjackSeatId,
): BlackjackSeatState {
  const seat = getSeat(state, seatId);
  if (seat.status === "empty") {
    return sitAtSeat(state, seatId);
  }

  if (state.selectedSeatId === seatId) {
    return state;
  }

  return { ...state, selectedSeatId: seatId };
}

export function leaveSeat(
  state: BlackjackSeatState,
  seatId: BlackjackSeatId,
): BlackjackSeatState {
  const seat = getSeat(state, seatId);
  if (seat.status === "empty") {
    return state;
  }

  const seats = state.seats.map((candidate) =>
    candidate.id === seatId
      ? { ...candidate, status: "empty" as const, bet: 0, chips: [] }
      : candidate,
  );

  const nextSelectedSeatId =
    state.selectedSeatId === seatId
      ? seats.find((candidate) => candidate.status !== "empty")?.id ?? null
      : state.selectedSeatId;

  return {
    seats,
    selectedSeatId: nextSelectedSeatId,
  };
}

export function addSeatChip(
  state: BlackjackSeatState,
  seatId: BlackjackSeatId,
  chip: BlackjackChipValue,
  tableMin: number,
): BlackjackSeatState {
  const seat = getSeat(state, seatId);
  if (seat.status === "empty") {
    return state;
  }

  const chips = [...seat.chips, chip];
  const nextBet = chips.reduce((total, value) => total + value, 0);

  return {
    ...state,
    seats: state.seats.map((candidate) =>
      candidate.id === seatId
        ? {
            ...candidate,
            bet: nextBet,
            chips,
            status: nextBet >= tableMin ? "betReady" : "seated",
          }
        : candidate,
    ),
  };
}

export function isBlackjackChipValue(value: number): value is BlackjackChipValue {
  return BLACKJACK_CHIP_VALUES.includes(value as BlackjackChipValue);
}

export function getOccupiedSeats(state: BlackjackSeatState): BlackjackSeat[] {
  return state.seats.filter((seat) => seat.status !== "empty");
}

export function getTotalSeatBet(state: BlackjackSeatState): number {
  return state.seats.reduce((total, seat) => total + seat.bet, 0);
}
