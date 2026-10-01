import { describe, expect, it } from "vitest";
import { getScratchCommitPlan } from "./ScratchSurface";

describe("scratch commit timing", () => {
  it("preserves the 420ms anti-spoiler gate but defers a sufficiently scratched fast release", () => {
    expect(getScratchCommitPlan({
      elapsedMs: 180,
      scratchDistancePx: 180,
      accumulatedScratchDistancePx: 180,
      widthPx: 100,
      coverage: 0.28,
      persistentCoverageCommit: false,
    })).toEqual({ commitNow: false, deferMs: 240 });
  });

  it("commits immediately once the existing timing, distance and coverage gates are met", () => {
    expect(getScratchCommitPlan({
      elapsedMs: 450,
      scratchDistancePx: 180,
      accumulatedScratchDistancePx: 180,
      widthPx: 100,
      coverage: 0.28,
      persistentCoverageCommit: false,
    })).toEqual({ commitNow: true, deferMs: 0 });
  });

  it("does not auto-commit a lightly scratched cell", () => {
    expect(getScratchCommitPlan({
      elapsedMs: 600,
      scratchDistancePx: 180,
      accumulatedScratchDistancePx: 180,
      widthPx: 100,
      coverage: 0.12,
      persistentCoverageCommit: false,
    })).toEqual({ commitNow: false, deferMs: null });
  });

  it("keeps the Office persistent-coverage escape hatch immediate", () => {
    expect(getScratchCommitPlan({
      elapsedMs: 120,
      scratchDistancePx: 20,
      accumulatedScratchDistancePx: 120,
      widthPx: 100,
      coverage: 0.36,
      persistentCoverageCommit: true,
    })).toEqual({ commitNow: true, deferMs: 0 });
  });
});
