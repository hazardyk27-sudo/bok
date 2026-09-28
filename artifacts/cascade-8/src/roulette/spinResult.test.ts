import { describe, expect, it } from "vitest";
import {
  EUROPEAN_WHEEL_SEQUENCE,
  SEGMENT_ANGLE,
  TOP_SEGMENT_CENTER,
} from "./config";
import {
  createBallOrbit,
  sampleBallOrbit,
} from "./ballMotion";
import { createRotorSpin } from "./spinMotion";
import {
  ROULETTE_REGRESSION_SEEDS,
  ROULETTE_SEED_ENVELOPE,
  deriveSeededInitialConditions,
  getPocketIndexFromRelativeAngle,
  getWinningColor,
  hashRouletteSeed,
  readSettledWinningResult,
  runRouletteSeedRegression,
  simulateSeededRouletteSpin,
} from "./spinResult";

describe("roulette settled result derivation", () => {
  it("maps every final rotor-relative pocket center to the canonical sequence", () => {
    EUROPEAN_WHEEL_SEQUENCE.forEach(
      (number, pocketIndex) => {
        const relativeAngle =
          TOP_SEGMENT_CENTER +
          pocketIndex *
            SEGMENT_ANGLE;

        expect(
          getPocketIndexFromRelativeAngle(
            relativeAngle,
          ),
        ).toBe(pocketIndex);

        if (number === 0) {
          expect(
            getWinningColor(number),
          ).toBe("green");
        }
      },
    );
  });

  it("reads the winner only from the final settled ball versus rotor geometry", () => {
    const rotorSpin =
      createRotorSpin(0.37, 1);
    const ballOrbit =
      createBallOrbit(
        -0.72,
        rotorSpin,
      );
    const finalBall =
      sampleBallOrbit(
        ballOrbit,
        ballOrbit.durationMs,
      );
    const result =
      readSettledWinningResult(
        ballOrbit,
      );

    expect(finalBall.settled).toBe(true);
    expect(
      finalBall.pocketCaptureIndex,
    ).not.toBeNull();
    expect(result).not.toBeNull();
    expect(result!.pocketIndex).toBe(
      finalBall.pocketCaptureIndex,
    );
    expect(result!.number).toBe(
      EUROPEAN_WHEEL_SEQUENCE[
        result!.pocketIndex
      ],
    );
  });

  it("derives repeatable launch conditions across the broadened angle envelope", () => {
    const a =
      deriveSeededInitialConditions(
        "roulette-part16-a",
      );
    const b =
      deriveSeededInitialConditions(
        "roulette-part16-a",
      );
    const c =
      deriveSeededInitialConditions(
        "roulette-part16-b",
      );

    expect(a).toEqual(b);
    expect(a.seedHash).toBe(
      hashRouletteSeed(
        "roulette-part16-a",
      ),
    );
    expect(c.seedHash).not.toBe(
      a.seedHash,
    );

    expect(
      Math.abs(
        a.rotorStartAngle -
          ROULETTE_SEED_ENVELOPE
            .rotorCenterAngle,
      ),
    ).toBeLessThanOrEqual(
      ROULETTE_SEED_ENVELOPE
        .rotorAngleSpan / 2,
    );
    expect(
      Math.abs(
        a.ballStartAngle -
          ROULETTE_SEED_ENVELOPE
            .ballCenterAngle,
      ),
    ).toBeLessThanOrEqual(
      ROULETTE_SEED_ENVELOPE
        .ballAngleSpan / 2,
    );

    expect(
      c.rotorStartAngle ===
        a.rotorStartAngle &&
        c.ballStartAngle ===
          a.ballStartAngle,
    ).toBe(false);
  });

  it("replays a seed into the exact same physics result without supplying a target", () => {
    const first =
      simulateSeededRouletteSpin(
        "roulette-part16-replay",
      );
    const second =
      simulateSeededRouletteSpin(
        "roulette-part16-replay",
      );

    expect(
      first.initialConditions,
    ).toEqual(
      second.initialConditions,
    );
    expect(
      first.ballOrbit.fretCollisions,
    ).toEqual(
      second.ballOrbit.fretCollisions,
    );
    expect(
      first.ballOrbit.pocketCapture,
    ).toEqual(
      second.ballOrbit.pocketCapture,
    );
    expect(first.result).toEqual(
      second.result,
    );
  });

  it("defines the final 20-seed regression batch", () => {
    expect(
      ROULETTE_REGRESSION_SEEDS,
    ).toEqual([
      61001, 61002, 61003, 61004, 61005,
      61006, 61007, 61008, 61009, 61010,
      61011, 61012, 61013, 61014, 61015,
      61016, 61017, 61018, 61019, 61020,
    ]);
  });

  it("requires every regression seed to settle and produce a geometry-verified result", () => {
    const summary =
      runRouletteSeedRegression();

    expect(summary.totalSeeds).toBe(20);
    expect(summary.settledSeeds).toBe(20);
    expect(summary.validResultSeeds).toBe(20);
    expect(summary.failedSeeds).toEqual([]);
    expect(
      summary.uniquePocketCount,
    ).toBeGreaterThan(1);
    expect(
      summary.maxSettleTimeMs,
    ).toBeGreaterThan(0);
  });

  it("keeps the seed path free of target-number or target-pocket inputs", () => {
    const conditions =
      deriveSeededInitialConditions(
        61001,
      ) as Record<string, unknown>;

    expect(
      "targetNumber" in conditions,
    ).toBe(false);
    expect(
      "targetPocket" in conditions,
    ).toBe(false);
  });
});
