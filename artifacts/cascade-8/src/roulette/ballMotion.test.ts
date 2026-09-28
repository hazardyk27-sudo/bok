import { describe, expect, it } from "vitest";
import {
  BALL_TRACK_STYLE,
  DEFLECTOR_STYLE,
  WHEEL_GEOMETRY,
} from "./config";
import {
  BALL_ORBIT_PROFILE,
  createBallOrbit,
  getBallDescentStartMs,
  getBallOrbitDurationMs,
  getBallOrbitRevolutions,
  sampleBallOrbit,
} from "./ballMotion";

describe("roulette ball descent and deflector collision", () => {
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
    expect(getBallOrbitRevolutions(orbit)).toBeGreaterThan(9);
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

  it("finds the first collision from fixed deflector geometry rather than a target pocket", () => {
    const orbit = createBallOrbit();

    expect(DEFLECTOR_STYLE.count).toBe(4);
    expect(orbit.collision).not.toBeNull();
    expect(orbit.collision!.timeMs).toBeGreaterThan(orbit.descentStartMs);
    expect(orbit.collision!.timeMs).toBeLessThan(orbit.durationMs);
    expect(orbit.collision!.deflectorIndex).toBeGreaterThanOrEqual(0);
    expect(orbit.collision!.deflectorIndex).toBeLessThan(DEFLECTOR_STYLE.count);
  });

  it("applies a brief outward/tangential response after geometric contact", () => {
    const orbit = createBallOrbit();
    const collision = orbit.collision!;
    const before = sampleBallOrbit(orbit, collision.timeMs - 16);
    const impact = sampleBallOrbit(orbit, collision.timeMs + 80);
    const later = sampleBallOrbit(orbit, collision.timeMs + 900);

    expect(before.collisionIndex).toBeNull();
    expect(impact.collisionIndex).toBe(collision.deflectorIndex);
    expect(impact.phase).toBe("deflector");
    expect(impact.radiusRatio).toBeGreaterThanOrEqual(before.radiusRatio - 0.02);
    expect(impact.angularVelocity).toBeGreaterThan(0);
    expect(later.phase).toBe("descent");
  });

  it("continues inward after the collision and hands off above the pocket ring", () => {
    const orbit = createBallOrbit();
    const end = sampleBallOrbit(orbit, orbit.durationMs);

    expect(end.phase).toBe("handoff");
    expect(end.radiusRatio).toBeCloseTo(orbit.descentTargetRadius);
    expect(end.radialVelocityRatioPerSecond).toBe(0);
    expect(end.angularVelocity).toBe(0);
    expect(end.done).toBe(true);

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
