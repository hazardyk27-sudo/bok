import { describe, expect, it } from "vitest";
import { SeededRNG, weightedChoice } from "./RNG";
import { generateInitialBoard } from "./BoardGenerator";

describe("randomness", () => {
  it("repeats the same deterministic sequence for the same seed", () => {
    const a = new SeededRNG("same");
    const b = new SeededRNG("same");
    expect(Array.from({ length: 20 }, () => a.nextFloat())).toEqual(Array.from({ length: 20 }, () => b.nextFloat()));
  });
  it("changes sequence for a different seed", () => {
    const a = new SeededRNG("a");
    const b = new SeededRNG("b");
    expect(a.nextFloat()).not.toBe(b.nextFloat());
  });
  it("keeps bet size out of board generation", () => {
    const a = new SeededRNG(42);
    const b = new SeededRNG(42);
    expect(generateInitialBoard(a)).toEqual(generateInitialBoard(b));
  });
  it("approximates a weighted choice", () => {
    const rng = new SeededRNG(2);
    let first = 0;
    for (let i = 0; i < 10_000; i += 1) if (weightedChoice(rng, [{ value: "first", weight: 70 }, { value: "second", weight: 30 }]) === "first") first += 1;
    expect(first / 10_000).toBeGreaterThan(0.66);
    expect(first / 10_000).toBeLessThan(0.74);
  });
});