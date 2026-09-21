import { describe, expect, it } from "vitest";
import {
  SCRATCH_REVEAL_THRESHOLD,
  ScratchProgressGrid,
  interpolateScratchPoints,
} from "./ScratchProgress";
import { getCompletionEraseAlpha, SCRATCH_COMPLETION_DURATION_MS } from "./ScratchSurface";

describe("scratch progress core", () => {
  it("keeps a single tap and tiny movement below the reveal threshold", () => {
    const progress = new ScratchProgressGrid();
    progress.sampleCircle(0.5, 0.5, 0.06);
    progress.sampleCircle(0.51, 0.5, 0.03);

    expect(progress.coverage).toBeLessThan(SCRATCH_REVEAL_THRESHOLD);
    expect(progress.committed).toBe(false);
    expect(progress.depthAt(0.5, 0.5)).toBeLessThan(0.74);
    expect(progress.isRevealableAt(0.5, 0.5)).toBe(false);
  });

  it("requires repeated abrasion before a local result can show", () => {
    const progress = new ScratchProgressGrid();
    for (let pass = 0; pass < 8; pass += 1) progress.sampleCircle(0.5, 0.5, 0.06);

    expect(progress.isRevealableAt(0.5, 0.5)).toBe(false);
    progress.sampleCircle(0.5, 0.5, 0.06);
    expect(progress.isRevealableAt(0.5, 0.5)).toBe(true);
  });

  it("counts only locally deep cells toward global completion", () => {
    const progress = new ScratchProgressGrid();
    for (let pass = 0; pass < 9; pass += 1) progress.sampleCircle(0.5, 0.5, 0.06);

    expect(progress.isRevealableAt(0.5, 0.5)).toBe(true);
    expect(progress.coverage).toBeLessThan(SCRATCH_REVEAL_THRESHOLD);
    expect(progress.committed).toBe(false);
  });

  it("interpolates fast pointer movement without gaps", () => {
    const points = interpolateScratchPoints({ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 });

    expect(points[0]).toEqual({ x: 0.1, y: 0.2 });
    expect(points.at(-1)).toEqual({ x: 0.9, y: 0.8 });
    expect(Math.max(...points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y)))).toBeLessThanOrEqual(0.0351);
  });

  it("commits only after broad real scratch coverage", () => {
    const progress = new ScratchProgressGrid();
    for (let row = 0; row < 7; row += 1) {
      const y = (row + 0.5) / 10;
      const from = row % 2 === 0 ? { x: 0.02, y } : { x: 0.98, y };
      const to = row % 2 === 0 ? { x: 0.98, y } : { x: 0.02, y };
      for (const point of interpolateScratchPoints(from, to)) progress.sampleCircle(point.x, point.y, 0.055);
    }

    expect(progress.coverage).toBeGreaterThanOrEqual(SCRATCH_REVEAL_THRESHOLD);
    expect(progress.committed).toBe(true);
  });

  it("allows the threshold to be tuned by configuration", () => {
    const progress = new ScratchProgressGrid(10, 10, 0.8);
    progress.sampleCircle(0.5, 0.5, 0.2);

    expect(progress.committed).toBe(false);
    expect(progress.threshold).toBe(0.8);
  });

  it("keeps threshold completion short enough to finish the visible mask", () => {
    expect(SCRATCH_COMPLETION_DURATION_MS).toBeGreaterThanOrEqual(150);
    expect(SCRATCH_COMPLETION_DURATION_MS).toBeLessThanOrEqual(250);
  });

  it("uses incremental clear alpha so the mask lasts through the full duration", () => {
    expect(getCompletionEraseAlpha(0.5, 0.4)).toBeCloseTo(1 / 6);
    expect(getCompletionEraseAlpha(1, 0.9)).toBe(1);
  });
});