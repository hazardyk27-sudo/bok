import { describe, expect, it } from "vitest";
import { getAnimationDuration, shouldResumeAutoSpin } from "./GameTiming";

describe("game timing", () => {
  it("keeps free spins at normal speed when Turbo is enabled", () => {
    expect(getAnimationDuration(820, true, false, true)).toBe(943);
    expect(getAnimationDuration(820, false, false, true)).toBe(943);
  });

  it("keeps reduced-motion timing as the highest-priority setting", () => {
    expect(getAnimationDuration(820, true, true, true)).toBe(40);
    expect(getAnimationDuration(820, false, true, false)).toBe(40);
  });

  it("only resumes Auto Spin when bonus context remains and spins are left", () => {
    expect(shouldResumeAutoSpin(true, 24)).toBe(true);
    expect(shouldResumeAutoSpin(true, 0)).toBe(false);
    expect(shouldResumeAutoSpin(false, 24)).toBe(false);
  });
});