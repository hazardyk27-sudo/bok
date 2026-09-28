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

export const ROULETTE_SEED_ENVELOPE = {
  rotorCenterAngle: 0.37,
  rotorAngleSpan: 0.12,
  ballCenterAngle: BALL_ORBIT_PROFILE.initialAngle,
  ballAngleSpan: 0.16,
} as const;

export const ROULETTE_REGRESSION_SEEDS = Array.from(
  { length: 20 },
  (_, index) => 61001 + index,
);

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

export type RouletteSeedRegressionSummary = {
  totalSeeds: number;
  settledSeeds: number;
  validResultSeeds: number;
  uniquePocketCount: number;
  maxSettleTimeMs: number;
  failedSeeds: string[];
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

  const rotorJitter =
    (
      seededUnit(seedHash, 0) -
      0.5
    ) *
    ROULETTE_SEED_ENVELOPE
      .rotorAngleSpan;
  const ballJitter =
    (
      seededUnit(seedHash, 1) -
      0.5
    ) *
    ROULETTE_SEED_ENVELOPE
      .ballAngleSpan;

  return {
    seed: normalizedSeed,
    seedHash,
    rotorStartAngle:
      ROULETTE_SEED_ENVELOPE
        .rotorCenterAngle +
      rotorJitter,
    ballStartAngle:
      ROULETTE_SEED_ENVELOPE
        .ballCenterAngle +
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

export function runRouletteSeedRegression(
  seeds: readonly (string | number)[] =
    ROULETTE_REGRESSION_SEEDS,
): RouletteSeedRegressionSummary {
  const failedSeeds: string[] = [];
  const pocketSet = new Set<number>();
  let settledSeeds = 0;
  let validResultSeeds = 0;
  let maxSettleTimeMs = 0;

  for (const seed of seeds) {
    const simulation =
      simulateSeededRouletteSpin(seed);
    const capture =
      simulation.ballOrbit
        .pocketCapture;

    if (capture) {
      settledSeeds += 1;
      maxSettleTimeMs = Math.max(
        maxSettleTimeMs,
        capture.settleTimeMs,
      );
    }

    if (simulation.result) {
      validResultSeeds += 1;
      pocketSet.add(
        simulation.result.pocketIndex,
      );
      continue;
    }

    failedSeeds.push(String(seed));
  }

  return {
    totalSeeds: seeds.length,
    settledSeeds,
    validResultSeeds,
    uniquePocketCount:
      pocketSet.size,
    maxSettleTimeMs,
    failedSeeds,
  };
}

export function getFullTurn() {
  return TAU;
}
