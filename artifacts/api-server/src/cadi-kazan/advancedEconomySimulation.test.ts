import { describe, expect, it } from "vitest";
import { simulateAdvancedEconomy } from "./advancedEconomySimulation";

describe("Advanced economy simulation", () => {
  it("reports every requested risk and strategy without using client state", () => {
    const results = simulateAdvancedEconomy(10_000, 1234);
    expect(results).toHaveLength(5 * 6);
    expect(results.some((result) => result.bombCount === 10 && result.scenario === "aggressive")).toBe(true);
    expect(results.every((result) => result.trials === 10_000)).toBe(true);
    expect(results.every((result) => result.rtp >= 0 && result.rtp <= 10)).toBe(true);
  });
});