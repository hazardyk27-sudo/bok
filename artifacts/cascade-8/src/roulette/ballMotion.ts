import {
  BALL_STYLE,
  BALL_TRACK_STYLE,
  DEFLECTOR_STYLE,
  POCKET_RING_STYLE,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
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
  fretRestitutionDecay: 0.82,
  fretTangentialPadding: 0.004,
  fretRadialKick: 0.045,
  fretRadialKickDecay: 0.8,
  fretDampingPerSecond: 4.2,
  fretVisualSeconds: 0.68,
  fretCollisionCooldownMs: 90,
  maxFretCollisions: 8,

  captureMinFretCollisions: 4,
  captureRelativeAngularVelocity: 0.75,
  captureRadialVelocity: 0.035,
  captureAngularMargin: 0.002,
  pocketSettleRadius:
    WHEEL_GEOMETRY.pocketInnerRadius +
    (WHEEL_GEOMETRY.pocketOuterRadius -
      WHEEL_GEOMETRY.pocketInnerRadius) *
      0.54,
  captureAngularSpring: 5.2,
  captureRadialSpring: 4.2,
  settleAngularOffset: 0.004,
  settleRelativeAngularVelocity: 0.05,
  settleRadialOffset: 0.004,
  settleRadialVelocity: 0.01,
} as const;

export type BallMotionPhase =
  | "track"
  | "descent"
  | "deflector"
  | "pocket-entry"
  | "fret"
  | "capture"
  | "settled"
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
  relativeAngularVelocityAfter: number;
  signedAngularVelocityAfter: number;
  effectiveRestitution: number;
  radialKick: number;
};

export type PocketCapture = {
  timeMs: number;
  pocketIndex: number;
  pocketCenterRelativeAngle: number;
  initialAngularOffset: number;
  initialRelativeAngularVelocity: number;
  initialRadiusOffset: number;
  initialRadialVelocity: number;
  settleTimeMs: number;
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
  fretRestitutionDecay: number;
  fretTangentialPadding: number;
  fretRadialKick: number;
  fretRadialKickDecay: number;
  fretDampingPerSecond: number;
  fretVisualSeconds: number;
  fretCollisionCooldownMs: number;
  maxFretCollisions: number;

  captureMinFretCollisions: number;
  captureRelativeAngularVelocity: number;
  captureRadialVelocity: number;
  captureAngularMargin: number;
  pocketSettleRadius: number;
  captureAngularSpring: number;
  captureRadialSpring: number;
  settleAngularOffset: number;
  settleRelativeAngularVelocity: number;
  settleRadialOffset: number;
  settleRadialVelocity: number;

  descentStartMs: number;
  pocketEntryStartMs: number;
  freeMotionDurationMs: number;
  durationMs: number;

  rotorSpin: RotorSpin;
  deflectorCollision: DeflectorCollision | null;
  fretCollisions: FretCollision[];
  pocketCapture: PocketCapture | null;
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
  fretCollisionCount: number;
  pocketCaptureIndex: number | null;
  settled: boolean;
  done: boolean;
};

type InternalBallSample = Omit<
  BallOrbitSample,
  | "deflectorCollisionIndex"
  | "fretCollisionIndex"
  | "fretCollisionCount"
  | "pocketCaptureIndex"
  | "settled"
>;

function shortestAngleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function normalizeIndex(index: number) {
  return (
    (index % SEGMENT_COUNT) +
    SEGMENT_COUNT
  ) % SEGMENT_COUNT;
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

function sampleCriticalDamping(
  displacement: number,
  velocity: number,
  spring: number,
  elapsedSeconds: number,
) {
  if (elapsedSeconds <= 0) {
    return {
      displacement,
      velocity,
    };
  }

  const coefficient =
    velocity + spring * displacement;
  const decay = Math.exp(
    -spring * elapsedSeconds,
  );

  return {
    displacement:
      (
        displacement +
        coefficient * elapsedSeconds
      ) * decay,
    velocity:
      (
        velocity -
        spring *
          coefficient *
          elapsedSeconds
      ) * decay,
  };
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
    orbit.freeMotionDurationMs,
  );
  const elapsedSeconds = clampedElapsedMs / 1000;
  const decay = Math.exp(-orbit.dragPerSecond * elapsedSeconds);
  const angularVelocity =
    orbit.initialAngularVelocity * decay;
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

  const freeMotionDone =
    clampedElapsedMs >=
    orbit.freeMotionDurationMs;

  let radiusRatio = orbit.trackRadius;
  let radialVelocityRatioPerSecond = 0;
  let phase: BallMotionPhase = "track";

  const descentElapsedSeconds = Math.max(
    0,
    (clampedElapsedMs - orbit.descentStartMs) / 1000,
  );

  if (descentElapsedSeconds > 0) {
    const radialDecay = Math.exp(
      -orbit.radialPullPerSecond *
        descentElapsedSeconds,
    );
    const radialRange =
      orbit.trackRadius -
      orbit.transitionRadius;

    radiusRatio =
      orbit.transitionRadius +
      radialRange * radialDecay;
    radialVelocityRatioPerSecond =
      -radialRange *
      orbit.radialPullPerSecond *
      radialDecay;
    phase = "descent";
  }

  if (
    clampedElapsedMs >
    orbit.pocketEntryStartMs
  ) {
    const firstStageSeconds = Math.max(
      0,
      (
        orbit.pocketEntryStartMs -
        orbit.descentStartMs
      ) / 1000,
    );
    const firstStageDecay = Math.exp(
      -orbit.radialPullPerSecond *
        firstStageSeconds,
    );
    const pocketEntryStartRadius =
      orbit.transitionRadius +
      (
        orbit.trackRadius -
        orbit.transitionRadius
      ) *
        firstStageDecay;

    const pocketElapsedSeconds =
      (
        clampedElapsedMs -
        orbit.pocketEntryStartMs
      ) / 1000;
    const pocketDecay = Math.exp(
      -orbit.pocketPullPerSecond *
        pocketElapsedSeconds,
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

  if (freeMotionDone) {
    radiusRatio =
      orbit.pocketEntryTargetRadius;
    radialVelocityRatioPerSecond = 0;
    phase = "handoff";
  }

  const progress =
    orbit.durationMs > 0
      ? Math.min(
          1,
          Math.max(0, elapsedMs) /
            orbit.durationMs,
        )
      : 1;

  return {
    angle,
    radiusRatio,
    angularVelocity:
      freeMotionDone ? 0 : angularVelocity,
    signedAngularVelocity:
      freeMotionDone
        ? 0
        : signedAngularVelocity,
    radialVelocityRatioPerSecond,
    progress,
    phase,
    done: elapsedMs >= orbit.durationMs,
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
    const sample =
      sampleBaseBallOrbit(
        orbit,
        elapsedMs,
      );
    if (sample.phase !== "descent") {
      continue;
    }

    for (
      let index = 0;
      index < DEFLECTOR_STYLE.count;
      index += 1
    ) {
      const deflectorAngle =
        getDeflectorAngle(index);
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
  const collision =
    orbit.deflectorCollision;

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
    orbit.freeMotionDurationMs,
  );

  const collisionSeconds =
    (
      clampedElapsedMs -
      collision.timeMs
    ) / 1000;
  const collisionDecay = Math.exp(
    -orbit.deflectorDampingPerSecond *
      collisionSeconds,
  );
  const signedKick =
    collision.side *
    orbit.deflectorAngularKick;

  const baseAtImpact =
    sampleBaseBallOrbit(
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
      (
        1 -
        orbit.deflectorDampingPerSecond *
          collisionSeconds
      );

  let phase: BallMotionPhase =
    collisionSeconds <=
    orbit.deflectorVisualSeconds
      ? "deflector"
      : base.phase;

  if (
    elapsedMs >=
    orbit.freeMotionDurationMs
  ) {
    radiusRatio =
      orbit.pocketEntryTargetRadius;
    radialVelocityRatioPerSecond = 0;
    signedAngularVelocity = 0;
    phase = "handoff";
  }

  if (!Number.isFinite(angle)) {
    angle = base.angle;
  }

  return {
    ...base,
    angle,
    radiusRatio,
    angularVelocity:
      Math.abs(
        signedAngularVelocity,
      ),
    signedAngularVelocity,
    radialVelocityRatioPerSecond,
    phase,
  };
}

function applyFretResponses(
  orbit: BallOrbit,
  base: InternalBallSample,
  elapsedMs: number,
  collisions: FretCollision[],
): InternalBallSample {
  let angle = base.angle;
  let radiusRatio = base.radiusRatio;
  let signedAngularVelocity =
    base.signedAngularVelocity;
  let radialVelocityRatioPerSecond =
    base.radialVelocityRatioPerSecond;
  let phase = base.phase;

  for (const collision of collisions) {
    if (
      elapsedMs <
      collision.timeMs
    ) {
      continue;
    }

    const clampedElapsedMs = Math.min(
      Math.max(
        collision.timeMs,
        Number.isFinite(elapsedMs)
          ? elapsedMs
          : collision.timeMs,
      ),
      orbit.freeMotionDurationMs,
    );
    const collisionSeconds =
      (
        clampedElapsedMs -
        collision.timeMs
      ) / 1000;
    const collisionDecay = Math.exp(
      -orbit.fretDampingPerSecond *
        collisionSeconds,
    );
    const rotorAtImpact =
      sampleRotorSpin(
        orbit.rotorSpin,
        collision.timeMs,
      );
    const rotorSignedVelocity =
      orbit.rotorSpin.direction *
      rotorAtImpact.angularVelocity;

    const signedVelocityBefore =
      collision
        .relativeAngularVelocityBefore +
      rotorSignedVelocity;
    const deltaVelocity =
      collision
        .signedAngularVelocityAfter -
      signedVelocityBefore;

    angle +=
      deltaVelocity /
      orbit.fretDampingPerSecond *
      (1 - collisionDecay);
    signedAngularVelocity +=
      deltaVelocity *
      collisionDecay;

    const radialBump =
      collision.radialKick *
      collisionSeconds *
      collisionDecay;

    radiusRatio = Math.min(
      WHEEL_GEOMETRY.pocketOuterRadius +
        BALL_STYLE.radius,
      Math.max(
        orbit.pocketEntryTargetRadius,
        radiusRatio + radialBump,
      ),
    );

    radialVelocityRatioPerSecond +=
      collision.radialKick *
      collisionDecay *
      (
        1 -
        orbit.fretDampingPerSecond *
          collisionSeconds
      );

    if (
      collisionSeconds <=
      orbit.fretVisualSeconds
    ) {
      phase = "fret";
    }
  }

  if (
    elapsedMs >=
    orbit.freeMotionDurationMs
  ) {
    radiusRatio =
      orbit.pocketEntryTargetRadius;
    radialVelocityRatioPerSecond = 0;
    signedAngularVelocity = 0;
    phase = "handoff";
  }

  if (!Number.isFinite(angle)) {
    angle = base.angle;
  }

  return {
    ...base,
    angle,
    radiusRatio,
    angularVelocity:
      Math.abs(
        signedAngularVelocity,
      ),
    signedAngularVelocity,
    radialVelocityRatioPerSecond,
    phase,
  };
}

function findOverlappingSeparator(
  orbit: BallOrbit,
  ball: InternalBallSample,
  elapsedMs: number,
) {
  const outerContactRadius =
    WHEEL_GEOMETRY.pocketOuterRadius +
    BALL_STYLE.radius;
  const innerContactRadius = Math.max(
    WHEEL_GEOMETRY.pocketInnerRadius,
    orbit.pocketEntryTargetRadius -
      BALL_STYLE.radius,
  );

  if (
    ball.radiusRatio >
      outerContactRadius ||
    ball.radiusRatio <
      innerContactRadius
  ) {
    return null;
  }

  const rotor =
    sampleRotorSpin(
      orbit.rotorSpin,
      elapsedMs,
    );
  const tangentialTolerance =
    BALL_STYLE.radius +
    POCKET_RING_STYLE.separatorWidth /
      2 +
    orbit.fretTangentialPadding;

  for (
    let separatorIndex = 0;
    separatorIndex <
    SEGMENT_COUNT;
    separatorIndex += 1
  ) {
    const separatorRelativeAngle =
      TOP_SEGMENT_CENTER -
      SEGMENT_ANGLE / 2 +
      separatorIndex *
        SEGMENT_ANGLE;
    const separatorWorldAngle =
      rotor.angle +
      separatorRelativeAngle;

    const delta =
      shortestAngleDelta(
        ball.angle,
        separatorWorldAngle,
      );
    const tangentialDistance =
      Math.abs(delta) *
      ball.radiusRatio;

    if (
      tangentialDistance <=
      tangentialTolerance
    ) {
      return {
        separatorIndex,
        delta,
        rotorAngle: rotor.angle,
        rotorSignedAngularVelocity:
          orbit.rotorSpin.direction *
          rotor.angularVelocity,
      };
    }
  }

  return null;
}

function findFretCollisions(
  orbit: BallOrbit,
): FretCollision[] {
  const collisions: FretCollision[] = [];
  const stepMs = 4;
  let previousOverlapIndex:
    | number
    | null = null;
  let lastCollisionMs =
    Number.NEGATIVE_INFINITY;

  for (
    let elapsedMs = Math.floor(
      orbit.pocketEntryStartMs,
    );
    elapsedMs <=
    orbit.freeMotionDurationMs;
    elapsedMs += stepMs
  ) {
    const base =
      sampleBaseBallOrbit(
        orbit,
        elapsedMs,
      );
    const afterDeflector =
      applyDeflectorResponse(
        orbit,
        base,
        elapsedMs,
      );
    const ball =
      applyFretResponses(
        orbit,
        afterDeflector,
        elapsedMs,
        collisions,
      );
    const overlap =
      findOverlappingSeparator(
        orbit,
        ball,
        elapsedMs,
      );

    if (!overlap) {
      previousOverlapIndex = null;
      continue;
    }

    const enteredNewContact =
      previousOverlapIndex !==
      overlap.separatorIndex;
    const cooldownComplete =
      elapsedMs -
        lastCollisionMs >=
      orbit.fretCollisionCooldownMs;

    previousOverlapIndex =
      overlap.separatorIndex;

    if (
      !enteredNewContact ||
      !cooldownComplete
    ) {
      continue;
    }

    const relativeAngularVelocityBefore =
      ball.signedAngularVelocity -
      overlap
        .rotorSignedAngularVelocity;

    if (
      Math.abs(
        relativeAngularVelocityBefore,
      ) < 0.05
    ) {
      continue;
    }

    const hitIndex =
      collisions.length;
    const effectiveRestitution =
      orbit.fretRestitution *
      Math.pow(
        orbit.fretRestitutionDecay,
        hitIndex,
      );
    const relativeAngularVelocityAfter =
      -relativeAngularVelocityBefore *
      effectiveRestitution;
    const signedAngularVelocityAfter =
      overlap
        .rotorSignedAngularVelocity +
      relativeAngularVelocityAfter;
    const radialKick =
      orbit.fretRadialKick *
      Math.pow(
        orbit.fretRadialKickDecay,
        hitIndex,
      );

    collisions.push({
      timeMs: elapsedMs,
      separatorIndex:
        overlap.separatorIndex,
      angle: ball.angle,
      radiusRatio:
        ball.radiusRatio,
      rotorAngle:
        overlap.rotorAngle,
      side:
        overlap.delta >= 0
          ? 1
          : -1,
      relativeAngularVelocityBefore,
      relativeAngularVelocityAfter,
      signedAngularVelocityAfter,
      effectiveRestitution,
      radialKick,
    });

    lastCollisionMs =
      elapsedMs;

    if (
      collisions.length >=
      orbit.maxFretCollisions
    ) {
      break;
    }
  }

  return collisions;
}

function getNearestPocket(
  orbit: BallOrbit,
  ball: InternalBallSample,
  elapsedMs: number,
) {
  const rotor =
    sampleRotorSpin(
      orbit.rotorSpin,
      elapsedMs,
    );
  const relativeAngle =
    ball.angle -
    rotor.angle;
  const rawIndex = Math.round(
    (
      relativeAngle -
      TOP_SEGMENT_CENTER
    ) / SEGMENT_ANGLE,
  );
  const pocketIndex =
    normalizeIndex(rawIndex);
  const pocketCenterRelativeAngle =
    TOP_SEGMENT_CENTER +
    pocketIndex * SEGMENT_ANGLE;
  const pocketCenterWorldAngle =
    rotor.angle +
    pocketCenterRelativeAngle;
  const angularOffset =
    shortestAngleDelta(
      ball.angle,
      pocketCenterWorldAngle,
    );
  const rotorSignedAngularVelocity =
    orbit.rotorSpin.direction *
    rotor.angularVelocity;

  return {
    pocketIndex,
    pocketCenterRelativeAngle,
    angularOffset,
    relativeAngularVelocity:
      ball.signedAngularVelocity -
      rotorSignedAngularVelocity,
  };
}

function samplePreCaptureOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
) {
  const base =
    sampleBaseBallOrbit(
      orbit,
      elapsedMs,
    );
  const afterDeflector =
    applyDeflectorResponse(
      orbit,
      base,
      elapsedMs,
    );

  return applyFretResponses(
    orbit,
    afterDeflector,
    elapsedMs,
    orbit.fretCollisions,
  );
}

function getCaptureAngularClearance(
  orbit: BallOrbit,
  radiusRatio: number,
) {
  if (radiusRatio <= 0) {
    return 0;
  }

  return Math.max(
    0,
    SEGMENT_ANGLE / 2 -
      BALL_STYLE.radius /
        radiusRatio -
      (
        POCKET_RING_STYLE
          .separatorWidth /
        2
      ) /
        radiusRatio -
      orbit.captureAngularMargin,
  );
}

function getPocketCaptureKinematics(
  orbit: BallOrbit,
  capture: PocketCapture,
  elapsedMs: number,
) {
  const elapsedSeconds = Math.max(
    0,
    (
      elapsedMs -
      capture.timeMs
    ) / 1000,
  );
  const angular =
    sampleCriticalDamping(
      capture.initialAngularOffset,
      capture
        .initialRelativeAngularVelocity,
      orbit.captureAngularSpring,
      elapsedSeconds,
    );
  const radial =
    sampleCriticalDamping(
      capture.initialRadiusOffset,
      capture
        .initialRadialVelocity,
      orbit.captureRadialSpring,
      elapsedSeconds,
    );

  return {
    angularOffset:
      angular.displacement,
    relativeAngularVelocity:
      angular.velocity,
    radialOffset:
      radial.displacement,
    radialVelocity:
      radial.velocity,
  };
}

function findCaptureSettleTimeMs(
  orbit: BallOrbit,
  capture: PocketCapture,
) {
  const maxSearchMs = Math.max(
    capture.timeMs,
    orbit.durationMs,
  );

  for (
    let elapsedMs =
      capture.timeMs;
    elapsedMs <= maxSearchMs;
    elapsedMs += 8
  ) {
    const kinematics =
      getPocketCaptureKinematics(
        orbit,
        capture,
        elapsedMs,
      );

    if (
      Math.abs(
        kinematics.angularOffset,
      ) <=
        orbit.settleAngularOffset &&
      Math.abs(
        kinematics
          .relativeAngularVelocity,
      ) <=
        orbit
          .settleRelativeAngularVelocity &&
      Math.abs(
        kinematics.radialOffset,
      ) <=
        orbit.settleRadialOffset &&
      Math.abs(
        kinematics.radialVelocity,
      ) <=
        orbit.settleRadialVelocity
    ) {
      return elapsedMs;
    }
  }

  return orbit.durationMs;
}

function findPocketCapture(
  orbit: BallOrbit,
): PocketCapture | null {
  const stepMs = 4;
  const outerCaptureRadius =
    WHEEL_GEOMETRY.pocketOuterRadius -
    BALL_STYLE.radius;
  const innerCaptureRadius =
    WHEEL_GEOMETRY.pocketInnerRadius +
    BALL_STYLE.radius;

  for (
    let elapsedMs = Math.floor(
      orbit.pocketEntryStartMs,
    );
    elapsedMs <=
    orbit.freeMotionDurationMs;
    elapsedMs += stepMs
  ) {
    const elapsedFretCount =
      orbit.fretCollisions.filter(
        (collision) =>
          collision.timeMs <=
          elapsedMs,
      ).length;

    if (
      elapsedFretCount <
      orbit.captureMinFretCollisions
    ) {
      continue;
    }

    const ball =
      samplePreCaptureOrbit(
        orbit,
        elapsedMs,
      );

    if (
      ball.radiusRatio >
        outerCaptureRadius ||
      ball.radiusRatio <
        innerCaptureRadius ||
      Math.abs(
        ball
          .radialVelocityRatioPerSecond,
      ) >
        orbit.captureRadialVelocity
    ) {
      continue;
    }

    const pocket =
      getNearestPocket(
        orbit,
        ball,
        elapsedMs,
      );
    const angularClearance =
      getCaptureAngularClearance(
        orbit,
        ball.radiusRatio,
      );

    if (
      angularClearance <= 0 ||
      Math.abs(
        pocket.angularOffset,
      ) >
        angularClearance ||
      Math.abs(
        pocket
          .relativeAngularVelocity,
      ) >
        orbit
          .captureRelativeAngularVelocity
    ) {
      continue;
    }

    const capture: PocketCapture = {
      timeMs: elapsedMs,
      pocketIndex:
        pocket.pocketIndex,
      pocketCenterRelativeAngle:
        pocket
          .pocketCenterRelativeAngle,
      initialAngularOffset:
        pocket.angularOffset,
      initialRelativeAngularVelocity:
        pocket
          .relativeAngularVelocity,
      initialRadiusOffset:
        ball.radiusRatio -
        orbit.pocketSettleRadius,
      initialRadialVelocity:
        ball
          .radialVelocityRatioPerSecond,
      settleTimeMs: 0,
    };

    capture.settleTimeMs =
      findCaptureSettleTimeMs(
        orbit,
        capture,
      );

    return capture;
  }

  return null;
}

function sampleCapturedBall(
  orbit: BallOrbit,
  capture: PocketCapture,
  elapsedMs: number,
): InternalBallSample {
  const clampedElapsedMs = Math.min(
    Math.max(
      capture.timeMs,
      Number.isFinite(elapsedMs)
        ? elapsedMs
        : capture.timeMs,
    ),
    orbit.durationMs,
  );
  const rotor =
    sampleRotorSpin(
      orbit.rotorSpin,
      clampedElapsedMs,
    );
  const rotorSignedAngularVelocity =
    orbit.rotorSpin.direction *
    rotor.angularVelocity;
  const kinematics =
    getPocketCaptureKinematics(
      orbit,
      capture,
      clampedElapsedMs,
    );
  const settled =
    clampedElapsedMs >=
    capture.settleTimeMs;
  const done =
    clampedElapsedMs >=
    orbit.durationMs;

  const angularOffset =
    settled
      ? 0
      : kinematics.angularOffset;
  const relativeAngularVelocity =
    settled
      ? 0
      : kinematics
          .relativeAngularVelocity;
  const radialOffset =
    settled
      ? 0
      : kinematics.radialOffset;
  const radialVelocity =
    settled
      ? 0
      : kinematics.radialVelocity;

  const signedAngularVelocity =
    rotorSignedAngularVelocity +
    relativeAngularVelocity;

  return {
    angle:
      rotor.angle +
      capture
        .pocketCenterRelativeAngle +
      angularOffset,
    radiusRatio:
      orbit.pocketSettleRadius +
      radialOffset,
    angularVelocity:
      Math.abs(
        signedAngularVelocity,
      ),
    signedAngularVelocity,
    radialVelocityRatioPerSecond:
      radialVelocity,
    progress:
      orbit.durationMs > 0
        ? Math.min(
            1,
            clampedElapsedMs /
              orbit.durationMs,
          )
        : 1,
    phase:
      settled
        ? "settled"
        : "capture",
    done,
  };
}

export function createBallOrbit(
  startAngle =
    BALL_ORBIT_PROFILE.initialAngle,
  rotorSpin: RotorSpin =
    createRotorSpin(0, 1),
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
    fretRestitutionDecay,
    fretTangentialPadding,
    fretRadialKick,
    fretRadialKickDecay,
    fretDampingPerSecond,
    fretVisualSeconds,
    fretCollisionCooldownMs,
    maxFretCollisions,
    captureMinFretCollisions,
    captureRelativeAngularVelocity,
    captureRadialVelocity,
    captureAngularMargin,
    pocketSettleRadius,
    captureAngularSpring,
    captureRadialSpring,
    settleAngularOffset,
    settleRelativeAngularVelocity,
    settleRadialOffset,
    settleRadialVelocity,
  } = BALL_ORBIT_PROFILE;

  const freeMotionDurationMs =
    getBallOrbitDurationMs(
      initialAngularVelocity,
      dragPerSecond,
      stopAngularVelocity,
    );

  const orbit: BallOrbit = {
    startAngle,
    direction,
    initialAngularVelocity,
    dragPerSecond,
    stopAngularVelocity,

    trackRadius:
      BALL_TRACK_STYLE.pathRadius,
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
    fretRestitutionDecay,
    fretTangentialPadding,
    fretRadialKick,
    fretRadialKickDecay,
    fretDampingPerSecond,
    fretVisualSeconds,
    fretCollisionCooldownMs,
    maxFretCollisions,

    captureMinFretCollisions,
    captureRelativeAngularVelocity,
    captureRadialVelocity,
    captureAngularMargin,
    pocketSettleRadius,
    captureAngularSpring,
    captureRadialSpring,
    settleAngularOffset,
    settleRelativeAngularVelocity,
    settleRadialOffset,
    settleRadialVelocity,

    descentStartMs:
      getBallSpeedThresholdMs(
        initialAngularVelocity,
        dragPerSecond,
        descentStartAngularVelocity,
      ),
    pocketEntryStartMs:
      getBallSpeedThresholdMs(
        initialAngularVelocity,
        dragPerSecond,
        pocketEntryAngularVelocity,
      ),
    freeMotionDurationMs,
    durationMs: Math.max(
      freeMotionDurationMs,
      rotorSpin.durationMs,
    ),

    rotorSpin,
    deflectorCollision: null,
    fretCollisions: [],
    pocketCapture: null,
  };

  orbit.deflectorCollision =
    findFirstDeflectorCollision(
      orbit,
    );
  orbit.fretCollisions =
    findFretCollisions(orbit);
  orbit.pocketCapture =
    findPocketCapture(orbit);

  return orbit;
}

export function sampleBallOrbit(
  orbit: BallOrbit,
  elapsedMs: number,
): BallOrbitSample {
  const capture =
    orbit.pocketCapture;

  if (
    capture &&
    elapsedMs >=
      capture.timeMs
  ) {
    const captured =
      sampleCapturedBall(
        orbit,
        capture,
        elapsedMs,
      );
    const elapsedCollisions =
      orbit.fretCollisions.filter(
        (collision) =>
          collision.timeMs <=
          capture.timeMs,
      );
    const latestFret =
      elapsedCollisions.length > 0
        ? elapsedCollisions[
            elapsedCollisions.length -
              1
          ]
        : null;

    return {
      ...captured,
      deflectorCollisionIndex:
        orbit.deflectorCollision
          ?.deflectorIndex ??
        null,
      fretCollisionIndex:
        latestFret
          ?.separatorIndex ??
        null,
      fretCollisionCount:
        elapsedCollisions.length,
      pocketCaptureIndex:
        capture.pocketIndex,
      settled:
        captured.phase ===
        "settled",
    };
  }

  const preCapture =
    samplePreCaptureOrbit(
      orbit,
      elapsedMs,
    );
  const elapsedCollisions =
    orbit.fretCollisions.filter(
      (collision) =>
        elapsedMs >=
        collision.timeMs,
    );
  const latestFret =
    elapsedCollisions.length > 0
      ? elapsedCollisions[
          elapsedCollisions.length -
            1
        ]
      : null;

  return {
    ...preCapture,
    done:
      elapsedMs >=
      orbit.durationMs,
    deflectorCollisionIndex:
      orbit.deflectorCollision &&
      elapsedMs >=
        orbit
          .deflectorCollision
          .timeMs
        ? orbit
            .deflectorCollision
            .deflectorIndex
        : null,
    fretCollisionIndex:
      latestFret
        ?.separatorIndex ??
      null,
    fretCollisionCount:
      elapsedCollisions.length,
    pocketCaptureIndex: null,
    settled: false,
  };
}

export function getBallOrbitRevolutions(
  orbit: BallOrbit,
) {
  const end =
    sampleBallOrbit(
      orbit,
      orbit.durationMs,
    );

  return (
    Math.abs(
      end.angle -
      orbit.startAngle,
    ) / TAU
  );
}
