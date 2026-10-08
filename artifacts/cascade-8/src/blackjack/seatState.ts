export type BlackjackSeatId = 1 | 2 | 3 | 4 | 5;

export type BlackjackSeatStatus = "empty" | "seated" | "betReady";

export type BlackjackSeat = {
  id: BlackjackSeatId;
  status: BlackjackSeatStatus;
  bet: number;
};

export type BlackjackSeatState = {
  seats: BlackjackSeat[];
  selectedSeatId: BlackjackSeatId | null;
};

const SEAT_IDS: BlackjackSeatId[] = [1, 2, 3, 4, 5];

export function createInitialSeatState(): BlackjackSeatState {
  return {
    seats: SEAT_IDS.map((id) => ({
      id,
      status: id === 1 || id === 3 || id === 5 ? "betReady" : "empty",
      bet: id === 1 ? 50 : id === 3 ? 100 : id === 5 ? 125 : 0,
    })),
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
        ? { ...candidate, status: "seated", bet: 0 }
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
      ? { ...candidate, status: "empty" as const, bet: 0 }
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

export function setSeatBet(
  state: BlackjackSeatState,
  seatId: BlackjackSeatId,
  bet: number,
  tableMin: number,
): BlackjackSeatState {
  const normalizedBet = Math.max(0, Math.floor(bet));
  const seat = getSeat(state, seatId);

  if (seat.status === "empty") {
    return state;
  }

  return {
    ...state,
    seats: state.seats.map((candidate) => {
      if (candidate.id !== seatId) {
        return candidate;
      }

      return {
        ...candidate,
        bet: normalizedBet,
        status: normalizedBet >= tableMin ? "betReady" : "seated",
      };
    }),
  };
}

export function getOccupiedSeats(state: BlackjackSeatState): BlackjackSeat[] {
  return state.seats.filter((seat) => seat.status !== "empty");
}

export function getTotalSeatBet(state: BlackjackSeatState): number {
  return state.seats.reduce((total, seat) => total + seat.bet, 0);
}
