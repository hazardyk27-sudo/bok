import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  getRouletteVisibilityResumeAction,
  isRouletteResultSettled,
  ROULETTE_MOTION_CSS_VARIABLES,
  ROULETTE_MOTION_TIMINGS,
} from "./rouletteClient";

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
    const spinning = { id: "mobile-spin", phase: "SPINNING" as const, winningNumber: null };
    const result = { id: "mobile-result", phase: "RESULT" as const, winningNumber: 26 };

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
    const result = { id: "mobile-result", phase: "RESULT" as const, winningNumber: 26 };

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

  it("recovers a mobile tab returning during SPINNING without inventing a result", () => {
    const mobileViewport = { width: 390, height: 844 };
    const spinning = { id: "mobile-spin", phase: "SPINNING" as const, winningNumber: null };

    expect(mobileViewport.width).toBeLessThan(600);
    expect(getRouletteVisibilityResumeAction(spinning, 4_000)).toBe("start-spin");
    expect(getRouletteAnimationTransition(spinning, spinning)).toEqual({ startsSpin: false, winningNumber: null });
  });

  it("resumes a mobile RESULT landing from its server phase clock", () => {
    const result = { id: "mobile-result", phase: "RESULT" as const, winningNumber: 26 };

    expect(getRouletteVisibilityResumeAction(result, 1_200)).toBe("resume-result");
    expect(getRouletteVisibilityResumeAction(result, 3_850)).toBe("settle-result");
    expect(getRouletteAnimationTransition(result, result)).toEqual({ startsSpin: false, winningNumber: null });
    expect(isRouletteResultSettled(result, "mobile-result:26")).toBe(true);
  });

  it("settles once after a mobile return beyond RESULT and keeps later snapshots from replaying", () => {
    const settled = { id: "mobile-settled", phase: "SETTLING" as const, winningNumber: 8 };
    const settledKey = "mobile-settled:8";

    expect(getRouletteVisibilityResumeAction(settled, 0)).toBe("settle-result");
    expect(getRouletteVisibilityResumeAction(settled, Number.NaN)).toBe("settle-result");
    expect(isRouletteResultSettled(settled, settledKey)).toBe(true);
    expect(getRouletteAnimationTransition(settled, settled)).toEqual({ startsSpin: false, winningNumber: null });
  });
});

describe("roulette motion timing contract", () => {
  it("keeps orbit, landing, and reveal timings coordinated", () => {
    expect(ROULETTE_MOTION_TIMINGS).toEqual({
      rotorOrbitMs: 1450,
      ballOrbitMs: 620,
      landingDurationMs: 3900,
      resultRevealDelayMs: 3850,
      resultRevealDurationMs: 450,
    });
    expect(ROULETTE_MOTION_TIMINGS.resultRevealDelayMs)
      .toBeLessThanOrEqual(ROULETTE_MOTION_TIMINGS.landingDurationMs);
    expect(ROULETTE_MOTION_TIMINGS.landingDurationMs - ROULETTE_MOTION_TIMINGS.resultRevealDelayMs)
      .toBeLessThanOrEqual(100);
  });

  it("routes CSS animation durations through the shared timing variables", () => {
    expect(rouletteCss).toContain(`animation: roulette-rotor-roll var(${ROULETTE_MOTION_CSS_VARIABLES.rotorOrbit}) linear infinite`);
    expect(rouletteCss).toContain(`animation: roulette-result-pop-compact var(${ROULETTE_MOTION_CSS_VARIABLES.resultReveal})`);
    expect(rouletteCss).not.toContain("roulette-rotor-roll 1.9s");
    expect(rouletteCss).not.toContain("roulette-result-pop-compact .45s");
  });
});

const rouletteCss = readFileSync(fileURLToPath(new URL("./roulette.css", import.meta.url)), "utf8");
