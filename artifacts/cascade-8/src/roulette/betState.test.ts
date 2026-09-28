import {
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteBets,
  createRouletteBetState,
  getRouletteBetTotals,
  getRouletteTotalStake,
  placeRouletteBet,
  rebetRouletteRound,
  selectRouletteChip,
  snapshotRouletteRound,
  undoRouletteBet,
} from "./betState";

describe("roulette local wager state", () => {
  it("stacks the selected chip on the same betting area", () => {
    let state =
      createRouletteBetState();

    state = selectRouletteChip(
      state,
      25,
    );
    state = placeRouletteBet(
      state,
      "straight-17",
    );
    state = placeRouletteBet(
      state,
      "straight-17",
    );
    state = selectRouletteChip(
      state,
      5,
    );
    state = placeRouletteBet(
      state,
      "red",
    );

    expect(
      getRouletteBetTotals(
        state.placements,
      ),
    ).toEqual({
      "straight-17": 50,
      red: 5,
    });
    expect(
      getRouletteTotalStake(
        state.placements,
      ),
    ).toBe(55);
  });

  it("undoes only the latest placement", () => {
    let state =
      createRouletteBetState();

    state = placeRouletteBet(
      state,
      "black",
    );
    state = placeRouletteBet(
      state,
      "odd",
    );
    state =
      undoRouletteBet(state);

    expect(
      state.placements,
    ).toEqual([
      {
        betId: "black",
        amount: 10,
      },
    ]);
  });

  it("clears the current table without deleting the saved previous round", () => {
    let state =
      createRouletteBetState();

    state = placeRouletteBet(
      state,
      "dozen-2",
    );
    state =
      snapshotRouletteRound(state);
    state =
      clearRouletteBets(state);

    expect(
      state.placements,
    ).toEqual([]);
    expect(
      state.previousRoundPlacements,
    ).toHaveLength(1);
  });

  it("rebets the previous committed round exactly", () => {
    let state =
      createRouletteBetState();

    state = selectRouletteChip(
      state,
      100,
    );
    state = placeRouletteBet(
      state,
      "column-1",
    );
    state = selectRouletteChip(
      state,
      5,
    );
    state = placeRouletteBet(
      state,
      "straight-0",
    );
    state =
      snapshotRouletteRound(state);
    state =
      clearRouletteBets(state);
    state =
      rebetRouletteRound(state);

    expect(
      state.placements,
    ).toEqual([
      {
        betId: "column-1",
        amount: 100,
      },
      {
        betId: "straight-0",
        amount: 5,
      },
    ]);
  });
});
