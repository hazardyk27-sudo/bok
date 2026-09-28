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
  deriveSeededInitialConditions,
  getPocketIndexFromRelativeAngle,
  getWinningColor,
  hashRouletteSeed,
  readSettledWinningResult,
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

  it("derives repeatable launch conditions from the same seed", () => {
    const a =
      deriveSeededInitialConditions(
        "roulette-part15-a",
      );
    const b =
      deriveSeededInitialConditions(
        "roulette-part15-a",
      );
    const c =
      deriveSeededInitialConditions(
        "roulette-part15-b",
      );

    expect(a).toEqual(b);
    expect(a.seedHash).toBe(
      hashRouletteSeed(
        "roulette-part15-a",
      ),
    );
    expect(c.seedHash).not.toBe(
      a.seedHash,
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
        "roulette-part15-replay",
      );
    const second =
      simulateSeededRouletteSpin(
        "roulette-part15-replay",
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
