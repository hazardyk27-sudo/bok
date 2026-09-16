import { describe, expect, it } from "vitest";
import {
  EUROPEAN_WHEEL_ORDER,
  FALLBACK_OUTER_RADIUS_RATIO,
  FALLBACK_POCKET_RADIUS_RATIO,
  getWheelAngle,
  getWheelIndex,
  getWheelLandingPlan,
  ROULETTE_POCKET_COUNT,
  ROULETTE_SEGMENT_DEGREES,
} from "./rouletteGeometry";
import {
  getRouletteAnimationTransition,
  getRouletteResultResumeAction,
  isRouletteResultSettled,
} from "./rouletteClient";

describe("roulette wheel geometry", () => {
  it("keeps the exact European pocket order used by the rendered wheel", () => {
    expect(EUROPEAN_WHEEL_ORDER).toEqual([
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
      5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
    ]);
    expect(new Set(EUROPEAN_WHEEL_ORDER).size).toBe(37);
    expect(ROULETTE_POCKET_COUNT).toBe(37);
    expect(ROULETTE_SEGMENT_DEGREES).toBeCloseTo(360 / 37);
  });

  it("maps a server-selected number to the same pocket index and rotor orientation", () => {
    const radii = { outerRadius: 204, pocketRadius: 146 };
    const plan = getWheelLandingPlan(26, 137.5, radii);

    expect(plan.pocketIndex).toBe(getWheelIndex(26));
    expect(plan.targetAngle).toBeCloseTo(getWheelAngle(26));
    expect(plan.targetOrientation).toBeCloseTo(360 - getWheelAngle(26));
    expect(plan.outerRadius).toBe(radii.outerRadius);
    expect(plan.pocketRadius).toBe(radii.pocketRadius);
    expect(plan.finalRotation - plan.wheelDelta).toBeCloseTo(137.5);
  });

  it("has ratio fallbacks for the same outer and pocket tracks used by the CSS", () => {
    expect(FALLBACK_OUTER_RADIUS_RATIO).toBe(0.45);
    expect(FALLBACK_POCKET_RADIUS_RATIO).toBe(0.34);
    expect(FALLBACK_OUTER_RADIUS_RATIO).toBeGreaterThan(FALLBACK_POCKET_RADIUS_RATIO);
  });
});


describe("server-driven roulette animation transitions", () => {
  it("starts only when the server enters SPINNING and finishes on the revealed result", () => {
    const locked = { id: "round-1", phase: "LOCKED" as const, winningNumber: null };
    const spinning = { id: "round-1", phase: "SPINNING" as const, winningNumber: null };
    const result = { id: "round-1", phase: "RESULT" as const, winningNumber: 17 };

    expect(getRouletteAnimationTransition(locked, spinning)).toEqual({ startsSpin: true, winningNumber: null });
    expect(getRouletteAnimationTransition(spinning, result)).toEqual({ startsSpin: false, winningNumber: 17 });
    expect(getRouletteAnimationTransition(result, result)).toEqual({ startsSpin: false, winningNumber: null });
  });

  it("can hydrate directly into a result without inventing a client-side number", () => {
    expect(getRouletteAnimationTransition(null, {
      id: "round-2",
      phase: "RESULT",
      winningNumber: 0,
    })).toEqual({ startsSpin: false, winningNumber: 0 });
  });

  it("keeps the result hidden until the matching visual landing settles", () => {
    const result = { id: "round-3", phase: "RESULT" as const, winningNumber: 31 };

    expect(isRouletteResultSettled(result, "")).toBe(false);
    expect(isRouletteResultSettled(result, "round-2:31")).toBe(false);
    expect(isRouletteResultSettled(result, "round-3:31")).toBe(true);
    expect(isRouletteResultSettled({ ...result, winningNumber: null }, "round-3:31")).toBe(false);
  });

  it("resumes only an active RESULT landing and settles after the landing window", () => {
    expect(getRouletteResultResumeAction("RESULT", 1200)).toBe("resume");
    expect(getRouletteResultResumeAction("RESULT", 3850)).toBe("settle");
    expect(getRouletteResultResumeAction("MULTIPLIER_REVEAL", 1200)).toBe("settle");
    expect(getRouletteResultResumeAction("RESULT", Number.NaN)).toBe("settle");
  });
});