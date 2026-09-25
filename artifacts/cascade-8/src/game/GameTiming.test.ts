import { describe, expect, it } from "vitest";
import { getAnimationDuration, shouldResumeAutoSpin } from "./GameTiming";

describe("game timing", () => {
  it("keeps free spins at normal speed when Turbo is enabled", () => {
    expect(getAnimationDuration(820, true, true)).toBe(943);
    expect(getAnimationDuration(820, false, true)).toBe(943);
  });

  it("uses Turbo timing outside Free Spins", () => {
    expect(getAnimationDuration(820, true, false)).toBe(424);
    expect(getAnimationDuration(820, false, false)).toBe(943);
  });

  it("only resumes Auto Spin when bonus context remains and spins are left", () => {
    expect(shouldResumeAutoSpin(true, 24)).toBe(true);
    expect(shouldResumeAutoSpin(true, 0)).toBe(false);
    expect(shouldResumeAutoSpin(false, 24)).toBe(false);
  });
});