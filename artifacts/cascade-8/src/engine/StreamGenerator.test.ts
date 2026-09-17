import { describe, expect, it } from "vitest";
import { BASE_REEL_CONFIG, type ReelConfig } from "../config/GameConfig";
import { ColumnStream } from "./BoardGenerator";
import { SeededRNG } from "./RNG";
import { getNormalSymbol, getStackMetadata, isMultiplierCore } from "./types";

describe("persistent column streams", () => {
  it("generates fixed two-position groups with a 75% copy branch", () => {
    const stream = new ColumnStream(new SeededRNG("stream-distribution"), BASE_REEL_CONFIG, 0);
    const values = stream.next(1_000_000, "BASE_REFILL");
    const normalValues = values.filter((value) => getNormalSymbol(value) !== null);
    expect(normalValues.length).toBeGreaterThan(0);
    expect(stream.stats.pairCount).toBeGreaterThan(400_000);
    expect(stream.stats.copyBranchCount / stream.stats.pairCount).toBeGreaterThan(0.73);
    expect(stream.stats.copyBranchCount / stream.stats.pairCount).toBeLessThan(0.77);
    expect(normalValues.every((value) => getStackMetadata(value)?.stackSize === 2)).toBe(true);
  });

  it("preserves the pair phase when refill requests split it across turns", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [{ value: "S3", weight: 1 }],
    };
    const rolls = [0.999999, 0.999999, 0.1];
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

  it("uses a lower copy chance for a new group while preserving pair copies", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [
        { value: "S3", weight: 1 },
        { value: "S4", weight: 9 },
      ],
    };
    const rolls = [0.99, 0.49, 0.74, 0.99, 0.6];
    const stream = new ColumnStream({ nextFloat: () => rolls.shift() ?? 0.999999 }, config, 0);

    const first = stream.nextVisibleAware("BASE_REFILL", false, "S3");
    const second = stream.nextVisibleAware("BASE_REFILL", false, "S3");
    const third = stream.nextVisibleAware("BASE_REFILL", false, "S3");

    expect(first.copiedFromVisibleTop).toBe(true);
    expect(second.copiedFromVisibleTop).toBe(true);
    expect(third.copiedFromVisibleTop).toBe(false);
    expect(getNormalSymbol(third.cell)).toBe("S4");
  });

  it("attenuates the visible symbol only in the third-cell weighted fallback", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [
        { value: "S3", weight: 1 },
        { value: "S4", weight: 9 },
      ],
    };
    const rolls = [0.99, 0.5375];
    const stream = new ColumnStream({ nextFloat: () => rolls.shift() ?? 0.999999 }, config, 0);

    const third = stream.nextVisibleAware("BASE_REFILL", false, "S3");

    expect(third.copiedFromVisibleTop).toBe(false);
    expect(getNormalSymbol(third.cell)).toBe("S4");
  });

  it("keeps special cells independent without splitting a pending pair", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [{ value: "S3", weight: 1 }],
    };
    const rolls = [0.05, 0.999999, 0.999999, 0.1];
    const stream = new ColumnStream({ nextFloat: () => rolls.shift() ?? 0.999999 }, config, 0);
    const values = stream.next(3, "BONUS_REFILL");

    expect(isMultiplierCore(values[0])).toBe(true);
    expect(getNormalSymbol(values[1])).toBe("S3");
    expect(getNormalSymbol(values[2])).toBe("S3");
    expect(getStackMetadata(values[1])).toMatchObject({ stackId: 1_000_001, stackIndex: 0, stackSize: 2 });
    expect(getStackMetadata(values[2])).toMatchObject({ stackId: 1_000_001, stackIndex: 1, stackSize: 2 });
    expect(stream.stats.pairCount).toBe(1);
  });

  it("keeps the pending second member above the odd five-cell visible boundary", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [
        { value: "S1", weight: 1 },
        { value: "S4", weight: 1 },
        { value: "S7", weight: 1 },
        { value: "S6", weight: 1 },
      ],
    };
    const rolls = [
      0.999999, 0, 0,
      0.999999, 0.3, 0,
      0.999999, 0.6,
      0, 0.999999, 0.9, 0,
    ];
    const stream = new ColumnStream({ nextFloat: () => rolls.shift() ?? 0.999999 }, config, 0);
    const visible = stream.next(5, "BASE_INITIAL", false);
    const hiddenContinuation = stream.next(1, "BASE_REFILL", false)[0];
    const nextGroup = stream.next(2, "BASE_REFILL", false);

    expect(visible.map(getNormalSymbol)).toEqual(["S1", "S1", "S4", "S4", "S7"]);
    expect(getNormalSymbol(hiddenContinuation)).toBe("S7");
    expect(getStackMetadata(hiddenContinuation)).toEqual({ stackId: 1_000_003, stackIndex: 1, stackSize: 2 });
    expect(nextGroup.map(getNormalSymbol)).toEqual(["S6", "S6"]);
  });
});