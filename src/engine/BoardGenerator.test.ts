import { describe, expect, it } from "vitest";
import {
  countScatter,
  generateInitialBoard,
  generateRefillCells,
  generateRefillSymbols,
} from "./BoardGenerator";
import { BONUS_MAX_DISTINCT_NORMAL_SYMBOLS } from "../config/GameConfig";
import { SeededRNG } from "./RNG";
import type { NormalSymbolId } from "../config/GameConfig";
import type { RandomSource } from "./types";

const alwaysLast: RandomSource = { nextFloat: () => 0.999999 };
const alwaysFirst: RandomSource = { nextFloat: () => 0 };

describe("board generation", () => {
  it("generates exactly 30 initial cells", () => {
    expect(generateInitialBoard(alwaysFirst).flat()).toHaveLength(30);
  });
  it("can generate scatter on an initial board", () => {
    expect(countScatter(generateInitialBoard(alwaysLast))).toBe(30);
  });
  it("never generates scatter on a refill", () => {
    expect(generateRefillSymbols(alwaysLast, 30).every((symbol) => symbol !== "SCATTER")).toBe(true);
  });
  it("generates exactly the requested refill count", () => {
    expect(generateRefillSymbols(alwaysFirst, 7)).toHaveLength(7);
  });
  it("caps bonus boards at seven distinct normal symbols", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const board = generateInitialBoard(new SeededRNG(seed), "bonus");
      const distinctNormals = new Set(
        board.flat().filter((cell) => typeof cell === "string" && cell !== "SCATTER"),
      );
      expect(distinctNormals.size).toBeLessThanOrEqual(BONUS_MAX_DISTINCT_NORMAL_SYMBOLS);
    }
  });
  it("keeps existing bonus symbols eligible after the cap is reached", () => {
    const visible = new Set<NormalSymbolId>(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]);
    const cells = generateRefillCells(alwaysLast, 20, false, "bonus", 0, visible);
    expect(cells.every((cell) => typeof cell !== "string" || cell === "SCATTER" || visible.has(cell))).toBe(true);
    expect(cells.some((cell) => cell === "S7")).toBe(true);
  });
  it("does not apply the bonus cap to base refills", () => {
    const visible = new Set<NormalSymbolId>(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]);
    const cells = generateRefillCells(alwaysLast, 4, false, "base", 0, visible);
    expect(cells).toContain("S8");
  });
  it("does not count bonus multiplier cores toward the symbol cap", () => {
    const visible = new Set<NormalSymbolId>(["S1", "S2", "S3", "S4", "S5", "S6", "S7"]);
    const cells = generateRefillCells(alwaysFirst, 1, true, "bonus", 0, visible);
    expect(cells[0]).toMatchObject({ kind: "MULTIPLIER_CORE" });
    expect(visible.size).toBe(7);
  });
});