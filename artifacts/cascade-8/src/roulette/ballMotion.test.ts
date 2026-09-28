import { describe, expect, it } from "vitest";
import {
  BALL_TRACK_STYLE,
  SEGMENT_COUNT,
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

describe("roulette repeated rotor-relative fret bounces", () => {
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

  it("builds multiple fret contacts from live rotor-relative geometry", () => {
    const rotorSpin = createRotorSpin(0.37, 1);
    const orbit = createBallOrbit(-0.72, rotorSpin);

    expect(orbit.fretCollisions.length).toBeGreaterThanOrEqual(3);
    expect(orbit.fretCollisions.length).toBeLessThanOrEqual(
      BALL_ORBIT_PROFILE.maxFretCollisions,
    );

    for (
      let index = 0;
      index < orbit.fretCollisions.length;
      index += 1
    ) {
      const collision =
        orbit.fretCollisions[index];

      expect(collision.separatorIndex).toBeGreaterThanOrEqual(0);
      expect(collision.separatorIndex).toBeLessThan(
        SEGMENT_COUNT,
      );
      expect(
        Math.abs(
          collision.relativeAngularVelocityAfter,
        ),
      ).toBeLessThan(
        Math.abs(
          collision.relativeAngularVelocityBefore,
        ),
      );

      if (index > 0) {
        expect(collision.timeMs).toBeGreaterThan(
          orbit.fretCollisions[index - 1].timeMs,
        );
        expect(
          collision.effectiveRestitution,
        ).toBeLessThan(
          orbit.fretCollisions[index - 1]
            .effectiveRestitution,
        );
        expect(collision.radialKick).toBeLessThan(
          orbit.fretCollisions[index - 1].radialKick,
        );
      }
    }
  });

  it("reports cumulative contacts as the ball rattles across the pocket separators", () => {
    const rotorSpin = createRotorSpin(0.37, 1);
    const orbit = createBallOrbit(-0.72, rotorSpin);
    const first = orbit.fretCollisions[0];
    const third = orbit.fretCollisions[2];

    const before = sampleBallOrbit(
      orbit,
      first.timeMs - 8,
    );
    const afterFirst = sampleBallOrbit(
      orbit,
      first.timeMs + 48,
    );
    const afterThird = sampleBallOrbit(
      orbit,
      third.timeMs + 48,
    );

    expect(before.fretCollisionCount).toBe(0);
    expect(afterFirst.fretCollisionCount).toBeGreaterThanOrEqual(1);
    expect(afterFirst.phase).toBe("fret");
    expect(afterThird.fretCollisionCount).toBeGreaterThanOrEqual(3);
    expect(afterThird.phase).toBe("fret");
    expect(afterThird.radiusRatio).toBeGreaterThanOrEqual(
      orbit.pocketEntryTargetRadius,
    );
  });

  it("keeps every bounce dissipative while allowing separator-to-separator travel", () => {
    const orbit = createBallOrbit(
      -0.72,
      createRotorSpin(0.37, 1),
    );

    const separatorSet = new Set(
      orbit.fretCollisions.map(
        (collision) =>
          collision.separatorIndex,
      ),
    );

    expect(separatorSet.size).toBeGreaterThan(1);

    for (const collision of orbit.fretCollisions) {
      expect(
        collision.effectiveRestitution,
      ).toBeGreaterThan(0);
      expect(
        collision.effectiveRestitution,
      ).toBeLessThan(1);
      expect(collision.radialKick).toBeGreaterThan(0);
    }
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
