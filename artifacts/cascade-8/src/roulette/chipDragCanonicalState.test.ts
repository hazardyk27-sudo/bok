import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  clearRouletteAuthoritativeDragPlacements,
  createRouletteBetState,
  setRouletteAuthoritativeDragPlacements,
  snapshotRouletteRound,
} from "./betState";
import {
  shouldEnforceRouletteCanonicalDragState,
  shouldResetRouletteCanonicalDragStateForUpdate,
} from "./chipDragCanonicalState";

afterEach(() => {
  clearRouletteAuthoritativeDragPlacements();
});

describe("roulette canonical drag state", () => {
  it("uses the final authoritative drag placement when the round snapshot is captured", () => {
    const initial = {
      ...createRouletteBetState(),
      placements: [
        {
          betId: "straight-8",
          amount: 10,
        },
      ],
    };

    setRouletteAuthoritativeDragPlacements([
      {
        betId: "high",
        amount: 10,
      },
    ]);

    const snapshot =
      snapshotRouletteRound(initial);

    expect(snapshot.placements).toEqual([
      {
        betId: "high",
        amount: 10,
      },
    ]);
    expect(
      snapshot.previousRoundPlacements,
    ).toEqual([
      {
        betId: "high",
        amount: 10,
      },
    ]);
  });

  it("lets a normal wager mutation supersede the previous drag override", () => {
    const doubled = {
      ...createRouletteBetState(),
      placements: [
        {
          betId: "high",
          amount: 20,
        },
      ],
    };

    setRouletteAuthoritativeDragPlacements([
      {
        betId: "high",
        amount: 10,
      },
    ]);
    clearRouletteAuthoritativeDragPlacements();

    const snapshot =
      snapshotRouletteRound(doubled);

    expect(snapshot.placements).toEqual([
      {
        betId: "high",
        amount: 20,
      },
    ]);
    expect(
      snapshot.previousRoundPlacements,
    ).toEqual([
      {
        betId: "high",
        amount: 20,
      },
    ]);
  });

  it("classifies normal writes separately from V6 move writes", () => {
    expect(
      shouldResetRouletteCanonicalDragStateForUpdate(
        "roulette_gbet_123",
      ),
    ).toBe(true);
    expect(
      shouldResetRouletteCanonicalDragStateForUpdate(
        "roulette_move_v6_123",
      ),
    ).toBe(false);
  });

  it("does not replace the normal snapshot when no drag override exists", () => {
    const initial = {
      ...createRouletteBetState(),
      placements: [
        {
          betId: "straight-8",
          amount: 10,
        },
      ],
    };

    const snapshot =
      snapshotRouletteRound(initial);

    expect(snapshot.placements).toEqual([
      {
        betId: "straight-8",
        amount: 10,
      },
    ]);
    expect(
      snapshot.previousRoundPlacements,
    ).toEqual([
      {
        betId: "straight-8",
        amount: 10,
      },
    ]);
  });

  it("protects the canonical placement during verify and spin but not open betting or settlement", () => {
    expect(
      shouldEnforceRouletteCanonicalDragState(
        "betting",
        "false",
      ),
    ).toBe(false);
    expect(
      shouldEnforceRouletteCanonicalDragState(
        "betting",
        "true",
      ),
    ).toBe(true);
    expect(
      shouldEnforceRouletteCanonicalDragState(
        "spinning",
        "true",
      ),
    ).toBe(true);
    expect(
      shouldEnforceRouletteCanonicalDragState(
        "settled",
        "true",
      ),
    ).toBe(false);
  });
});
