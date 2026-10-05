import { describe, expect, it } from "vitest";
import {
  isRouletteCommittedDragChip,
  shouldWakeRouletteDragGuard,
} from "./chipDragCommitBridge";

describe("roulette repeated chip drag commit bridge", () => {
  it("recognizes each committed position across repeated moves", () => {
    const move1 = [{ betId: "straight-17", amount: 10 }];
    const move2 = [{ betId: "straight-20", amount: 10 }];
    const move3 = [{ betId: "straight-23", amount: 10 }];
    const move4 = [{ betId: "straight-26", amount: 10 }];

    expect(isRouletteCommittedDragChip(move1, "straight-17", 10)).toBe(true);
    expect(isRouletteCommittedDragChip(move1, "straight-14", 10)).toBe(false);
    expect(isRouletteCommittedDragChip(move2, "straight-20", 10)).toBe(true);
    expect(isRouletteCommittedDragChip(move2, "straight-17", 10)).toBe(false);
    expect(isRouletteCommittedDragChip(move3, "straight-23", 10)).toBe(true);
    expect(isRouletteCommittedDragChip(move3, "straight-20", 10)).toBe(false);
    expect(isRouletteCommittedDragChip(move4, "straight-26", 10)).toBe(true);
    expect(isRouletteCommittedDragChip(move4, "straight-23", 10)).toBe(false);
  });

  it("wakes the stale optimistic guard only after a chip is authoritatively committed", () => {
    expect(shouldWakeRouletteDragGuard(0)).toBe(false);
    expect(shouldWakeRouletteDragGuard(1)).toBe(true);
    expect(shouldWakeRouletteDragGuard(2)).toBe(true);
  });
});