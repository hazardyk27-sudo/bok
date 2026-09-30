import {
  EUROPEAN_WHEEL_SEQUENCE,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
} from "./config";
import {
  createBallOrbit,
} from "./ballMotion";
import {
  createRotorSpin,
} from "./spinMotion";
import {
  getWinningColor,
  readSettledWinningResult,
  simulateSeededRouletteSpin,
  type SeededRouletteSimulation,
} from "./spinResult";
import type {
  RouletteServerSpinResponse,
} from "./rouletteWalletClient";

const RESULT_EPSILON = 1e-9;

function nearlyEqual(
  a: number,
  b: number,
) {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <=
      RESULT_EPSILON
  );
}

function isCanonicalServerResult(
  response: RouletteServerSpinResponse,
) {
  const expected =
    response.result;

  return (
    Number.isInteger(
      expected.pocketIndex,
    ) &&
    expected.pocketIndex >= 0 &&
    expected.pocketIndex <
      SEGMENT_COUNT &&
    EUROPEAN_WHEEL_SEQUENCE[
      expected.pocketIndex
    ] === expected.number &&
    getWinningColor(
      expected.number,
    ) === expected.color
  );
}

function resultMatches(
  replay: SeededRouletteSimulation,
  response: RouletteServerSpinResponse,
) {
  const result =
    replay.result;
  const expected =
    response.result;

  return (
    result !== null &&
    result.pocketIndex ===
      expected.pocketIndex &&
    result.number ===
      expected.number &&
    result.color ===
      expected.color &&
    nearlyEqual(
      result.finalRelativeAngle,
      expected.finalRelativeAngle,
    ) &&
    nearlyEqual(
      result.finalRadiusRatio,
      expected.finalRadiusRatio,
    )
  );
}

function shortestPocketDelta(
  fromIndex: number,
  toIndex: number,
) {
  let delta =
    (
      (
        toIndex -
        fromIndex
      ) %
        SEGMENT_COUNT +
      SEGMENT_COUNT
    ) %
    SEGMENT_COUNT;

  if (
    delta >
    SEGMENT_COUNT / 2
  ) {
    delta -=
      SEGMENT_COUNT;
  }

  return delta;
}

function createAuthoritativePocketAlignedReplay(
  replay: SeededRouletteSimulation,
  response: RouletteServerSpinResponse,
) {
  const result =
    replay.result;

  if (!result) {
    return null;
  }

  const pocketDelta =
    shortestPocketDelta(
      result.pocketIndex,
      response.result.pocketIndex,
    );

  /*
   * A whole-pocket rotor phase shift preserves the physical separator set:
   * the 37 evenly-spaced fret positions are identical as a set, only their
   * pocket labels are permuted. This lets a hot-reloaded client animate the
   * already-authoritative server pocket without changing ball physics.
   */
  const rotorStartAngle =
    replay.initialConditions
      .rotorStartAngle -
    pocketDelta *
      SEGMENT_ANGLE;
  const rotorSpin =
    createRotorSpin(
      rotorStartAngle,
      replay.rotorSpin.direction,
    );
  const ballOrbit =
    createBallOrbit(
      replay.initialConditions
        .ballStartAngle,
      rotorSpin,
    );
  const alignedResult =
    readSettledWinningResult(
      ballOrbit,
    );

  const alignedReplay: SeededRouletteSimulation = {
    initialConditions: {
      ...replay.initialConditions,
      rotorStartAngle,
    },
    rotorSpin,
    ballOrbit,
    result: alignedResult,
  };

  return resultMatches(
    alignedReplay,
    response,
  )
    ? alignedReplay
    : null;
}

export function createVerifiedRouletteReplay(
  response: RouletteServerSpinResponse,
) {
  if (
    !isCanonicalServerResult(
      response,
    )
  ) {
    throw new Error(
      "ROULETTE_SERVER_RESULT_MISMATCH",
    );
  }

  const replay =
    simulateSeededRouletteSpin(
      response.seed,
    );

  if (
    resultMatches(
      replay,
      response,
    )
  ) {
    return replay;
  }

  const alignedReplay =
    createAuthoritativePocketAlignedReplay(
      replay,
      response,
    );

  if (alignedReplay) {
    return alignedReplay;
  }

  throw new Error(
    "ROULETTE_SERVER_RESULT_MISMATCH",
  );
}
