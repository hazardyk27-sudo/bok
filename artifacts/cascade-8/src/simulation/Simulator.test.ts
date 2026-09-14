import { describe, expect, it } from "vitest";
import { simulate } from "./Simulator";

describe("simulator", () => {
  it("is reproducible for a seed", () => {
    expect(simulate(1000, "123")).toEqual(simulate(1000, "123"));
    expect(simulate(1000, "123").totalReturnCents).not.toBe(simulate(1000, "124").totalReturnCents);
  });

  it("reports million-pair copy and third-position independence metrics", () => {
    const report = simulate(1, "pair-metrics");
    expect(report.sampledNormalPairs).toBe(1_000_000);
    expect(report.configuredCopyBranchProbability).toBe(90);
    expect(report.observedCopyBranchProbability).toBeGreaterThan(89);
    expect(report.observedCopyBranchProbability).toBeLessThan(91);
    expect(report.observedSecondSameProbability).toBeGreaterThan(report.observedCopyBranchProbability);
    expect(report.thirdPositionSamples).toBeGreaterThan(999_000);
    expect(report.thirdMatchesPreviousSecondProbability).toBeGreaterThan(8);
    expect(report.thirdMatchesPreviousSecondProbability).toBeLessThan(20);
  });
});