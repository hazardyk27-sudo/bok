import { describe, expect, it } from "vitest";
import { BALL_TRACK_STYLE, WHEEL_GEOMETRY } from "./config";
import {
  BALL_ORBIT_PROFILE,
  createBallOrbit,
  getBallDescentStartMs,
  getBallOrbitDurationMs,
  getBallOrbitRevolutions,
  sampleBallOrbit,
} from "./ballMotion";

describe("roulette ball track and inward descent", () => {
  it("runs counter to the rotor before beginning inward descent", () => {
    const orbit = createBallOrbit();

    expect(orbit.direction).toBe(-1);
    expect(orbit.initialAngularVelocity).toBe(
      BALL_ORBIT_PROFILE.initialAngularVelocity,
    );
    expect(orbit.trackRadius).toBe(BALL_TRACK_STYLE.pathRadius);
    expect(orbit.descentStartMs).toBeGreaterThan(3000);
    expect(orbit.descentStartMs).toBeLessThan(3300);
    expect(orbit.durationMs).toBeGreaterThan(8500);
    expect(orbit.durationMs).toBeLessThan(10000);
    expect(getBallOrbitRevolutions(orbit)).toBeGreaterThan(10);
  });

  it("holds the track radius while angular speed is above the descent threshold", () => {
    const orbit = createBallOrbit(0.8);
    const beforeDescent = sampleBallOrbit(
      orbit,
      orbit.descentStartMs - 1,
    );
    const atDescent = sampleBallOrbit(
      orbit,
      orbit.descentStartMs,
    );

    expect(beforeDescent.phase).toBe("track");
    expect(beforeDescent.radiusRatio).toBeCloseTo(orbit.trackRadius);
    expect(beforeDescent.radialVelocityRatioPerSecond).toBe(0);
    expect(atDescent.radiusRatio).toBeCloseTo(orbit.trackRadius);
  });

  it("moves radially inward only after losing enough angular speed", () => {
    const orbit = createBallOrbit(0.8);
    const descending = sampleBallOrbit(
      orbit,
      orbit.descentStartMs + 1800,
    );
    const later = sampleBallOrbit(
      orbit,
      orbit.descentStartMs + 3600,
    );
    const end = sampleBallOrbit(orbit, orbit.durationMs);

    expect(descending.phase).toBe("descent");
    expect(descending.radiusRatio).toBeLessThan(orbit.trackRadius);
    expect(descending.radiusRatio).toBeGreaterThan(orbit.descentTargetRadius);
    expect(descending.radialVelocityRatioPerSecond).toBeLessThan(0);

    expect(later.radiusRatio).toBeLessThan(descending.radiusRatio);
    expect(end.phase).toBe("handoff");
    expect(end.radiusRatio).toBeCloseTo(orbit.descentTargetRadius);
    expect(end.radialVelocityRatioPerSecond).toBe(0);
    expect(end.done).toBe(true);
  });

  it("hands the ball off above the pocket ring without choosing a pocket", () => {
    const orbit = createBallOrbit();

    expect(orbit.descentTargetRadius).toBeLessThan(
      WHEEL_GEOMETRY.numberOuterRadius,
    );
    expect(orbit.descentTargetRadius).toBeGreaterThan(
      WHEEL_GEOMETRY.pocketOuterRadius,
    );
  });

  it("rejects invalid motion duration parameters", () => {
    expect(getBallOrbitDurationMs(0, 0.2, 1)).toBe(0);
    expect(getBallOrbitDurationMs(10, 0, 1)).toBe(0);
    expect(getBallOrbitDurationMs(10, 0.2, 10)).toBe(0);

    expect(getBallDescentStartMs(0, 0.2, 5)).toBe(0);
    expect(getBallDescentStartMs(10, 0, 5)).toBe(0);
    expect(getBallDescentStartMs(10, 0.2, 10)).toBe(0);
  });
});
