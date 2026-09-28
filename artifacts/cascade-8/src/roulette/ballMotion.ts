import {
  BALL_TRACK_STYLE,
  WHEEL_GEOMETRY,
} from "./config";

const TAU = Math.PI * 2;

export const BALL_ORBIT_PROFILE = {
  initialAngle: -0.72,
  initialAngularVelocity: 18,
  dragPerSecond: 0.22,
  stopAngularVelocity: 2.4,
  direction: -1 as const,
  descentStartAngularVelocity: 9,
  descentTargetRadius: WHEEL_GEOMETRY.numberOuterRadius - 0.037,
  radialPullPerSecond: 0.82,
} as const;

export type BallMotionPhase = "track" | "descent" | "handoff";

export type BallOrbit = {
  startAngle: number;
  direction: 1 | -1;
  initialAngularVelocity: number;
  dragPerSecond: number;
  stopAngularVelocity: number;
  trackRadius: number;
  descentStartAngularVelocity: number;
  descentTargetRadius: number;
  radialPullPerSecond: number;
  descentStartMs: number;
  durationMs: number;
};

export type BallOrbitSample = {
  angle: number;
  radiusRatio: number;
  angularVelocity: number;
  radialVelocityRatioPerSecond: number;
  progress: number;
  phase: BallMotionPhase;
  done: boolean;
};

export function getBallOrbitDurationMs(
  initialAngularVelocity: number,
  dragPerSecond: number,
  stopAngularVelocity: number,
) {
  if (
    initialAngularVelocity <= 0 ||
    dragPerSecond <= 0 ||
    stopAngularVelocity <= 0 ||
    stopAngularVelocity >= initialAngularVelocity
  ) {
    return 0;
  }

  return (
    Math.log(initialAngularVelocity / stopAngularVelocity) /
    dragPerSecond *
    1000
  );
}

export function getBallDescentStartMs(
  initialAngularVelocity: number,
  dragPerSecond: number,
  descentStartAngularVelocity: number,
) {
  if (
    initialAngularVelocity <= 0 ||
    dragPerSecond <= 0 ||
    descentStartAngularVelocity <= 0 ||
    descentStartAngularVelocity >= initialAngularVelocity
  ) {
    return 0;
  }

  return (
    Math.log(initialAngularVelocity / descentStartAngularVelocity) /
    dragPerSecond *
    1000
  );
}

export function createBallOrbit(
  startAngle = BALL_ORBIT_PROFILE.initialAngle,
): BallOrbit {
  const {
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
    descentStartAngularVelocity,
    descentTargetRadius,
    radialPullPerSecond,
  } = BALL_ORBIT_PROFILE;

  return {
    startAngle,
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
    trackRadius: BALL_TRACK_STYLE.pathRadius,
    descentStartAngularVelocity,
    descentTargetRadius,
    radialPullPerSecond,
    descentStartMs: getBallDescentStartMs(
      initialAngularVelocity,
      dragPerSecond,
      descentStartAngularVelocity,
    ),
    durationMs: getBallOrbitDurationMs(
      initialAngularVelocity,
      dragPerSecond,
      stopAngularVelocity,
    ),
  };
}

export function sampleBallOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
): BallOrbitSample {
  const clampedElapsedMs = Math.min(
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0),
    orbit.durationMs,
  );
  const elapsedSeconds = clampedElapsedMs / 1000;
  const decay = Math.exp(-orbit.dragPerSecond * elapsedSeconds);
  const angularVelocity = orbit.initialAngularVelocity * decay;

  const angularTravel =
    orbit.dragPerSecond > 0
      ? orbit.initialAngularVelocity / orbit.dragPerSecond * (1 - decay)
      : 0;

  const angle =
    orbit.startAngle +
    orbit.direction * angularTravel;

  const done = clampedElapsedMs >= orbit.durationMs;
  const descentElapsedSeconds = Math.max(
    0,
    (clampedElapsedMs - orbit.descentStartMs) / 1000,
  );

  let radiusRatio = orbit.trackRadius;
  let radialVelocityRatioPerSecond = 0;
  let phase: BallMotionPhase = "track";

  if (descentElapsedSeconds > 0) {
    const radialDecay = Math.exp(
      -orbit.radialPullPerSecond * descentElapsedSeconds,
    );
    const radialRange = orbit.trackRadius - orbit.descentTargetRadius;

    radiusRatio =
      orbit.descentTargetRadius +
      radialRange * radialDecay;
    radialVelocityRatioPerSecond =
      -radialRange *
      orbit.radialPullPerSecond *
      radialDecay;
    phase = "descent";
  }

  if (done) {
    radiusRatio = orbit.descentTargetRadius;
    radialVelocityRatioPerSecond = 0;
    phase = "handoff";
  }

  const progress =
    orbit.durationMs > 0
      ? Math.min(1, clampedElapsedMs / orbit.durationMs)
      : 1;

  return {
    angle,
    radiusRatio,
    angularVelocity: done ? 0 : angularVelocity,
    radialVelocityRatioPerSecond,
    progress,
    phase,
    done,
  };
}

export function getBallOrbitRevolutions(orbit: BallOrbit) {
  const end = sampleBallOrbit(orbit, orbit.durationMs);
  return Math.abs(end.angle - orbit.startAngle) / TAU;
}
