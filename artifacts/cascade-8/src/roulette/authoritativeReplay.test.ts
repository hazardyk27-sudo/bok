import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createVerifiedRouletteReplay,
} from "./authoritativeReplay";
import {
  simulateSeededRouletteSpin,
} from "./spinResult";
import type {
  RouletteServerSpinResponse,
} from "./rouletteWalletClient";

function responseForSeed(
  seed: string,
): RouletteServerSpinResponse {
  const simulation =
    simulateSeededRouletteSpin(seed);

  if (!simulation.result) {
    throw new Error(
      "fixture did not settle",
    );
  }

  return {
    roundId: "round-test",
    seed,
    result: simulation.result,
    settlement: {
      winningNumber:
        simulation.result.number,
      totalStake: 0,
      winningStake: 0,
      grossReturn: 0,
      netProfit: 0,
      winningBetIds: [],
      lines: [],
    },
    wallet: {
      sessionId: "session-test",
      balanceCents: 100_000,
    },
  };
}

describe("authoritative roulette replay", () => {
  it("replays the server seed into the exact authoritative result", () => {
    const response =
      responseForSeed(
        "roulette-final-replay",
      );
    const replay =
      createVerifiedRouletteReplay(
        response,
      );

    expect(replay.result).toEqual(
      response.result,
    );
  });

  it("rejects a changed winning number or pocket", () => {
    const response =
      responseForSeed(
        "roulette-final-tamper",
      );

    expect(() =>
      createVerifiedRouletteReplay({
        ...response,
        result: {
          ...response.result,
          number:
            (
              response.result.number +
              1
            ) %
            37,
        },
      }),
    ).toThrow(
      "ROULETTE_SERVER_RESULT_MISMATCH",
    );
  });

  it("rejects changed final geometry even when the number still matches", () => {
    const response =
      responseForSeed(
        "roulette-final-geometry",
      );

    expect(() =>
      createVerifiedRouletteReplay({
        ...response,
        result: {
          ...response.result,
          finalRadiusRatio:
            response.result
              .finalRadiusRatio +
            0.001,
        },
      }),
    ).toThrow(
      "ROULETTE_SERVER_RESULT_MISMATCH",
    );
  });
});
