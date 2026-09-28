import {
  BALL_TRACK_STYLE,
  DEFLECTOR_STYLE,
  WHEEL_GEOMETRY,
  getDeflectorAngle,
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
  collisionEnergyRetention: 0.86,
  collisionAngularKick: 1.05,
  collisionRadialKick: 0.052,
  collisionDampingPerSecond: 3.1,
  collisionVisualSeconds: 0.72,
} as const;

export type BallMotionPhase =
  | "track"
  | "descent"
  | "deflector"
  | "handoff";

export type DeflectorCollision = {
  timeMs: number;
  deflectorIndex: number;
  angle: number;
  radiusRatio: number;
  side: 1 | -1;
};

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
  collisionEnergyRetention: number;
  collisionAngularKick: number;
  collisionRadialKick: number;
  collisionDampingPerSecond: number;
  collisionVisualSeconds: number;
  descentStartMs: number;
  durationMs: number;
  collision: DeflectorCollision | null;
};

export type BallOrbitSample = {
  angle: number;
  radiusRatio: number;
  angularVelocity: number;
  radialVelocityRatioPerSecond: number;
  progress: number;
  phase: BallMotionPhase;
  collisionIndex: number | null;
  done: boolean;
};

type BaseBallSample = Omit<BallOrbitSample, "collisionIndex">;

function shortestAngleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function polarDistance(
  radiusA: number,
  angleA: number,
  radiusB: number,
  angleB: number,
) {
  const delta = shortestAngleDelta(angleA, angleB);
  return Math.sqrt(
    radiusA * radiusA +
      radiusB * radiusB -
      2 * radiusA * radiusB * Math.cos(delta),
  );
}

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

function sampleBaseBallOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
): BaseBallSample {
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

function findFirstDeflectorCollision(
  orbit: BallOrbit,
): DeflectorCollision | null {
  const stepMs = 8;
  const startMs = Math.max(0, Math.floor(orbit.descentStartMs));

  for (let elapsedMs = startMs; elapsedMs <= orbit.durationMs; elapsedMs += stepMs) {
    const sample = sampleBaseBallOrbit(orbit, elapsedMs);
    if (sample.phase !== "descent") continue;

    for (let index = 0; index < DEFLECTOR_STYLE.count; index += 1) {
      const deflectorAngle = getDeflectorAngle(index);
      const distance = polarDistance(
        sample.radiusRatio,
        sample.angle,
        DEFLECTOR_STYLE.radius,
        deflectorAngle,
      );

      if (distance > DEFLECTOR_STYLE.collisionRadius) continue;

      const delta = shortestAngleDelta(sample.angle, deflectorAngle);
      const side: 1 | -1 =
        Math.abs(delta) < 1e-6
          ? index % 2 === 0
            ? 1
            : -1
          : delta > 0
            ? 1
            : -1;

      return {
        timeMs: elapsedMs,
        deflectorIndex: index,
        angle: sample.angle,
        radiusRatio: sample.radiusRatio,
        side,
      };
    }
  }

  return null;
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
    collisionEnergyRetention,
    collisionAngularKick,
    collisionRadialKick,
    collisionDampingPerSecond,
    collisionVisualSeconds,
  } = BALL_ORBIT_PROFILE;

  const orbit: BallOrbit = {
    startAngle,
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
    trackRadius: BALL_TRACK_STYLE.pathRadius,
    descentStartAngularVelocity,
    descentTargetRadius,
    radialPullPerSecond,
    collisionEnergyRetention,
    collisionAngularKick,
    collisionRadialKick,
    collisionDampingPerSecond,
    collisionVisualSeconds,
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
    collision: null,
  };

  orbit.collision = findFirstDeflectorCollision(orbit);
  return orbit;
}

export function sampleBallOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
): BallOrbitSample {
  const base = sampleBaseBallOrbit(orbit, elapsedMs);
  const collision = orbit.collision;

  if (!collision || elapsedMs < collision.timeMs) {
    return {
      ...base,
      collisionIndex: null,
    };
  }

  const clampedElapsedMs = Math.min(
    Math.max(collision.timeMs, Number.isFinite(elapsedMs) ? elapsedMs : collision.timeMs),
    orbit.durationMs,
  );
  const collisionSeconds =
    (clampedElapsedMs - collision.timeMs) / 1000;
  const collisionDecay = Math.exp(
    -orbit.collisionDampingPerSecond * collisionSeconds,
  );
  const signedKick =
    collision.side * orbit.collisionAngularKick;
  const baseTravelAfterCollision = base.angle - collision.angle;

  let angle =
    collision.angle +
    baseTravelAfterCollision * orbit.collisionEnergyRetention +
    signedKick /
      orbit.collisionDampingPerSecond *
      (1 - collisionDecay);

  const signedBaseAngularVelocity =
    orbit.direction *
    base.angularVelocity *
    orbit.collisionEnergyRetention;
  const signedCollisionVelocity =
    signedKick * collisionDecay;
  let angularVelocity = Math.abs(
    signedBaseAngularVelocity + signedCollisionVelocity,
  );

  const radialBump =
    orbit.collisionRadialKick *
    collisionSeconds *
    collisionDecay;
  let radiusRatio = Math.min(
    orbit.trackRadius,
    Math.max(
      orbit.descentTargetRadius,
      base.radiusRatio + radialBump,
    ),
  );

  let radialVelocityRatioPerSecond =
    base.radialVelocityRatioPerSecond +
    orbit.collisionRadialKick *
      collisionDecay *
      (1 -
        orbit.collisionDampingPerSecond *
          collisionSeconds);

  let phase: BallMotionPhase =
    collisionSeconds <= orbit.collisionVisualSeconds
      ? "deflector"
      : base.phase;

  if (base.done) {
    radiusRatio = orbit.descentTargetRadius;
    radialVelocityRatioPerSecond = 0;
    angularVelocity = 0;
    phase = "handoff";
  }

  if (!Number.isFinite(angle)) angle = base.angle;

  return {
    angle,
    radiusRatio,
    angularVelocity,
    radialVelocityRatioPerSecond,
    progress: base.progress,
    phase,
    collisionIndex: collision.deflectorIndex,
    done: base.done,
  };
}

export function getBallOrbitRevolutions(orbit: BallOrbit) {
  const end = sampleBallOrbit(orbit, orbit.durationMs);
  return Math.abs(end.angle - orbit.startAngle) / TAU;
}
