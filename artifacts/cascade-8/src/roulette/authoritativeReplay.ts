import {
  simulateSeededRouletteSpin,
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

export function createVerifiedRouletteReplay(
  response: RouletteServerSpinResponse,
) {
  const replay =
    simulateSeededRouletteSpin(
      response.seed,
    );
  const result =
    replay.result;
  const expected =
    response.result;

  if (
    !result ||
    result.pocketIndex !==
      expected.pocketIndex ||
    result.number !==
      expected.number ||
    result.color !==
      expected.color ||
    !nearlyEqual(
      result.finalRelativeAngle,
      expected.finalRelativeAngle,
    ) ||
    !nearlyEqual(
      result.finalRadiusRatio,
      expected.finalRadiusRatio,
    )
  ) {
    throw new Error(
      "ROULETTE_SERVER_RESULT_MISMATCH",
    );
  }

  return replay;
}
