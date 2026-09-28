const TAU = Math.PI * 2;

export const BALL_ORBIT_PROFILE = {
  initialAngle: -0.72,
  initialAngularVelocity: 18,
  dragPerSecond: 0.22,
  stopAngularVelocity: 2.4,
  direction: -1 as const,
} as const;

export type BallOrbit = {
  startAngle: number;
  direction: 1 | -1;
  initialAngularVelocity: number;
  dragPerSecond: number;
  stopAngularVelocity: number;
  durationMs: number;
};

export type BallOrbitSample = {
  angle: number;
  angularVelocity: number;
  progress: number;
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

export function createBallOrbit(
  startAngle = BALL_ORBIT_PROFILE.initialAngle,
): BallOrbit {
  const {
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
  } = BALL_ORBIT_PROFILE;

  return {
    startAngle,
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
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
  const progress =
    orbit.durationMs > 0
      ? Math.min(1, clampedElapsedMs / orbit.durationMs)
      : 1;

  return {
    angle,
    angularVelocity: done ? 0 : angularVelocity,
    progress,
    done,
  };
}

export function getBallOrbitRevolutions(orbit: BallOrbit) {
  const end = sampleBallOrbit(orbit, orbit.durationMs);
  return Math.abs(end.angle - orbit.startAngle) / TAU;
}
