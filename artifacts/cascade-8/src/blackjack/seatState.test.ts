import { describe, expect, it } from "vitest";
import {
  createInitialSeatState,
  getOccupiedSeats,
  getTotalSeatBet,
  leaveSeat,
  selectSeat,
  setSeatBet,
  sitAtSeat,
} from "./seatState";

describe("blackjack seat state", () => {
  it("starts with three occupied demo seats and seat 3 selected", () => {
    const state = createInitialSeatState();

    expect(getOccupiedSeats(state).map((seat) => seat.id)).toEqual([1, 3, 5]);
    expect(state.selectedSeatId).toBe(3);
    expect(getTotalSeatBet(state)).toBe(275);
  });

  it("lets the same player occupy another empty seat and selects it", () => {
    const state = sitAtSeat(createInitialSeatState(), 2);

    expect(getOccupiedSeats(state).map((seat) => seat.id)).toEqual([1, 2, 3, 5]);
    expect(state.selectedSeatId).toBe(2);
    expect(state.seats.find((seat) => seat.id === 2)).toMatchObject({
      status: "seated",
      bet: 0,
    });
  });

  it("selects an already occupied seat without changing its wager", () => {
    const state = selectSeat(createInitialSeatState(), 5);

    expect(state.selectedSeatId).toBe(5);
    expect(state.seats.find((seat) => seat.id === 5)?.bet).toBe(125);
  });

  it("marks a seated seat bet-ready only when it reaches table minimum", () => {
    const seated = sitAtSeat(createInitialSeatState(), 2);
    const belowMinimum = setSeatBet(seated, 2, 5, 10);
    const ready = setSeatBet(belowMinimum, 2, 10, 10);

    expect(belowMinimum.seats.find((seat) => seat.id === 2)?.status).toBe("seated");
    expect(ready.seats.find((seat) => seat.id === 2)?.status).toBe("betReady");
  });

  it("leaves a seat, clears its wager, and selects another occupied seat", () => {
    const state = leaveSeat(createInitialSeatState(), 3);

    expect(state.seats.find((seat) => seat.id === 3)).toMatchObject({
      status: "empty",
      bet: 0,
    });
    expect(state.selectedSeatId).toBe(1);
    expect(getTotalSeatBet(state)).toBe(175);
  });

  it("allows one player to occupy all five seats", () => {
    let state = createInitialSeatState();
    state = sitAtSeat(state, 2);
    state = sitAtSeat(state, 4);

    expect(getOccupiedSeats(state)).toHaveLength(5);
  });
});
