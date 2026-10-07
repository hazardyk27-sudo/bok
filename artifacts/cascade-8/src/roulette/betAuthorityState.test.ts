import { describe, expect, it } from "vitest";
import {
  resolveRouletteAuthorityMutation,
  resolveRouletteDragMutation,
} from "./betAuthorityState";
import { getRouletteChipTier } from "./chipVisual";

describe("roulette single wager authority", () => {
  it("keeps a moved chip on its destination and allows a new bet on the freed source", () => {
    const current = [{ betId: "straight-25", amount: 10 }];
    const staleRuntimeIncoming = [
      { betId: "straight-24", amount: 10 },
      { betId: "straight-24", amount: 10 },
    ];

    const resolved = resolveRouletteAuthorityMutation(
      current,
      staleRuntimeIncoming,
      { kind: "place", betId: "straight-24", amount: 10 },
    );

    expect(resolved).toEqual([
      { betId: "straight-25", amount: 10 },
      { betId: "straight-24", amount: 10 },
    ]);
  });

  it("doubles amounts without moving chips back to their old cells", () => {
    const current = [
      { betId: "straight-25", amount: 10 },
      { betId: "straight-24", amount: 10 },
    ];

    expect(
      resolveRouletteAuthorityMutation(current, [], { kind: "double" }),
    ).toEqual([
      { betId: "straight-25", amount: 20 },
      { betId: "straight-24", amount: 20 },
    ]);
  });

  it("treats drag as a position-only mutation with invariant total stake", () => {
    expect(
      resolveRouletteDragMutation(
        [{ betId: "straight-24", amount: 80 }],
        [{ betId: "straight-25", amount: 80 }],
      ),
    ).toEqual([{ betId: "straight-25", amount: 80 }]);

    expect(() =>
      resolveRouletteDragMutation(
        [{ betId: "straight-24", amount: 1_000 }],
        [{ betId: "straight-25", amount: 70 }],
      ),
    ).toThrow("ROULETTE_DRAG_STAKE_MISMATCH");
  });

  it("undo removes only the latest authoritative placement", () => {
    const current = [
      { betId: "straight-25", amount: 10 },
      { betId: "straight-24", amount: 10 },
    ];

    expect(
      resolveRouletteAuthorityMutation(current, [], { kind: "undo" }),
    ).toEqual([{ betId: "straight-25", amount: 10 }]);
  });

  it("recolors aggregate chips from their actual value tier", () => {
    expect(getRouletteChipTier(40)).toBe("white");
    expect(getRouletteChipTier(80)).toBe("blue");
    expect(getRouletteChipTier(200)).toBe("green");
    expect(getRouletteChipTier(1_000)).toBe("red");
  });
});
