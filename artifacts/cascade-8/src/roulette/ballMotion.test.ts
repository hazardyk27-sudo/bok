import { describe, expect, it } from "vitest";
import {
  BALL_ORBIT_PROFILE,
  createBallOrbit,
  getBallOrbitDurationMs,
  getBallOrbitRevolutions,
  sampleBallOrbit,
} from "./ballMotion";

describe("roulette ball visual orbit", () => {
  it("runs counter to the rotor on the fixed outer track", () => {
    const orbit = createBallOrbit();

    expect(orbit.direction).toBe(-1);
    expect(orbit.initialAngularVelocity).toBe(
      BALL_ORBIT_PROFILE.initialAngularVelocity,
    );
    expect(orbit.durationMs).toBeGreaterThan(8500);
    expect(orbit.durationMs).toBeLessThan(10000);
    expect(getBallOrbitRevolutions(orbit)).toBeGreaterThan(10);
  });

  it("slows smoothly without changing radius or selecting a pocket", () => {
    const orbit = createBallOrbit(0.8);
    const early = sampleBallOrbit(orbit, 1000);
    const middle = sampleBallOrbit(orbit, orbit.durationMs / 2);
    const end = sampleBallOrbit(orbit, orbit.durationMs);

    expect(early.angle).toBeLessThan(orbit.startAngle);
    expect(middle.angle).toBeLessThan(early.angle);
    expect(early.angularVelocity).toBeGreaterThan(middle.angularVelocity);
    expect(end.done).toBe(true);
    expect(end.angularVelocity).toBe(0);
  });

  it("rejects invalid orbit duration parameters", () => {
    expect(getBallOrbitDurationMs(0, 0.2, 1)).toBe(0);
    expect(getBallOrbitDurationMs(10, 0, 1)).toBe(0);
    expect(getBallOrbitDurationMs(10, 0.2, 10)).toBe(0);
  });
});
