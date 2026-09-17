import { describe, expect, it } from "vitest";
import { simulate } from "./Simulator";

describe("simulator", () => {
  it("is reproducible for a seed", () => {
    expect(simulate(1000, "123")).toEqual(simulate(1000, "123"));
    expect(simulate(1000, "123").totalReturnCents).not.toBe(simulate(1000, "124").totalReturnCents);
  });

  it("reports million-pair copy and separate third-position metrics", () => {
    const report = simulate(1, "pair-metrics");
    expect(report.sampledNormalPairs).toBe(1_000_000);
    expect(report.configuredCopyBranchProbability).toBe(75);
    expect(report.observedCopyBranchProbability).toBeGreaterThan(73);
    expect(report.observedCopyBranchProbability).toBeLessThan(77);
    expect(report.observedSecondSameProbability).toBeGreaterThan(report.observedCopyBranchProbability);
    expect(report.configuredThirdCopyBranchProbability).toBe(50);
    expect(report.observedThirdCopyBranchProbability).toBeGreaterThan(48);
    expect(report.observedThirdCopyBranchProbability).toBeLessThan(52);
    expect(report.configuredThirdRepeatWeightFactor).toBe(50);
    expect(report.observedThirdFallbackSameProbability).toBeLessThan(10);
    expect(report.thirdPositionSamples).toBeGreaterThan(999_000);
    expect(report.thirdMatchesPreviousSecondProbability).toBeGreaterThan(50);
    expect(report.thirdMatchesPreviousSecondProbability).toBeLessThan(65);
    expect(report.exactTwoTumbleFrequency).toBeGreaterThanOrEqual(0);
    expect(report.exactThreeTumbleFrequency).toBeGreaterThanOrEqual(0);
    expect(report.exactFourTumbleFrequency).toBeGreaterThanOrEqual(0);
    expect(report.returnDecompositionDifferenceCents).toBe(0);
    expect(report.symbolAppearanceRates.initialBoard.S8).toBeGreaterThanOrEqual(0);
    expect(report.symbolAppearanceRates.refill.S8).toBeGreaterThanOrEqual(0);
    expect(report.galatasarayExplosionCount).toBeGreaterThanOrEqual(0);
    expect(report.galatasarayExplosionCounts["8"]).toBeGreaterThanOrEqual(0);
    expect(report.galatasarayExplosionCounts["12+"]).toBeGreaterThanOrEqual(0);
  });
});