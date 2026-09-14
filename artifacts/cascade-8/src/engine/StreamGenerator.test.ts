import { describe, expect, it } from "vitest";
import { BASE_REEL_CONFIG, type ReelConfig } from "../config/GameConfig";
import { ColumnStream } from "./BoardGenerator";
import { SeededRNG } from "./RNG";
import { getNormalSymbol, getStackMetadata } from "./types";

describe("persistent column streams", () => {
  it("generates fixed two-position groups with a 90% copy branch", () => {
    const stream = new ColumnStream(new SeededRNG("stream-distribution"), BASE_REEL_CONFIG, 0);
    const values = stream.next(1_000_000, "BASE_REFILL");
    const normalValues = values.filter((value) => getNormalSymbol(value) !== null);
    expect(normalValues.length).toBeGreaterThan(0);
    expect(stream.stats.pairCount).toBeGreaterThan(400_000);
    expect(stream.stats.copyBranchCount / stream.stats.pairCount).toBeGreaterThan(0.88);
    expect(stream.stats.copyBranchCount / stream.stats.pairCount).toBeLessThan(0.92);
    expect(normalValues.every((value) => getStackMetadata(value)?.stackSize === 2)).toBe(true);
  });

  it("preserves the pair phase when refill requests split it across turns", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [{ value: "S3", weight: 1 }],
    };
    const rolls = [0.999999, 0.999999, 0.999999, 0.1];
    const stream = new ColumnStream({ nextFloat: () => rolls.shift() ?? 0.999999 }, config, 0);
    const first = stream.next(1, "BASE_REFILL")[0];
    const second = stream.next(1, "BASE_REFILL")[0];
    expect(getNormalSymbol(first)).toBe("S3");
    expect(getNormalSymbol(second)).toBe("S3");
    expect(getStackMetadata(first)).toEqual({ stackId: 1_000_001, stackIndex: 0, stackSize: 2 });
    expect(getStackMetadata(second)).toEqual({ stackId: 1_000_001, stackIndex: 1, stackSize: 2 });
    expect(stream.stats.copyBranchCount).toBe(1);
  });

  it("allows a fresh next group to select the previous symbol", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [{ value: "S3", weight: 1 }],
    };
    const stream = new ColumnStream({ nextFloat: () => 0.999999 }, config, 0);
    const values = stream.next(4, "BASE_REFILL");
    expect(values.map(getNormalSymbol)).toEqual(["S3", "S3", "S3", "S3"]);
    expect(stream.stats.freshSecondCount).toBe(2);
    expect(stream.stats.actualSamePairCount).toBe(2);
  });
});