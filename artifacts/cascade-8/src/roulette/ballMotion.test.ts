import { describe, expect, it } from "vitest";
import {
  BALL_TRACK_STYLE,
  WHEEL_GEOMETRY,
} from "./config";
import {
  BALL_ORBIT_PROFILE,
  createBallOrbit,
  getBallOrbitDurationMs,
  getBallOrbitRevolutions,
  getBallSpeedThresholdMs,
  sampleBallOrbit,
} from "./ballMotion";
import { createRotorSpin } from "./spinMotion";

describe("roulette ball rotor-relative fret entry", () => {
  it("uses speed thresholds for descent and pocket entry", () => {
    const orbit = createBallOrbit();

    expect(orbit.trackRadius).toBe(
      BALL_TRACK_STYLE.pathRadius,
    );
    expect(orbit.descentStartMs).toBeGreaterThan(3000);
    expect(orbit.descentStartMs).toBeLessThan(3300);
    expect(orbit.pocketEntryStartMs).toBeGreaterThan(5200);
    expect(orbit.pocketEntryStartMs).toBeLessThan(5500);
    expect(orbit.pocketEntryStartMs).toBeGreaterThan(
      orbit.descentStartMs,
    );
    expect(orbit.durationMs).toBeGreaterThan(8500);
    expect(orbit.durationMs).toBeLessThan(10000);
    expect(getBallOrbitRevolutions(orbit)).toBeGreaterThan(8);
  });

  it("moves from the track through the transition band into the pocket zone", () => {
    const orbit = createBallOrbit(0.8);

    const track = sampleBallOrbit(
      orbit,
      orbit.descentStartMs - 1,
    );
    const descent = sampleBallOrbit(
      orbit,
      orbit.descentStartMs + 1200,
    );
    const pocketEntry = sampleBallOrbit(
      orbit,
      orbit.pocketEntryStartMs + 1800,
    );

    expect(track.phase).toBe("track");
    expect(track.radiusRatio).toBeCloseTo(
      orbit.trackRadius,
    );

    expect(descent.radiusRatio).toBeLessThan(
      orbit.trackRadius,
    );

    expect(pocketEntry.radiusRatio).toBeLessThan(
      WHEEL_GEOMETRY.numberOuterRadius,
    );
    expect(pocketEntry.radiusRatio).toBeGreaterThanOrEqual(
      orbit.pocketEntryTargetRadius,
    );
  });

  it("finds first fret contact from ball angle versus the rotating separator geometry", () => {
    const rotorSpin = createRotorSpin(0.37, 1);
    const orbit = createBallOrbit(-0.72, rotorSpin);

    expect(orbit.fretCollision).not.toBeNull();
    expect(orbit.fretCollision!.timeMs).toBeGreaterThan(
      orbit.pocketEntryStartMs,
    );
    expect(orbit.fretCollision!.timeMs).toBeLessThan(
      orbit.durationMs,
    );
    expect(
      orbit.fretCollision!.separatorIndex,
    ).toBeGreaterThanOrEqual(0);
    expect(
      orbit.fretCollision!.separatorIndex,
    ).toBeLessThan(37);
    expect(
      Math.abs(
        orbit.fretCollision!
          .relativeAngularVelocityBefore,
      ),
    ).toBeGreaterThan(0);
  });

  it("reflects rotor-relative tangential speed at first fret contact", () => {
    const rotorSpin = createRotorSpin(0.37, 1);
    const orbit = createBallOrbit(-0.72, rotorSpin);
    const collision = orbit.fretCollision!;

    const before = sampleBallOrbit(
      orbit,
      collision.timeMs - 8,
    );
    const impact = sampleBallOrbit(
      orbit,
      collision.timeMs + 48,
    );
    const later = sampleBallOrbit(
      orbit,
      collision.timeMs + 900,
    );

    expect(before.fretCollisionIndex).toBeNull();
    expect(impact.fretCollisionIndex).toBe(
      collision.separatorIndex,
    );
    expect(impact.phase).toBe("fret");
    expect(impact.angularVelocity).toBeGreaterThan(0);
    expect(impact.radiusRatio).toBeGreaterThanOrEqual(
      orbit.pocketEntryTargetRadius,
    );
    expect(later.phase).not.toBe("fret");
  });

  it("hands off inside the pocket ring without selecting a winning pocket", () => {
    const orbit = createBallOrbit();
    const end = sampleBallOrbit(
      orbit,
      orbit.durationMs,
    );

    expect(end.phase).toBe("handoff");
    expect(end.radiusRatio).toBeCloseTo(
      orbit.pocketEntryTargetRadius,
    );
    expect(end.radialVelocityRatioPerSecond).toBe(0);
    expect(end.angularVelocity).toBe(0);
    expect(end.done).toBe(true);

    expect(orbit.pocketEntryTargetRadius).toBeLessThan(
      WHEEL_GEOMETRY.pocketOuterRadius,
    );
    expect(orbit.pocketEntryTargetRadius).toBeGreaterThan(
      WHEEL_GEOMETRY.pocketInnerRadius,
    );
  });

  it("rejects invalid speed threshold inputs", () => {
    expect(
      getBallOrbitDurationMs(0, 0.2, 1),
    ).toBe(0);
    expect(
      getBallOrbitDurationMs(10, 0, 1),
    ).toBe(0);
    expect(
      getBallOrbitDurationMs(10, 0.2, 10),
    ).toBe(0);

    expect(
      getBallSpeedThresholdMs(0, 0.2, 5),
    ).toBe(0);
    expect(
      getBallSpeedThresholdMs(10, 0, 5),
    ).toBe(0);
    expect(
      getBallSpeedThresholdMs(10, 0.2, 10),
    ).toBe(0);
  });

  it("does not expose any target-number input in the motion profile", () => {
    expect(
      "targetNumber" in BALL_ORBIT_PROFILE,
    ).toBe(false);
    expect(
      "targetPocket" in BALL_ORBIT_PROFILE,
    ).toBe(false);
  });
});
