import {
  BALL_STYLE,
  EUROPEAN_WHEEL_SEQUENCE,
  RED_NUMBERS,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  TOP_SEGMENT_CENTER,
  WHEEL_GEOMETRY,
} from "./config";
import {
  BALL_ORBIT_PROFILE,
  createBallOrbit,
  sampleBallOrbit,
  type BallOrbit,
} from "./ballMotion";
import {
  createRotorSpin,
  sampleRotorSpin,
  type RotorSpin,
} from "./spinMotion";

const TAU = Math.PI * 2;

export type RouletteWinningColor =
  | "green"
  | "red"
  | "black";

export type RouletteWinningResult = {
  pocketIndex: number;
  number: number;
  color: RouletteWinningColor;
  finalRelativeAngle: number;
  finalRadiusRatio: number;
};

export type SeededRouletteInitialConditions = {
  seed: string;
  seedHash: number;
  rotorStartAngle: number;
  ballStartAngle: number;
};

export type SeededRouletteSimulation = {
  initialConditions: SeededRouletteInitialConditions;
  rotorSpin: RotorSpin;
  ballOrbit: BallOrbit;
  result: RouletteWinningResult | null;
};

function shortestAngleDelta(a: number, b: number) {
  return Math.atan2(
    Math.sin(a - b),
    Math.cos(a - b),
  );
}

function normalizeIndex(index: number) {
  return (
    (index % SEGMENT_COUNT) +
    SEGMENT_COUNT
  ) % SEGMENT_COUNT;
}

export function getPocketIndexFromRelativeAngle(
  relativeAngle: number,
) {
  if (!Number.isFinite(relativeAngle)) {
    return null;
  }

  const offsetFromTop =
    shortestAngleDelta(
      relativeAngle,
      TOP_SEGMENT_CENTER,
    );
  const nearestIndex = Math.round(
    offsetFromTop / SEGMENT_ANGLE,
  );

  return normalizeIndex(nearestIndex);
}

export function getWinningColor(
  number: number,
): RouletteWinningColor {
  if (number === 0) return "green";
  return RED_NUMBERS.has(number)
    ? "red"
    : "black";
}

export function readSettledWinningResult(
  orbit: BallOrbit,
): RouletteWinningResult | null {
  const finalBall = sampleBallOrbit(
    orbit,
    orbit.durationMs,
  );

  if (
    !finalBall.done ||
    !finalBall.settled ||
    finalBall.pocketCaptureIndex === null
  ) {
    return null;
  }

  const innerSafeRadius =
    WHEEL_GEOMETRY.pocketInnerRadius +
    BALL_STYLE.radius;
  const outerSafeRadius =
    WHEEL_GEOMETRY.pocketOuterRadius -
    BALL_STYLE.radius;

  if (
    finalBall.radiusRatio <
      innerSafeRadius ||
    finalBall.radiusRatio >
      outerSafeRadius
  ) {
    return null;
  }

  const finalRotor = sampleRotorSpin(
    orbit.rotorSpin,
    orbit.durationMs,
  );
  const finalRelativeAngle =
    finalBall.angle -
    finalRotor.angle;
  const geometryPocketIndex =
    getPocketIndexFromRelativeAngle(
      finalRelativeAngle,
    );

  if (
    geometryPocketIndex === null ||
    geometryPocketIndex !==
      finalBall.pocketCaptureIndex
  ) {
    return null;
  }

  const number =
    EUROPEAN_WHEEL_SEQUENCE[
      geometryPocketIndex
    ];

  return {
    pocketIndex:
      geometryPocketIndex,
    number,
    color:
      getWinningColor(number),
    finalRelativeAngle:
      shortestAngleDelta(
        finalRelativeAngle,
        TOP_SEGMENT_CENTER,
      ),
    finalRadiusRatio:
      finalBall.radiusRatio,
  };
}

export function hashRouletteSeed(
  seed: string | number,
) {
  const value = String(seed);
  let hash = 0x811c9dc5;

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(
      hash,
      0x01000193,
    );
  }

  return hash >>> 0;
}

function seededUnit(
  seedHash: number,
  stream: number,
) {
  let value =
    (
      seedHash +
      Math.imul(
        stream + 1,
        0x9e3779b9,
      )
    ) >>> 0;

  value ^= value >>> 16;
  value = Math.imul(
    value,
    0x21f0aaad,
  );
  value ^= value >>> 15;
  value = Math.imul(
    value,
    0x735a2d97,
  );
  value ^= value >>> 15;

  return (
    (value >>> 0) /
    0x100000000
  );
}

export function deriveSeededInitialConditions(
  seed: string | number,
): SeededRouletteInitialConditions {
  const normalizedSeed =
    String(seed);
  const seedHash =
    hashRouletteSeed(
      normalizedSeed,
    );

  // Keep Part 15's deterministic validation envelope close to the
  // already-established physical baseline. Part 16 will broaden and
  // calibrate this launch envelope across a larger seed set.
  const rotorJitter =
    (
      seededUnit(seedHash, 0) -
      0.5
    ) *
    0.04;
  const ballJitter =
    (
      seededUnit(seedHash, 1) -
      0.5
    ) *
    0.04;

  return {
    seed: normalizedSeed,
    seedHash,
    rotorStartAngle:
      0.37 + rotorJitter,
    ballStartAngle:
      BALL_ORBIT_PROFILE.initialAngle +
      ballJitter,
  };
}

export function simulateSeededRouletteSpin(
  seed: string | number,
): SeededRouletteSimulation {
  const initialConditions =
    deriveSeededInitialConditions(
      seed,
    );
  const rotorSpin =
    createRotorSpin(
      initialConditions
        .rotorStartAngle,
      1,
    );
  const ballOrbit =
    createBallOrbit(
      initialConditions
        .ballStartAngle,
      rotorSpin,
    );

  return {
    initialConditions,
    rotorSpin,
    ballOrbit,
    result:
      readSettledWinningResult(
        ballOrbit,
      ),
  };
}

export function getFullTurn() {
  return TAU;
}
