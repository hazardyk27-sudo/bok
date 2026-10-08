import { describe, expect, it } from "vitest";
import {
  addSeatChip,
  createInitialSeatState,
  getOccupiedSeats,
  getTotalSeatBet,
  leaveSeat,
  selectSeat,
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
      chips: [],
    });
  });

  it("selects an already occupied seat without changing its wager", () => {
    const state = selectSeat(createInitialSeatState(), 5);

    expect(state.selectedSeatId).toBe(5);
    expect(state.seats.find((seat) => seat.id === 5)?.bet).toBe(125);
    expect(state.seats.find((seat) => seat.id === 5)?.chips).toEqual([100, 25]);
  });

  it("adds selected chip denominations and becomes ready at table minimum", () => {
    let state = sitAtSeat(createInitialSeatState(), 2);
    state = addSeatChip(state, 2, 5, 10);

    expect(state.seats.find((seat) => seat.id === 2)).toMatchObject({
      status: "seated",
      bet: 5,
      chips: [5],
    });

    state = addSeatChip(state, 2, 5, 10);

    expect(state.seats.find((seat) => seat.id === 2)).toMatchObject({
      status: "betReady",
      bet: 10,
      chips: [5, 5],
    });
  });

  it("keeps each seat's chip history independent", () => {
    let state = sitAtSeat(createInitialSeatState(), 2);
    state = addSeatChip(state, 2, 25, 10);
    state = selectSeat(state, 5);
    state = addSeatChip(state, 5, 500, 10);

    expect(state.seats.find((seat) => seat.id === 2)?.chips).toEqual([25]);
    expect(state.seats.find((seat) => seat.id === 5)?.chips).toEqual([100, 25, 500]);
    expect(getTotalSeatBet(state)).toBe(800);
  });

  it("leaves a seat, clears its wager, and selects another occupied seat", () => {
    const state = leaveSeat(createInitialSeatState(), 3);

    expect(state.seats.find((seat) => seat.id === 3)).toMatchObject({
      status: "empty",
      bet: 0,
      chips: [],
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
