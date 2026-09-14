import { describe, expect, it } from "vitest";
import { BASE_REEL_CONFIG, type ReelConfig } from "../config/GameConfig";
import { ColumnStream } from "./BoardGenerator";
import { SeededRNG } from "./RNG";
import { getNormalSymbol, getStackMetadata } from "./types";

describe("persistent column streams", () => {
  it("generates true single and double packets with the configured 60/40 mix", () => {
    const stream = new ColumnStream(new SeededRNG("stream-distribution"), BASE_REEL_CONFIG, 0);
    const values = stream.next(1_000_000, "BASE_REFILL");
    const normalValues = values.filter((value) => getNormalSymbol(value) !== null);
    expect(normalValues.length).toBeGreaterThan(0);
    expect(stream.stats.doublePacketCount).toBeGreaterThan(stream.stats.singlePacketCount * 0.18);
    expect(stream.stats.doublePacketCount).toBeLessThan(stream.stats.singlePacketCount * 0.32);
    expect(normalValues.reduce((maximum, value) => Math.max(maximum, getStackMetadata(value)?.stackSize ?? 1), 0)).toBeLessThanOrEqual(2);
  });

  it("preserves a stack identity when refill requests split it across turns", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [{ value: "S3", weight: 1 }],
      packetWeights: [{ value: 2, weight: 1 }],
    };
    const stream = new ColumnStream({ nextFloat: () => 0.999999 }, config, 0);
    const first = stream.next(1, "BASE_REFILL")[0];
    const second = stream.next(1, "BASE_REFILL")[0];
    expect(getNormalSymbol(first)).toBe("S3");
    expect(getNormalSymbol(second)).toBe("S3");
    expect(getStackMetadata(first)).toEqual({ stackId: 1_000_001, stackIndex: 0, stackSize: 2 });
    expect(getStackMetadata(second)).toEqual({ stackId: 1_000_001, stackIndex: 1, stackSize: 2 });
  });
});