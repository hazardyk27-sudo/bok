import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteBets,
  createRouletteBetState,
  doubleRouletteBets,
  getRouletteBetTotals,
  placeRouletteBet,
  selectRouletteChip,
  undoRouletteBet,
} from "./betState";
import {
  clearRouletteBetAuthority,
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import {
  createRouletteMovedBets,
} from "./chipDragV6";
import {
  getRouletteChipTier,
} from "./chipTier";

afterEach(() => {
  clearRouletteBetAuthority();
});

describe("roulette wager lifecycle regression", () => {
  it("keeps one topology through place, repeated drag, x2, undo and clear", () => {
    let state = createRouletteBetState();
    setRouletteBetAuthority(
      "round-1",
      [],
      0,
      false,
    );

    state = selectRouletteChip(state, 10);
    state = placeRouletteBet(
      state,
      "straight-14",
    );

    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toMatchObject({
      roundId: "round-1",
      revision: 0,
      bets: [{
        betId: "straight-14",
        amount: 10,
      }],
    });

    const firstMove = createRouletteMovedBets(
      getRouletteBetAuthoritySnapshot().bets!,
      "straight-14",
      "straight-17",
    );
    setRouletteBetAuthority(
      "round-1",
      firstMove,
      1,
      false,
    );

    // State is intentionally stale here. The reducer must consume the unified
    // authority topology rather than resurrecting straight-14.
    state = doubleRouletteBets(state);
    expect(
      getRouletteBetTotals(state.placements),
    ).toEqual({
      "straight-17": 20,
    });
    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toMatchObject({
      roundId: "round-1",
      revision: 1,
      bets: [{
        betId: "straight-17",
        amount: 20,
      }],
    });

    const secondMove = createRouletteMovedBets(
      getRouletteBetAuthoritySnapshot().bets!,
      "straight-17",
      "straight-20",
    );
    setRouletteBetAuthority(
      "round-1",
      secondMove,
      2,
      false,
    );

    state = placeRouletteBet(
      state,
      "red",
    );
    expect(
      getRouletteBetTotals(state.placements),
    ).toEqual({
      "straight-20": 20,
      red: 10,
    });

    state = undoRouletteBet(state);
    expect(
      getRouletteBetTotals(state.placements),
    ).toEqual({
      "straight-20": 20,
    });

    state = clearRouletteBets(state);
    expect(state.placements).toEqual([]);
    expect(
      getRouletteBetAuthoritySnapshot(),
    ).toMatchObject({
      roundId: "round-1",
      revision: 2,
      bets: [],
    });
  });

  it("keeps every cell on the aggregate amount tier through repeated x2", () => {
    const amounts = [20, 40, 80, 160];
    const expected = [
      "white",
      "white",
      "blue",
      "green",
    ];

    expect(
      amounts.map(getRouletteChipTier),
    ).toEqual(expected);

    const twelveCells = Array.from(
      { length: 12 },
      () => 20,
    );

    for (const [index, tier] of expected.entries()) {
      const multiplier = 2 ** index;
      expect(
        twelveCells.map(
          (amount) =>
            getRouletteChipTier(
              amount * multiplier,
            ),
        ),
      ).toEqual(
        Array.from(
          { length: 12 },
          () => tier,
        ),
      );
    }
  });
});
