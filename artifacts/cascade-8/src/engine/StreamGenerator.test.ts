import { describe, expect, it } from "vitest";
import { BASE_REEL_CONFIG, type ReelConfig } from "../config/GameConfig";
import { ColumnStream } from "./BoardGenerator";
import { SeededRNG } from "./RNG";

describe("persistent column streams", () => {
  it("keeps normal runs at one or two symbols and approaches 70/30", () => {
    const stream = new ColumnStream(new SeededRNG("stream-distribution"), BASE_REEL_CONFIG, 0);
    const values = stream.next(1_000_000, "BASE_REFILL");
    let maximum = 0;
    let current = 0;
    let previous: unknown;
    for (const value of values) {
      if (value === previous && typeof value === "string") current += 1;
      else current = 1;
      maximum = Math.max(maximum, current);
      previous = value;
    }
    expect(maximum).toBeLessThanOrEqual(2);
    const totalRuns = stream.stats.runLengths["1"] + stream.stats.runLengths["2"];
    expect(stream.stats.runLengths["1"] / totalRuns).toBeGreaterThan(0.73);
    expect(stream.stats.runLengths["1"] / totalRuns).toBeLessThan(0.79);
  });

  it("preserves a pair when refill requests split it across turns", () => {
    const config: ReelConfig = {
      ...BASE_REEL_CONFIG,
      symbolWeights: [{ value: "S3", weight: 1 }],
      runLengthWeights: [{ value: 2, weight: 1 }],
    };
    const stream = new ColumnStream({ nextFloat: () => 0.999999 }, config, 0);
    expect(stream.next(1, "BASE_REFILL")).toEqual(["S3"]);
    expect(stream.next(1, "BASE_REFILL")).toEqual(["S3"]);
  });
});