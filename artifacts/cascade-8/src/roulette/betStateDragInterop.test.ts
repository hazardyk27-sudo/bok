import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteAuthoritativeDragPlacements,
  createRouletteBetState,
  doubleRouletteBets,
  getRouletteAuthoritativeDragPlacements,
  getRouletteBetTotals,
  placeRouletteBet,
  selectRouletteChip,
  setRouletteAuthoritativeDragPlacements,
} from "./betState";

afterEach(() => {
  clearRouletteAuthoritativeDragPlacements();
});

describe("roulette drag state interop", () => {
  it("uses the dragged destination as the base for the next new bet", () => {
    let state = createRouletteBetState();
    state = placeRouletteBet(state, "straight-24");

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 10 },
    ]);

    state = placeRouletteBet(state, "straight-24");

    expect(getRouletteBetTotals(state.placements)).toEqual({
      "straight-25": 10,
      "straight-24": 10,
    });
    expect(getRouletteAuthoritativeDragPlacements()).toBeNull();
  });

  it("keeps the dragged destination when x2 is pressed", () => {
    let state = createRouletteBetState();
    state = placeRouletteBet(state, "straight-24");

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 10 },
    ]);

    state = doubleRouletteBets(state);

    expect(state.placements).toEqual([
      { betId: "straight-25", amount: 20 },
    ]);
    expect(getRouletteAuthoritativeDragPlacements()).toBeNull();
  });

  it("keeps drag position while the player changes denomination before betting again", () => {
    let state = createRouletteBetState();
    state = placeRouletteBet(state, "straight-24");

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 10 },
    ]);

    state = selectRouletteChip(state, 50);
    expect(getRouletteAuthoritativeDragPlacements()).toEqual([
      { betId: "straight-25", amount: 10 },
    ]);

    state = placeRouletteBet(state, "straight-24");

    expect(getRouletteBetTotals(state.placements)).toEqual({
      "straight-25": 10,
      "straight-24": 50,
    });
  });

  it("chains drag then repeated x2 without restoring the old cell", () => {
    let state = createRouletteBetState();
    state = placeRouletteBet(state, "straight-24");

    setRouletteAuthoritativeDragPlacements([
      { betId: "straight-25", amount: 10 },
    ]);

    state = doubleRouletteBets(state);
    state = doubleRouletteBets(state);

    expect(state.placements).toEqual([
      { betId: "straight-25", amount: 40 },
    ]);
    expect(getRouletteBetTotals(state.placements)["straight-24"] ?? 0).toBe(0);
  });
});
