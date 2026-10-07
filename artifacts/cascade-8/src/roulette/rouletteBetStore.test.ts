import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  RouletteBetStore,
} from "./rouletteBetStore";
import {
  getRouletteBetTotals,
  getRouletteTotalStake,
} from "./betState";

describe("roulette single authoritative bet store", () => {
  let store: RouletteBetStore;

  beforeEach(() => {
    store = new RouletteBetStore();
    store.beginRound("round-1", [], 0);
  });

  it("keeps a placed chip until an explicit user mutation removes or moves it", () => {
    store.place("straight-24", 10);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-24": 10,
    });

    store.double();
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-24": 20,
    });

    store.confirmServerSnapshot("round-1", [
      { betId: "straight-24", amount: 20 },
    ], 1);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-24": 20,
    });
  });

  it("moves 24 to 25, leaves 24 free, and accepts a fresh bet on 24", () => {
    store.place("straight-24", 10);
    const beforeStake = getRouletteTotalStake(store.getSnapshot().placements);

    expect(store.move("straight-24", "straight-25")).toBe(true);
    expect(getRouletteTotalStake(store.getSnapshot().placements)).toBe(beforeStake);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-25": 10,
    });

    store.place("straight-24", 10);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-25": 10,
      "straight-24": 10,
    });
  });

  it("doubles values in place without changing topology", () => {
    store.place("straight-25", 10);
    store.place("straight-24", 10);

    for (const expected of [20, 40, 80, 160, 320]) {
      expect(store.double()).toBe(true);
      expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
        "straight-25": expected,
        "straight-24": expected,
      });
    }
  });

  it("never accepts an older same-round server revision over newer state", () => {
    store.applyServerSnapshot("round-1", [
      { betId: "straight-24", amount: 10 },
    ], 5);
    store.applyServerSnapshot("round-1", [
      { betId: "straight-25", amount: 10 },
    ], 8);

    expect(
      store.applyServerSnapshot("round-1", [
        { betId: "straight-24", amount: 10 },
      ], 6),
    ).toBe(false);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-25": 10,
    });
    expect(store.getSnapshot().confirmedRevision).toBe(8);
  });

  it("keeps optimistic drag/x2 state when a delayed equal-or-older snapshot arrives", () => {
    store.applyServerSnapshot("round-1", [
      { betId: "straight-24", amount: 10 },
    ], 8);
    store.move("straight-24", "straight-25");
    store.double();

    expect(
      store.applyServerSnapshot("round-1", [
        { betId: "straight-24", amount: 10 },
      ], 8),
    ).toBe(false);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-25": 20,
    });
  });

  it("survives repeated moves without losing stake or resurrecting old cells", () => {
    store.place("straight-24", 80);
    let current = 24;

    for (let index = 0; index < 100; index += 1) {
      const next = current === 24 ? 25 : 24;
      expect(store.move(`straight-${current}`, `straight-${next}`)).toBe(true);
      current = next;
      expect(getRouletteTotalStake(store.getSnapshot().placements)).toBe(80);
      expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
        [`straight-${current}`]: 80,
      });
    }
  });

  it("preserves a ten-cell $1000 board exactly through confirmation", () => {
    for (let number = 1; number <= 10; number += 1) {
      store.place(`straight-${number}`, 100);
    }

    const before = store.getSnapshot().placements;
    expect(getRouletteTotalStake(before)).toBe(1_000);

    store.confirmServerSnapshot("round-1", before, 10);
    expect(getRouletteTotalStake(store.getSnapshot().placements)).toBe(1_000);
    expect(Object.keys(getRouletteBetTotals(store.getSnapshot().placements))).toHaveLength(10);
  });

  it("snapshots the committed round for rebet without coupling the next round", () => {
    store.place("straight-24", 50);
    store.move("straight-24", "straight-25");
    store.commitRoundSnapshot();
    store.beginRound("round-2", [], 0);

    expect(store.getSnapshot().placements).toEqual([]);
    expect(store.rebet()).toBe(true);
    expect(getRouletteBetTotals(store.getSnapshot().placements)).toEqual({
      "straight-25": 50,
    });
  });
});
