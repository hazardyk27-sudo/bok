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
  getRouletteAnimationLifecycleAction,
  getRouletteAnimationTransition,
  getRouletteColorLabel,
  getRoulettePhaseAnnouncement,
  getRouletteResultResumeAction,
  getRouletteResultAnnouncement,
  getRouletteMotionProfile,
  getRouletteVisibilityResumeAction,
  isRouletteResultSettled,
  ROULETTE_MOTION_CSS_VARIABLES,
  ROULETTE_MOTION_TIMINGS,
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
  it("formats the Turkish round voice cues without changing the server result", () => {
    expect(getRoulettePhaseAnnouncement("OPEN")).toBe("Bahisler açıldı.");
    expect(getRoulettePhaseAnnouncement("LAST_CALL")).toBe("Son bahisler.");
    expect(getRoulettePhaseAnnouncement("LOCKED")).toBe("Bahisler kapandı.");
    expect(getRoulettePhaseAnnouncement("MULTIPLIER_REVEAL")).toBe("Çarpanlar açıklanıyor.");
    expect(getRoulettePhaseAnnouncement("SPINNING")).toBeNull();
    expect(getRouletteResultAnnouncement(17)).toBe("on yedi, siyah.");
    expect(getRouletteResultAnnouncement(0)).toBe("sıfır, yeşil.");
    expect(getRouletteColorLabel(32)).toBe("kırmızı");
    expect(getRouletteColorLabel(8)).toBe("siyah");
  });

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
    expect(getRouletteResultResumeAction("RESULT", 6000)).toBe("settle");
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
    expect(getRouletteVisibilityResumeAction(result, 6_000)).toBe("settle-result");
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

  it("does not start a second landing when RESULT snapshots repeat after resume", () => {
    const spinning = { id: "repeat-result", phase: "SPINNING" as const, winningNumber: null };
    const result = { id: "repeat-result", phase: "RESULT" as const, winningNumber: 22 };
    const firstLanding = getRouletteAnimationLifecycleAction(spinning, result, {
      visibilityResume: false,
      elapsedMs: 0,
      activeSpinRoundId: "repeat-result",
      animatedResultKey: "",
      settledResultKey: "",
    });
    const resumedLanding = getRouletteAnimationLifecycleAction(result, result, {
      visibilityResume: true,
      elapsedMs: 1_200,
      activeSpinRoundId: "",
      animatedResultKey: "repeat-result:22",
      settledResultKey: "",
    });
    const settledRepeat = getRouletteAnimationLifecycleAction(result, result, {
      visibilityResume: true,
      elapsedMs: 1_400,
      activeSpinRoundId: "",
      animatedResultKey: "repeat-result:22",
      settledResultKey: "repeat-result:22",
    });

    expect(firstLanding.action).toBe("start-landing");
    expect(resumedLanding.action).toBe("resume-landing");
    expect(settledRepeat.action).toBe("noop");
  });

  it("models start, cancel, and settle as idempotent operations across suspension modes", () => {
    type Operation = "start-spin" | "start-landing" | "cancel" | "settle";
    const operations: Operation[] = [];
    let activeSpinRoundId = "";
    let animatedResultKey = "";
    let settledResultKey = "";
    const apply = (
      previous: Parameters<typeof getRouletteAnimationLifecycleAction>[0],
      next: Parameters<typeof getRouletteAnimationLifecycleAction>[1],
      visibilityResume: boolean,
      elapsedMs: number,
    ) => {
      const plan = getRouletteAnimationLifecycleAction(previous, next, {
        visibilityResume,
        elapsedMs,
        activeSpinRoundId,
        animatedResultKey,
        settledResultKey,
      });
      if (plan.action === "start-spin") {
        operations.push("start-spin");
        activeSpinRoundId = next.id;
      } else if (plan.action === "start-landing") {
        operations.push("cancel", "start-landing");
        activeSpinRoundId = "";
        animatedResultKey = plan.resultKey;
      } else if (plan.action === "settle") {
        operations.push("cancel", "settle");
        activeSpinRoundId = "";
        animatedResultKey = plan.resultKey;
        settledResultKey = plan.resultKey;
      }
      return plan.action;
    };
    const spinning = { id: "operation-round", phase: "SPINNING" as const, winningNumber: null };
    const result = { id: "operation-round", phase: "RESULT" as const, winningNumber: 9 };
    const settling = { id: "operation-round", phase: "SETTLING" as const, winningNumber: 9 };

    expect(apply(null, spinning, false, 0)).toBe("start-spin");
    expect(apply(spinning, spinning, true, 4_000)).toBe("resume-spin");
    expect(apply(spinning, result, false, 0)).toBe("start-landing");
    expect(apply(result, result, true, 1_200)).toBe("resume-landing");
    expect(apply(result, settling, true, 0)).toBe("settle");
    expect(apply(settling, settling, true, 0)).toBe("noop");
    expect(operations).toEqual(["start-spin", "cancel", "start-landing", "cancel", "settle"]);
  });
});

describe("roulette motion timing contract", () => {
  it("keeps motion variation deterministic while changing the visible path per round", () => {
    const first = getRouletteMotionProfile("round-a");
    const firstRepeat = getRouletteMotionProfile("round-a");
    const second = getRouletteMotionProfile("round-b");

    expect(first).toEqual(firstRepeat);
    expect(first).not.toEqual(second);
    expect(first.bounceCount).toBeGreaterThanOrEqual(2);
    expect(first.bounceCount).toBeLessThanOrEqual(5);
    expect(first.outerTrackTurns).toBeGreaterThanOrEqual(4);
    expect(first.outerTrackTurns).toBeLessThanOrEqual(5);
    expect(first.ballOrbitMs).toBeGreaterThan(2_000);
  });

  it("keeps orbit, landing, and reveal timings coordinated", () => {
    expect(ROULETTE_MOTION_TIMINGS).toEqual({
      rotorOrbitMs: 4700,
      ballOrbitMs: 2600,
      landingDurationMs: 2800,
      resultRevealDelayMs: 2800,
      resultRevealDurationMs: 500,
    });
    expect(ROULETTE_MOTION_TIMINGS.resultRevealDelayMs)
      .toBeLessThanOrEqual(ROULETTE_MOTION_TIMINGS.landingDurationMs);
    expect(ROULETTE_MOTION_TIMINGS.landingDurationMs - ROULETTE_MOTION_TIMINGS.resultRevealDelayMs)
      .toBeLessThanOrEqual(100);
  });

  it("routes CSS animation durations through the shared timing variables", () => {
    expect(rouletteCss).toContain(".roulette-wheel-live.is-spinning .wheel-rotor { animation: none; }");
    expect(rouletteCss).toContain(`animation: roulette-result-pop-compact var(${ROULETTE_MOTION_CSS_VARIABLES.resultReveal})`);
    expect(rouletteCss).not.toContain("roulette-rotor-roll 1.9s");
    expect(rouletteCss).not.toContain("roulette-result-pop-compact .45s");
      expect(rouletteCss).toContain("--number-radius: clamp(118px, 41cqw, 220px);");
  });
});

const rouletteCss = readFileSync(fileURLToPath(new URL("./roulette.css", import.meta.url)), "utf8");
