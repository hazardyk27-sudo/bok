import { describe, expect, it } from "vitest";
import {
  createRouletteBetStoreState,
  getRouletteStoreTotals,
  rouletteStoreAcceptServerBet,
  rouletteStoreBeginRound,
  rouletteStoreDouble,
  rouletteStoreMove,
  rouletteStorePlace,
  rouletteStoreSelectChip,
  rouletteStoreSnapshotRound,
  rouletteStoreUndo,
} from "./rouletteBetStore";

describe("roulette single authoritative bet store", () => {
  it("keeps a placed chip until an explicit user mutation removes it", () => {
    let state = createRouletteBetStoreState();
    state = rouletteStoreBeginRound(state, "round-1");
    state = rouletteStorePlace(state, "straight-24");

    expect(getRouletteStoreTotals(state)).toEqual({ "straight-24": 10 });

    state = rouletteStoreAcceptServerBet(state, {
      roundId: "round-1",
      revision: 1,
      placements: [{ betId: "straight-24", amount: 10 }],
    });

    expect(getRouletteStoreTotals(state)).toEqual({ "straight-24": 10 });
  });

  it("moves 24 to 25 and immediately frees 24 for a fresh bet", () => {
    let state = createRouletteBetStoreState();
    state = rouletteStoreBeginRound(state, "round-1");
    state = rouletteStorePlace(state, "straight-24");
    state = rouletteStoreMove(state, "straight-24", "straight-25");

    expect(getRouletteStoreTotals(state)).toEqual({ "straight-25": 10 });

    state = rouletteStorePlace(state, "straight-24");
    expect(getRouletteStoreTotals(state)).toEqual({
      "straight-25": 10,
      "straight-24": 10,
    });
  });

  it("doubles value without changing topology", () => {
    let state = createRouletteBetStoreState();
    state = rouletteStoreBeginRound(state, "round-1");
    state = rouletteStorePlace(state, "straight-24");
    state = rouletteStoreMove(state, "straight-24", "straight-25");
    state = rouletteStorePlace(state, "straight-24");

    for (const amount of [20, 40, 80, 160, 320]) {
      state = rouletteStoreDouble(state);
      expect(getRouletteStoreTotals(state)).toEqual({
        "straight-25": amount,
        "straight-24": amount,
      });
    }
  });

  it("never lets an older same-round server revision overwrite a newer wager", () => {
    let state = createRouletteBetStoreState();
    state = rouletteStoreBeginRound(state, "round-1");
    state = rouletteStoreAcceptServerBet(state, {
      roundId: "round-1",
      revision: 8,
      placements: [{ betId: "straight-25", amount: 200 }],
    });

    state = rouletteStoreAcceptServerBet(state, {
      roundId: "round-1",
      revision: 5,
      placements: [{ betId: "straight-24", amount: 10 }],
    });

    expect(state.confirmedRevision).toBe(8);
    expect(getRouletteStoreTotals(state)).toEqual({ "straight-25": 200 });
  });

  it("keeps the committed round snapshot for rebet while current bets can change", () => {
    let state = createRouletteBetStoreState();
    state = rouletteStoreBeginRound(state, "round-1");
    state = rouletteStoreSelectChip(state, 100);
    state = rouletteStorePlace(state, "straight-17");
    state = rouletteStoreSnapshotRound(state);
    state = rouletteStoreDouble(state);
    state = rouletteStoreUndo(state);

    expect(state.previousRoundPlacements).toEqual([
      { betId: "straight-17", amount: 100 },
    ]);
  });
});
