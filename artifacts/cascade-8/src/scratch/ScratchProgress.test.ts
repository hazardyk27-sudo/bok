import { describe, expect, it } from "vitest";
import {
  SCRATCH_ABRASION_CONFIG,
  ScratchProgressGrid,
  interpolateScratchPoints,
} from "./ScratchProgress";

describe("scratch progress core", () => {
  it("keeps the first pass shallow so the coating wears in stages", () => {
    const progress = new ScratchProgressGrid();
    progress.sampleCircle(0.5, 0.5, 0.06);

    expect(progress.depthAt(0.5, 0.5)).toBeLessThan(SCRATCH_ABRASION_CONFIG.revealDepth);
    expect(progress.isRevealableAt(0.5, 0.5)).toBe(false);
  });

  it("requires repeated abrasion before the deepest layer becomes revealable", () => {
    const progress = new ScratchProgressGrid();

    for (let pass = 0; pass < 18; pass += 1) {
      progress.sampleCircle(0.5, 0.5, 0.06);
    }
    expect(progress.isRevealableAt(0.5, 0.5)).toBe(false);

    for (let pass = 0; pass < 24; pass += 1) {
      progress.sampleCircle(0.5, 0.5, 0.06);
    }
    expect(progress.isRevealableAt(0.5, 0.5)).toBe(true);
    expect(progress.isRevealableAt(0.08, 0.08)).toBe(false);
  });

  it("interpolates fast pointer movement densely enough to avoid gaps", () => {
    const points = interpolateScratchPoints({ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 });

    expect(points[0]).toEqual({ x: 0.1, y: 0.2 });
    expect(points.at(-1)).toEqual({ x: 0.9, y: 0.8 });
    expect(Math.max(...points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y)))).toBeLessThanOrEqual(0.0181);
  });

  it("tracks local coverage without requiring any global auto-clear", () => {
    const progress = new ScratchProgressGrid();
    for (let row = 0; row < 6; row += 1) {
      const y = (row + 0.5) / 10;
      const from = row % 2 === 0 ? { x: 0.02, y } : { x: 0.98, y };
      const to = row % 2 === 0 ? { x: 0.98, y } : { x: 0.02, y };
      for (let pass = 0; pass < 4; pass += 1) {
        for (const point of interpolateScratchPoints(from, to)) {
          progress.sampleCircle(point.x, point.y, 0.055);
        }
      }
    }

    expect(progress.coverage).toBeGreaterThan(0);
    expect(progress.coverage).toBeLessThanOrEqual(1);
  });
});
