import {
  BALL_STYLE,
  BALL_TRACK_STYLE,
  DEFLECTOR_STYLE,
  POCKET_RING_STYLE,
  SEGMENT_ANGLE,
  TOP_SEGMENT_CENTER,
  WHEEL_GEOMETRY,
  getDeflectorAngle,
} from "./config";
import {
  createRotorSpin,
  sampleRotorSpin,
  type RotorSpin,
} from "./spinMotion";

const TAU = Math.PI * 2;

export const BALL_ORBIT_PROFILE = {
  initialAngle: -0.72,
  initialAngularVelocity: 18,
  dragPerSecond: 0.22,
  stopAngularVelocity: 2.4,
  direction: -1 as const,

  descentStartAngularVelocity: 9,
  transitionRadius: WHEEL_GEOMETRY.numberOuterRadius - 0.037,
  radialPullPerSecond: 0.82,

  pocketEntryAngularVelocity: 5.5,
  pocketEntryTargetRadius: WHEEL_GEOMETRY.pocketOuterRadius - 0.047,
  pocketPullPerSecond: 1.1,

  deflectorEnergyRetention: 0.86,
  deflectorAngularKick: 1.05,
  deflectorRadialKick: 0.052,
  deflectorDampingPerSecond: 3.1,
  deflectorVisualSeconds: 0.72,

  fretRestitution: 0.42,
  fretTangentialPadding: 0.004,
  fretRadialKick: 0.045,
  fretDampingPerSecond: 4.2,
  fretVisualSeconds: 0.68,
} as const;

export type BallMotionPhase =
  | "track"
  | "descent"
  | "deflector"
  | "pocket-entry"
  | "fret"
  | "handoff";

export type DeflectorCollision = {
  timeMs: number;
  deflectorIndex: number;
  angle: number;
  radiusRatio: number;
  side: 1 | -1;
};

export type FretCollision = {
  timeMs: number;
  separatorIndex: number;
  angle: number;
  radiusRatio: number;
  rotorAngle: number;
  side: 1 | -1;
  relativeAngularVelocityBefore: number;
  signedAngularVelocityAfter: number;
};

export type BallOrbit = {
  startAngle: number;
  direction: 1 | -1;
  initialAngularVelocity: number;
  dragPerSecond: number;
  stopAngularVelocity: number;

  trackRadius: number;
  descentStartAngularVelocity: number;
  transitionRadius: number;
  radialPullPerSecond: number;

  pocketEntryAngularVelocity: number;
  pocketEntryTargetRadius: number;
  pocketPullPerSecond: number;

  deflectorEnergyRetention: number;
  deflectorAngularKick: number;
  deflectorRadialKick: number;
  deflectorDampingPerSecond: number;
  deflectorVisualSeconds: number;

  fretRestitution: number;
  fretTangentialPadding: number;
  fretRadialKick: number;
  fretDampingPerSecond: number;
  fretVisualSeconds: number;

  descentStartMs: number;
  pocketEntryStartMs: number;
  durationMs: number;

  rotorSpin: RotorSpin;
  deflectorCollision: DeflectorCollision | null;
  fretCollision: FretCollision | null;
};

export type BallOrbitSample = {
  angle: number;
  radiusRatio: number;
  angularVelocity: number;
  signedAngularVelocity: number;
  radialVelocityRatioPerSecond: number;
  progress: number;
  phase: BallMotionPhase;
  deflectorCollisionIndex: number | null;
  fretCollisionIndex: number | null;
  done: boolean;
};

type InternalBallSample = Omit<
  BallOrbitSample,
  "deflectorCollisionIndex" | "fretCollisionIndex"
>;

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

export function getBallSpeedThresholdMs(
  initialAngularVelocity: number,
  dragPerSecond: number,
  thresholdAngularVelocity: number,
) {
  if (
    initialAngularVelocity <= 0 ||
    dragPerSecond <= 0 ||
    thresholdAngularVelocity <= 0 ||
    thresholdAngularVelocity >= initialAngularVelocity
  ) {
    return 0;
  }

  return (
    Math.log(initialAngularVelocity / thresholdAngularVelocity) /
    dragPerSecond *
    1000
  );
}

export const getBallDescentStartMs = getBallSpeedThresholdMs;

function sampleBaseBallOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
): InternalBallSample {
  const clampedElapsedMs = Math.min(
    Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0),
    orbit.durationMs,
  );
  const elapsedSeconds = clampedElapsedMs / 1000;
  const decay = Math.exp(-orbit.dragPerSecond * elapsedSeconds);
  const angularVelocity = orbit.initialAngularVelocity * decay;
  const signedAngularVelocity =
    orbit.direction * angularVelocity;

  const angularTravel =
    orbit.dragPerSecond > 0
      ? orbit.initialAngularVelocity /
        orbit.dragPerSecond *
        (1 - decay)
      : 0;

  const angle =
    orbit.startAngle +
    orbit.direction * angularTravel;

  const done = clampedElapsedMs >= orbit.durationMs;

  let radiusRatio = orbit.trackRadius;
  let radialVelocityRatioPerSecond = 0;
  let phase: BallMotionPhase = "track";

  const descentElapsedSeconds = Math.max(
    0,
    (clampedElapsedMs - orbit.descentStartMs) / 1000,
  );

  if (descentElapsedSeconds > 0) {
    const radialDecay = Math.exp(
      -orbit.radialPullPerSecond * descentElapsedSeconds,
    );
    const radialRange =
      orbit.trackRadius - orbit.transitionRadius;

    radiusRatio =
      orbit.transitionRadius +
      radialRange * radialDecay;
    radialVelocityRatioPerSecond =
      -radialRange *
      orbit.radialPullPerSecond *
      radialDecay;
    phase = "descent";
  }

  if (clampedElapsedMs > orbit.pocketEntryStartMs) {
    const firstStageSeconds =
      Math.max(
        0,
        (orbit.pocketEntryStartMs - orbit.descentStartMs) /
          1000,
      );
    const firstStageDecay = Math.exp(
      -orbit.radialPullPerSecond * firstStageSeconds,
    );
    const pocketEntryStartRadius =
      orbit.transitionRadius +
      (orbit.trackRadius - orbit.transitionRadius) *
        firstStageDecay;

    const pocketElapsedSeconds =
      (clampedElapsedMs - orbit.pocketEntryStartMs) / 1000;
    const pocketDecay = Math.exp(
      -orbit.pocketPullPerSecond * pocketElapsedSeconds,
    );
    const pocketRange =
      pocketEntryStartRadius -
      orbit.pocketEntryTargetRadius;

    radiusRatio =
      orbit.pocketEntryTargetRadius +
      pocketRange * pocketDecay;
    radialVelocityRatioPerSecond =
      -pocketRange *
      orbit.pocketPullPerSecond *
      pocketDecay;
    phase = "pocket-entry";
  }

  if (done) {
    radiusRatio = orbit.pocketEntryTargetRadius;
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
    signedAngularVelocity: done
      ? 0
      : signedAngularVelocity,
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
  const startMs = Math.max(
    0,
    Math.floor(orbit.descentStartMs),
  );

  for (
    let elapsedMs = startMs;
    elapsedMs <= orbit.pocketEntryStartMs;
    elapsedMs += stepMs
  ) {
    const sample = sampleBaseBallOrbit(orbit, elapsedMs);
    if (sample.phase !== "descent") continue;

    for (
      let index = 0;
      index < DEFLECTOR_STYLE.count;
      index += 1
    ) {
      const deflectorAngle = getDeflectorAngle(index);
      const distance = polarDistance(
        sample.radiusRatio,
        sample.angle,
        DEFLECTOR_STYLE.radius,
        deflectorAngle,
      );

      if (
        distance >
        DEFLECTOR_STYLE.collisionRadius
      ) {
        continue;
      }

      const delta = shortestAngleDelta(
        sample.angle,
        deflectorAngle,
      );
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

function applyDeflectorResponse(
  orbit: BallOrbit,
  base: InternalBallSample,
  elapsedMs: number,
): InternalBallSample {
  const collision = orbit.deflectorCollision;

  if (
    !collision ||
    elapsedMs < collision.timeMs
  ) {
    return base;
  }

  const clampedElapsedMs = Math.min(
    Math.max(
      collision.timeMs,
      Number.isFinite(elapsedMs)
        ? elapsedMs
        : collision.timeMs,
    ),
    orbit.durationMs,
  );

  const collisionSeconds =
    (clampedElapsedMs - collision.timeMs) / 1000;
  const collisionDecay = Math.exp(
    -orbit.deflectorDampingPerSecond *
      collisionSeconds,
  );
  const signedKick =
    collision.side *
    orbit.deflectorAngularKick;

  const baseAtImpact = sampleBaseBallOrbit(
    orbit,
    collision.timeMs,
  );
  const signedVelocityAtImpact =
    baseAtImpact.signedAngularVelocity;
  const signedVelocityAfterImpact =
    signedVelocityAtImpact *
      orbit.deflectorEnergyRetention +
    signedKick;

  const deltaVelocity =
    signedVelocityAfterImpact -
    signedVelocityAtImpact;

  let angle =
    base.angle +
    deltaVelocity /
      orbit.deflectorDampingPerSecond *
      (1 - collisionDecay);

  let signedAngularVelocity =
    base.signedAngularVelocity +
    deltaVelocity * collisionDecay;

  const radialBump =
    orbit.deflectorRadialKick *
    collisionSeconds *
    collisionDecay;

  let radiusRatio = Math.min(
    orbit.trackRadius,
    Math.max(
      orbit.pocketEntryTargetRadius,
      base.radiusRatio + radialBump,
    ),
  );

  let radialVelocityRatioPerSecond =
    base.radialVelocityRatioPerSecond +
    orbit.deflectorRadialKick *
      collisionDecay *
      (1 -
        orbit.deflectorDampingPerSecond *
          collisionSeconds);

  let phase: BallMotionPhase =
    collisionSeconds <=
    orbit.deflectorVisualSeconds
      ? "deflector"
      : base.phase;

  if (base.done) {
    radiusRatio = orbit.pocketEntryTargetRadius;
    radialVelocityRatioPerSecond = 0;
    signedAngularVelocity = 0;
    phase = "handoff";
  }

  if (!Number.isFinite(angle)) angle = base.angle;

  return {
    ...base,
    angle,
    radiusRatio,
    angularVelocity: Math.abs(
      signedAngularVelocity,
    ),
    signedAngularVelocity,
    radialVelocityRatioPerSecond,
    phase,
  };
}

function findFirstFretCollision(
  orbit: BallOrbit,
): FretCollision | null {
  const stepMs = 4;
  const outerContactRadius =
    WHEEL_GEOMETRY.pocketOuterRadius +
    BALL_STYLE.radius;
  const innerContactRadius =
    Math.max(
      WHEEL_GEOMETRY.pocketInnerRadius,
      orbit.pocketEntryTargetRadius -
        BALL_STYLE.radius,
    );
  const tangentialTolerance =
    BALL_STYLE.radius +
    POCKET_RING_STYLE.separatorWidth / 2 +
    orbit.fretTangentialPadding;

  for (
    let elapsedMs = Math.floor(
      orbit.pocketEntryStartMs,
    );
    elapsedMs <= orbit.durationMs;
    elapsedMs += stepMs
  ) {
    const base = sampleBaseBallOrbit(
      orbit,
      elapsedMs,
    );
    const ball = applyDeflectorResponse(
      orbit,
      base,
      elapsedMs,
    );

    if (
      ball.radiusRatio > outerContactRadius ||
      ball.radiusRatio < innerContactRadius
    ) {
      continue;
    }

    const rotor = sampleRotorSpin(
      orbit.rotorSpin,
      elapsedMs,
    );

    for (
      let separatorIndex = 0;
      separatorIndex <
      37;
      separatorIndex += 1
    ) {
      const separatorRelativeAngle =
        TOP_SEGMENT_CENTER -
        SEGMENT_ANGLE / 2 +
        separatorIndex * SEGMENT_ANGLE;
      const separatorWorldAngle =
        rotor.angle +
        separatorRelativeAngle;

      const delta = shortestAngleDelta(
        ball.angle,
        separatorWorldAngle,
      );
      const tangentialDistance =
        Math.abs(delta) *
        ball.radiusRatio;

      if (
        tangentialDistance >
        tangentialTolerance
      ) {
        continue;
      }

      const relativeAngularVelocityBefore =
        ball.signedAngularVelocity -
        rotor.angularVelocity;
      const relativeAngularVelocityAfter =
        -relativeAngularVelocityBefore *
        orbit.fretRestitution;
      const signedAngularVelocityAfter =
        rotor.angularVelocity +
        relativeAngularVelocityAfter;

      const side: 1 | -1 =
        delta >= 0 ? 1 : -1;

      return {
        timeMs: elapsedMs,
        separatorIndex,
        angle: ball.angle,
        radiusRatio: ball.radiusRatio,
        rotorAngle: rotor.angle,
        side,
        relativeAngularVelocityBefore,
        signedAngularVelocityAfter,
      };
    }
  }

  return null;
}

function applyFretResponse(
  orbit: BallOrbit,
  base: InternalBallSample,
  elapsedMs: number,
): InternalBallSample {
  const collision = orbit.fretCollision;

  if (
    !collision ||
    elapsedMs < collision.timeMs
  ) {
    return base;
  }

  const clampedElapsedMs = Math.min(
    Math.max(
      collision.timeMs,
      Number.isFinite(elapsedMs)
        ? elapsedMs
        : collision.timeMs,
    ),
    orbit.durationMs,
  );
  const collisionSeconds =
    (clampedElapsedMs - collision.timeMs) / 1000;
  const collisionDecay = Math.exp(
    -orbit.fretDampingPerSecond *
      collisionSeconds,
  );

  const baseAtImpact = applyDeflectorResponse(
    orbit,
    sampleBaseBallOrbit(
      orbit,
      collision.timeMs,
    ),
    collision.timeMs,
  );

  const deltaVelocity =
    collision.signedAngularVelocityAfter -
    baseAtImpact.signedAngularVelocity;

  let angle =
    base.angle +
    deltaVelocity /
      orbit.fretDampingPerSecond *
      (1 - collisionDecay);

  let signedAngularVelocity =
    base.signedAngularVelocity +
    deltaVelocity * collisionDecay;

  const radialBump =
    orbit.fretRadialKick *
    collisionSeconds *
    collisionDecay;

  let radiusRatio = Math.min(
    WHEEL_GEOMETRY.pocketOuterRadius +
      BALL_STYLE.radius,
    Math.max(
      orbit.pocketEntryTargetRadius,
      base.radiusRatio + radialBump,
    ),
  );

  let radialVelocityRatioPerSecond =
    base.radialVelocityRatioPerSecond +
    orbit.fretRadialKick *
      collisionDecay *
      (1 -
        orbit.fretDampingPerSecond *
          collisionSeconds);

  let phase: BallMotionPhase =
    collisionSeconds <=
    orbit.fretVisualSeconds
      ? "fret"
      : base.phase;

  if (base.done) {
    radiusRatio = orbit.pocketEntryTargetRadius;
    radialVelocityRatioPerSecond = 0;
    signedAngularVelocity = 0;
    phase = "handoff";
  }

  if (!Number.isFinite(angle)) angle = base.angle;

  return {
    ...base,
    angle,
    radiusRatio,
    angularVelocity: Math.abs(
      signedAngularVelocity,
    ),
    signedAngularVelocity,
    radialVelocityRatioPerSecond,
    phase,
  };
}

export function createBallOrbit(
  startAngle = BALL_ORBIT_PROFILE.initialAngle,
  rotorSpin: RotorSpin = createRotorSpin(0, 1),
): BallOrbit {
  const {
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,
    descentStartAngularVelocity,
    transitionRadius,
    radialPullPerSecond,
    pocketEntryAngularVelocity,
    pocketEntryTargetRadius,
    pocketPullPerSecond,
    deflectorEnergyRetention,
    deflectorAngularKick,
    deflectorRadialKick,
    deflectorDampingPerSecond,
    deflectorVisualSeconds,
    fretRestitution,
    fretTangentialPadding,
    fretRadialKick,
    fretDampingPerSecond,
    fretVisualSeconds,
  } = BALL_ORBIT_PROFILE;

  const orbit: BallOrbit = {
    startAngle,
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,

    trackRadius: BALL_TRACK_STYLE.pathRadius,
    descentStartAngularVelocity,
    transitionRadius,
    radialPullPerSecond,

    pocketEntryAngularVelocity,
    pocketEntryTargetRadius,
    pocketPullPerSecond,

    deflectorEnergyRetention,
    deflectorAngularKick,
    deflectorRadialKick,
    deflectorDampingPerSecond,
    deflectorVisualSeconds,

    fretRestitution,
    fretTangentialPadding,
    fretRadialKick,
    fretDampingPerSecond,
    fretVisualSeconds,

    descentStartMs: getBallSpeedThresholdMs(
      initialAngularVelocity,
      dragPerSecond,
      descentStartAngularVelocity,
    ),
    pocketEntryStartMs: getBallSpeedThresholdMs(
      initialAngularVelocity,
      dragPerSecond,
      pocketEntryAngularVelocity,
    ),
    durationMs: getBallOrbitDurationMs(
      initialAngularVelocity,
      dragPerSecond,
      stopAngularVelocity,
    ),

    rotorSpin,
    deflectorCollision: null,
    fretCollision: null,
  };

  orbit.deflectorCollision =
    findFirstDeflectorCollision(orbit);
  orbit.fretCollision =
    findFirstFretCollision(orbit);

  return orbit;
}

export function sampleBallOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
): BallOrbitSample {
  const base = sampleBaseBallOrbit(
    orbit,
    elapsedMs,
  );
  const afterDeflector =
    applyDeflectorResponse(
      orbit,
      base,
      elapsedMs,
    );
  const afterFret =
    applyFretResponse(
      orbit,
      afterDeflector,
      elapsedMs,
    );

  return {
    ...afterFret,
    deflectorCollisionIndex:
      orbit.deflectorCollision &&
      elapsedMs >=
        orbit.deflectorCollision.timeMs
        ? orbit.deflectorCollision
            .deflectorIndex
        : null,
    fretCollisionIndex:
      orbit.fretCollision &&
      elapsedMs >=
        orbit.fretCollision.timeMs
        ? orbit.fretCollision.separatorIndex
        : null,
  };
}

export function getBallOrbitRevolutions(
  orbit: BallOrbit,
) {
  const end = sampleBallOrbit(
    orbit,
    orbit.durationMs,
  );
  return (
    Math.abs(
      end.angle - orbit.startAngle,
    ) / TAU
  );
}
