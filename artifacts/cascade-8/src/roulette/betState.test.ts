import {
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteBets,
  compactRouletteBetPlacements,
  createRouletteBetState,
  doubleRouletteBets,
  expandRouletteBetPlacementsToChipValues,
  getRouletteBetTotals,
  getRouletteDisplayChipValue,
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

  it("doubles every current placement without an artificial placement cap", () => {
    let state = createRouletteBetState();

    state = selectRouletteChip(state, 10);
    state = placeRouletteBet(state, "straight-17");

    for (let index = 0; index < 9; index += 1) {
      state = doubleRouletteBets(state);
    }

    expect(getRouletteTotalStake(state.placements)).toBe(5120);
    expect(state.placements).toEqual([
      {
        betId: "straight-17",
        amount: 5120,
      },
    ]);
  });

  it("compacts repeated placements before an authoritative spin", () => {
    let state = createRouletteBetState();

    state = selectRouletteChip(state, 10);
    state = placeRouletteBet(state, "straight-17");

    for (let index = 0; index < 6; index += 1) {
      state = doubleRouletteBets(state);
    }

    expect(state.placements).toEqual([
      {
        betId: "straight-17",
        amount: 640,
      },
    ]);
    expect(
      compactRouletteBetPlacements(state.placements),
    ).toEqual([
      {
        betId: "straight-17",
        amount: 640,
      },
    ]);
  });

  it("expands aggregate wagers back into canonical chip denominations", () => {
    expect(
      expandRouletteBetPlacementsToChipValues([
        {
          betId: "straight-17",
          amount: 20,
        },
        {
          betId: "red",
          amount: 640,
        },
      ]),
    ).toEqual([
      {
        betId: "straight-17",
        amount: 10,
      },
      {
        betId: "straight-17",
        amount: 10,
      },
      {
        betId: "red",
        amount: 500,
      },
      {
        betId: "red",
        amount: 100,
      },
      {
        betId: "red",
        amount: 25,
      },
      {
        betId: "red",
        amount: 10,
      },
      {
        betId: "red",
        amount: 5,
      },
    ]);
  });

  it("promotes the displayed chip by the total wager amount", () => {
    expect(getRouletteDisplayChipValue(1)).toBe(1);
    expect(getRouletteDisplayChipValue(4)).toBe(1);
    expect(getRouletteDisplayChipValue(5)).toBe(5);
    expect(getRouletteDisplayChipValue(9)).toBe(5);
    expect(getRouletteDisplayChipValue(10)).toBe(10);
    expect(getRouletteDisplayChipValue(24)).toBe(10);
    expect(getRouletteDisplayChipValue(25)).toBe(25);
    expect(getRouletteDisplayChipValue(99)).toBe(25);
    expect(getRouletteDisplayChipValue(100)).toBe(100);
    expect(getRouletteDisplayChipValue(499)).toBe(100);
    expect(getRouletteDisplayChipValue(500)).toBe(500);
    expect(getRouletteDisplayChipValue(640)).toBe(500);
    expect(getRouletteDisplayChipValue(5_120)).toBe(500);
  });
});
