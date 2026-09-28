import { describe, expect, it } from "vitest";
import {
  BALL_ORBIT_PROFILE,
  createBallOrbit,
  getBallOrbitDurationMs,
  getBallOrbitRevolutions,
  getBallSpeedThresholdMs,
  sampleBallOrbit,
} from "./ballMotion";
import {
  BALL_TRACK_STYLE,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  TOP_SEGMENT_CENTER,
  WHEEL_GEOMETRY,
} from "./config";
import {
  createRotorSpin,
  sampleRotorSpin,
} from "./spinMotion";

function shortestAngleDelta(a: number, b: number) {
  return Math.atan2(
    Math.sin(a - b),
    Math.cos(a - b),
  );
}

describe("roulette pocket capture and settle", () => {
  it("preserves the track, descent and pocket-entry speed thresholds", () => {
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
    expect(orbit.freeMotionDurationMs).toBeGreaterThan(8500);
    expect(orbit.freeMotionDurationMs).toBeLessThan(10000);
    expect(orbit.durationMs).toBeGreaterThanOrEqual(
      orbit.freeMotionDurationMs,
    );
    expect(getBallOrbitRevolutions(orbit)).toBeGreaterThan(4);
  });

  it("keeps the repeated fret chain dissipative before capture", () => {
    const orbit = createBallOrbit(
      -0.72,
      createRotorSpin(0.37, 1),
    );

    expect(
      orbit.fretCollisions.length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      orbit.fretCollisions.length,
    ).toBeLessThanOrEqual(
      BALL_ORBIT_PROFILE.maxFretCollisions,
    );

    for (
      let index = 1;
      index <
      orbit.fretCollisions.length;
      index += 1
    ) {
      expect(
        orbit.fretCollisions[
          index
        ].effectiveRestitution,
      ).toBeLessThan(
        orbit.fretCollisions[
          index - 1
        ].effectiveRestitution,
      );
      expect(
        orbit.fretCollisions[
          index
        ].radialKick,
      ).toBeLessThan(
        orbit.fretCollisions[
          index - 1
        ].radialKick,
      );
    }
  });

  it("captures only from the ball's low-energy rotor-relative geometry", () => {
    const rotorSpin =
      createRotorSpin(0.37, 1);
    const orbit =
      createBallOrbit(
        -0.72,
        rotorSpin,
      );
    const capture =
      orbit.pocketCapture;

    expect(capture).not.toBeNull();
    expect(
      capture!.pocketIndex,
    ).toBeGreaterThanOrEqual(0);
    expect(
      capture!.pocketIndex,
    ).toBeLessThan(
      SEGMENT_COUNT,
    );
    expect(capture!.timeMs).toBeGreaterThan(
      orbit.pocketEntryStartMs,
    );
    expect(capture!.timeMs).toBeLessThan(
      orbit.freeMotionDurationMs,
    );

    const fretCountAtCapture =
      orbit.fretCollisions.filter(
        (collision) =>
          collision.timeMs <=
          capture!.timeMs,
      ).length;
    expect(
      fretCountAtCapture,
    ).toBeGreaterThanOrEqual(
      orbit.captureMinFretCollisions,
    );
    expect(
      Math.abs(
        capture!
          .initialRelativeAngularVelocity,
      ),
    ).toBeLessThanOrEqual(
      orbit.captureRelativeAngularVelocity,
    );
    expect(
      Math.abs(
        capture!
          .initialRadialVelocity,
      ),
    ).toBeLessThanOrEqual(
      orbit.captureRadialVelocity,
    );
  });

  it("critically damps into the captured rotating pocket instead of snapping", () => {
    const orbit =
      createBallOrbit(
        -0.72,
        createRotorSpin(0.37, 1),
      );
    const capture =
      orbit.pocketCapture!;

    const before =
      sampleBallOrbit(
        orbit,
        capture.timeMs - 4,
      );
    const during =
      sampleBallOrbit(
        orbit,
        capture.timeMs + 120,
      );
    const settled =
      sampleBallOrbit(
        orbit,
        capture.settleTimeMs + 8,
      );

    expect(
      before.pocketCaptureIndex,
    ).toBeNull();
    expect(during.phase).toBe("capture");
    expect(
      during.pocketCaptureIndex,
    ).toBe(
      capture.pocketIndex,
    );
    expect(
      Math.abs(
        during.radiusRatio -
        orbit.pocketSettleRadius,
      ),
    ).toBeGreaterThan(0);

    expect(settled.phase).toBe("settled");
    expect(settled.settled).toBe(true);
    expect(
      settled.radiusRatio,
    ).toBeCloseTo(
      orbit.pocketSettleRadius,
      6,
    );
  });

  it("remains locked to that pocket as the rotor finishes", () => {
    const orbit =
      createBallOrbit(
        -0.72,
        createRotorSpin(0.37, 1),
      );
    const capture =
      orbit.pocketCapture!;
    const end =
      sampleBallOrbit(
        orbit,
        orbit.durationMs,
      );
    const rotorEnd =
      sampleRotorSpin(
        orbit.rotorSpin,
        orbit.durationMs,
      );

    const expectedCenter =
      rotorEnd.angle +
      TOP_SEGMENT_CENTER +
      capture.pocketIndex *
        SEGMENT_ANGLE;

    expect(end.phase).toBe("settled");
    expect(end.done).toBe(true);
    expect(end.settled).toBe(true);
    expect(
      end.pocketCaptureIndex,
    ).toBe(
      capture.pocketIndex,
    );
    expect(
      shortestAngleDelta(
        end.angle,
        expectedCenter,
      ),
    ).toBeCloseTo(0, 6);
    expect(
      end.radiusRatio,
    ).toBeCloseTo(
      orbit.pocketSettleRadius,
      6,
    );
  });

  it("settles fully inside the green pocket annulus", () => {
    const orbit = createBallOrbit();

    expect(
      orbit.pocketSettleRadius,
    ).toBeGreaterThan(
      WHEEL_GEOMETRY.pocketInnerRadius,
    );
    expect(
      orbit.pocketSettleRadius,
    ).toBeLessThan(
      WHEEL_GEOMETRY.pocketOuterRadius,
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

  it("does not expose target-number or target-pocket steering inputs", () => {
    expect(
      "targetNumber" in
        BALL_ORBIT_PROFILE,
    ).toBe(false);
    expect(
      "targetPocket" in
        BALL_ORBIT_PROFILE,
    ).toBe(false);
  });
});
