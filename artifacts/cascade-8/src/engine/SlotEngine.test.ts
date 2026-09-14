import { describe, expect, it } from "vitest";
import { SeededRNG } from "./RNG";
import {
  addFreeSpinSymbolWin,
  beginFreeSpinAccounting,
  calculateSequenceSettlement,
  createFreeSpinAccounting,
  playSpin,
  resolveFreeSpinAccounting,
  settleFreeSpinAccounting,
} from "./SlotEngine";
import { countScatter } from "./BoardGenerator";
import type { CoreCell } from "./types";

const settledBaseBoard = (result: ReturnType<typeof playSpin>) =>
  result.tumbles.at(-1)?.boardAfterRefill ?? result.initialBoard;

const scatterPositions = (board: ReturnType<typeof settledBaseBoard>) =>
  board.flatMap((row, rowIndex) =>
    row.flatMap((cell, col) => cell === "SCATTER" ? [`${rowIndex}:${col}`] : []),
  );

describe("spin accounting", () => {
  it("keeps outcomes bet-invariant", () => {
    const one = playSpin(100, new SeededRNG("bet"));
    const two = playSpin(1000, new SeededRNG("bet"));
    expect(two.totalMultiplier).toBe(one.totalMultiplier);
    expect(two.totalWinCents).toBe(one.totalWinCents * 10);
  });
  it("keeps wins finite and non-negative", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const result = playSpin(500, new SeededRNG(seed));
      expect(result.totalWinCents).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.totalWinCents)).toBe(true);
    }
  });
  it("stops originating-spin math at the 5000x cap", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      expect(playSpin(100, new SeededRNG(seed)).totalMultiplier).toBeLessThanOrEqual(5000);
    }
  });
  it("settles the complete raw sequence once with late Cores", () => {
    expect(calculateSequenceSettlement(8, [10, 25])).toEqual({
      combinedCoreMultiplier: 35,
      finalWinMultiplier: 280,
    });
  });
  it("applies a late Core to earlier raw wins", () => {
    expect(calculateSequenceSettlement(5, [25])).toEqual({
      combinedCoreMultiplier: 25,
      finalWinMultiplier: 125,
    });
  });
  it("adds multiple Cores and does not double-credit the raw pool", () => {
    expect(calculateSequenceSettlement(7, [2, 10, 25]).finalWinMultiplier).toBe(259);
    expect(calculateSequenceSettlement(8, [10, 25]).finalWinMultiplier).toBe(280);
  });
  it("keeps duplicate-valued settlement Cores independently identifiable and ordered", () => {
    const cores: CoreCell[] = [
      { row: 3, col: 2, value: 5, id: "core-b", arrivalSequence: 2 },
      { row: 1, col: 4, value: 5, id: "core-a", arrivalSequence: 1 },
      { row: 4, col: 0, value: 500, id: "core-c", arrivalSequence: 3 },
    ];
    const ordered = [...cores].sort((a, b) => (a.arrivalSequence ?? 0) - (b.arrivalSequence ?? 0));

    expect(ordered.map((core) => `${core.id}:${core.value}`)).toEqual([
      "core-a:5",
      "core-b:5",
      "core-c:500",
    ]);
    expect(calculateSequenceSettlement(50, ordered.map((core) => core.value))).toEqual({
      combinedCoreMultiplier: 510,
      finalWinMultiplier: 25_500,
    });
  });
  it("keeps the cumulative bonus total unchanged until a Free Spin resolves", () => {
    let accounting = beginFreeSpinAccounting(createFreeSpinAccounting(40_000));
    accounting = addFreeSpinSymbolWin(accounting, 2_000);
    accounting = addFreeSpinSymbolWin(accounting, 3_000);

    expect(accounting.rawSymbolWinCents).toBe(5_000);
    expect(accounting.cumulativeBonusWinCents).toBe(40_000);

    accounting = resolveFreeSpinAccounting(accounting, 50, 10, 50_000, 100);
    expect(accounting).toMatchObject({
      rawSymbolWinCents: 5_000,
      combinedCoreMultiplier: 10,
      currentSpinWinCents: 50_000,
      cumulativeBonusWinCents: 40_000,
    });

    accounting = settleFreeSpinAccounting(accounting);
    expect(accounting.cumulativeBonusWinCents).toBe(90_000);
  });
  it("does not create payout from a multiplier without symbol wins", () => {
    const noMultiplier = resolveFreeSpinAccounting(createFreeSpinAccounting(), 50, 1, 50_000, 1_000);
    expect(noMultiplier.currentSpinWinCents).toBe(50_000);

    const multiplierOnly = resolveFreeSpinAccounting(createFreeSpinAccounting(), 0, 10, 0, 1_000);
    expect(multiplierOnly.currentSpinWinCents).toBe(0);
    expect(multiplierOnly.cumulativeBonusWinCents).toBe(0);
    expect(calculateSequenceSettlement(0, [10]).finalWinMultiplier).toBe(0);
  });
});

describe("base bonus trigger accounting", () => {
  it.each([
    { seed: 38, scatterCount: 4, freeSpinsAwarded: 10 },
    { seed: 1186, scatterCount: 5, freeSpinsAwarded: 12 },
    { seed: 2489, scatterCount: 6, freeSpinsAwarded: 15 },
  ])("exposes the settled $scatterCount-Scatter trigger count", ({ seed, scatterCount, freeSpinsAwarded }) => {
    const result = playSpin(100, new SeededRNG(seed));

    expect(result.bonusTriggered).toBe(true);
    expect(result.bonusTriggerScatterCount).toBe(scatterCount);
    expect(result.freeSpinsAwarded).toBe(freeSpinsAwarded);
  });

  it("uses the final settled board after a tumble/refill trigger", () => {
     const result = playSpin(100, new SeededRNG(1665));
    const finalBoard = settledBaseBoard(result);

    expect(result.scatterCount).toBe(2);
    expect(result.tumbles).toHaveLength(4);
    expect(countScatter(finalBoard)).toBe(4);
    expect(result.bonusTriggerScatterCount).toBe(countScatter(finalBoard));
     expect(scatterPositions(finalBoard)).toEqual(["0:5", "4:0", "4:3", "4:4"]);
  });
});
