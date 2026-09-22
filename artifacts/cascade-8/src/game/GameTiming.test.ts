import { describe, expect, it } from "vitest";
import { getAnimationDuration, shouldResumeAutoSpin } from "./GameTiming";

describe("game timing", () => {
  it("keeps free spins at normal speed when Turbo is enabled", () => {
    expect(getAnimationDuration(820, true, true)).toBe(902);
    expect(getAnimationDuration(820, false, true)).toBe(902);
  });

  it("uses Turbo timing outside Free Spins", () => {
    expect(getAnimationDuration(820, true, false)).toBe(451);
    expect(getAnimationDuration(820, false, false)).toBe(902);
  });

  it("keeps the requested effective drop and refill timings", () => {
    expect(Math.round(getAnimationDuration(727, false, false) * 1.25)).toBe(1000);
    expect(Math.round(getAnimationDuration(727, true, false) * 1.5)).toBe(600);
    expect(Math.round(getAnimationDuration(436, false, false) * 1.25)).toBe(600);
    expect(Math.round(getAnimationDuration(436, true, false) * 1.25)).toBe(300);
  });

  it("only resumes Auto Spin when bonus context remains and spins are left", () => {
    expect(shouldResumeAutoSpin(true, 24)).toBe(true);
    expect(shouldResumeAutoSpin(true, 0)).toBe(false);
    expect(shouldResumeAutoSpin(false, 24)).toBe(false);
  });
});