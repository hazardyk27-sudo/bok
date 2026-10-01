import { describe, expect, it } from "vitest";
import {
  getAnimationDuration,
  getTumblePacingFactor,
  scaleTumbleAnimationDuration,
  shouldResumeAutoSpin,
} from "./GameTiming";

describe("game timing", () => {
  it("keeps free spins at normal speed when Turbo is enabled", () => {
    expect(getAnimationDuration(820, true, true)).toBe(943);
    expect(getAnimationDuration(820, false, true)).toBe(943);
  });

  it("uses Turbo timing outside Free Spins", () => {
    expect(getAnimationDuration(820, true, false)).toBe(339);
    expect(getAnimationDuration(820, false, false)).toBe(943);
  });

  it("compresses long base tumble chains without changing one-tumble pacing", () => {
    expect(getTumblePacingFactor(0, false)).toBe(1);
    expect(getTumblePacingFactor(1, false)).toBe(1);
    expect(getTumblePacingFactor(2, false)).toBe(0.84);
    expect(getTumblePacingFactor(3, false)).toBe(0.72);
    expect(getTumblePacingFactor(5, false)).toBe(0.58);
    expect(getTumblePacingFactor(8, false)).toBe(0.54);
    expect(scaleTumbleAnimationDuration(560, 5, false, false)).toBe(374);
  });

  it("keeps bonus pacing ceremonial while bounding long chains", () => {
    expect(getTumblePacingFactor(5, true)).toBe(0.72);
    expect(scaleTumbleAnimationDuration(560, 5, false, true)).toBe(464);
  });

  it("only resumes Auto Spin when bonus context remains and spins are left", () => {
    expect(shouldResumeAutoSpin(true, 24)).toBe(true);
    expect(shouldResumeAutoSpin(true, 0)).toBe(false);
    expect(shouldResumeAutoSpin(false, 24)).toBe(false);
  });
});