import {
  describe,
  expect,
  it,
} from "vitest";
import {
  assertRouletteGlobalBettingOpen,
  getNextRouletteGlobalBetRevision,
  getRouletteGlobalPayoutIdempotencyKey,
  settleRouletteGlobalBet,
} from "./globalBet";
import {
  createRouletteGlobalRoundPlan,
  type RouletteGlobalRoundPlan,
} from "./globalTable";
import {
  buildRouletteGlobalRoundChain,
} from "./globalTableSchedule";

const START_MS =
  1_800_000_000_000;
const SYNTHETIC_BET_MS =
  20_000;
const SYNTHETIC_SPIN_MS =
  9_000;
const SYNTHETIC_RESULT_MS =
  2_200;
const SYNTHETIC_ROUND_MS =
  SYNTHETIC_BET_MS +
  SYNTHETIC_SPIN_MS +
  SYNTHETIC_RESULT_MS;

function syntheticRoundFactory() {
  let index = 0;

  return (
    bettingOpenAtMs: number,
  ): RouletteGlobalRoundPlan => {
    const bettingCloseAtMs =
      bettingOpenAtMs +
      SYNTHETIC_BET_MS;
    const resultAtMs =
      bettingCloseAtMs +
      SYNTHETIC_SPIN_MS;

    return {
      roundId:
        `stress-round-${index}`,
      simulationVersion:
        "roulette-full-turn-v2",
      seed:
        `stress-seed-${index++}`,
      result: {
        pocketIndex: 0,
        number: 0,
        color: "green",
        finalRelativeAngle: 0,
        finalRadiusRatio: 0.5,
      },
      bettingOpenAtMs,
      bettingCloseAtMs,
      spinStartedAtMs:
        bettingCloseAtMs,
      resultAtMs,
      nextRoundAtMs:
        resultAtMs +
        SYNTHETIC_RESULT_MS,
    };
  };
}

describe("roulette global live table stress audit", () => {
  it("backfills more than ten thousand rounds without a gap or overlap", () => {
    const createRound =
      syntheticRoundFactory();
    const targetNowMs =
      START_MS +
      SYNTHETIC_ROUND_MS *
        10_000;
    const persistedFirst =
      createRound(
        START_MS,
      );
    let latest:
      RouletteGlobalRoundPlan |
      null =
        persistedFirst;
    let previous:
      RouletteGlobalRoundPlan |
      null =
        persistedFirst;
    let generated = 1;
    let reachedHorizon = false;
    let ticks = 0;

    while (
      !reachedHorizon &&
      ticks < 100
    ) {
      const materialization =
        buildRouletteGlobalRoundChain({
          latestRound:
            latest,
          nowMs:
            targetNowMs,
          lookaheadMs: 0,
          maxRounds: 256,
          createRound,
        });

      expect(
        materialization.rounds
          .length,
      ).toBeGreaterThan(0);

      for (
        const round of
        materialization.rounds
      ) {
        expect(
          round.bettingOpenAtMs,
        ).toBe(
          previous
            ?.nextRoundAtMs,
        );

        expect(
          round.spinStartedAtMs,
        ).toBe(
          round.bettingCloseAtMs,
        );
        expect(
          round.nextRoundAtMs,
        ).toBeGreaterThan(
          round.resultAtMs,
        );

        previous = round;
        generated += 1;
      }

      latest =
        previous;
      reachedHorizon =
        materialization
          .reachedHorizon;
      ticks += 1;
    }

    expect(
      reachedHorizon,
    ).toBe(true);
    expect(
      generated,
    ).toBeGreaterThan(
      10_000,
    );
    expect(
      latest?.nextRoundAtMs,
    ).toBeGreaterThan(
      targetNowMs,
    );
  });

  it("keeps a real deterministic spin chain contiguous across many seeds", () => {
    let bettingOpenAtMs =
      START_MS;
    let previous:
      RouletteGlobalRoundPlan |
      null = null;

    for (
      let index = 0;
      index < 128;
      index += 1
    ) {
      const round =
        createRouletteGlobalRoundPlan({
          roundId:
            `real-round-${index}`,
          seed:
            `real-stress-seed-${index}`,
          bettingOpenAtMs,
        });

      expect(
        round.result.number,
      ).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        round.result.number,
      ).toBeLessThanOrEqual(
        36,
      );
      expect(
        round.result.pocketIndex,
      ).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        round.result.pocketIndex,
      ).toBeLessThanOrEqual(
        36,
      );

      if (previous) {
        expect(
          round.bettingOpenAtMs,
        ).toBe(
          previous.nextRoundAtMs,
        );
      }

      previous = round;
      bettingOpenAtMs =
        round.nextRoundAtMs;
    }
  });

  it("accepts the final millisecond of betting and rejects the exact close timestamp", () => {
    const round = {
      bettingOpenAtMs:
        START_MS,
      bettingCloseAtMs:
        START_MS +
        20_000,
    };

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        round.bettingCloseAtMs -
          1,
      ),
    ).not.toThrow();
    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        round.bettingCloseAtMs,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BETTING_CLOSED",
    );

  });

  it("survives ten thousand revision advances and rejects an old tab revision", () => {
    let revision = 0;

    for (
      let index = 0;
      index < 10_000;
      index += 1
    ) {
      revision =
        getNextRouletteGlobalBetRevision(
          revision,
          revision,
        );
    }

    expect(revision).toBe(
      10_000,
    );
    expect(() =>
      getNextRouletteGlobalBetRevision(
        revision,
        revision - 1,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BET_STALE",
    );
  });

  it("settles many players against one global winning number", () => {
    const winningNumber = 17;

    for (
      let index = 0;
      index < 100;
      index += 1
    ) {
      const settlement =
        settleRouletteGlobalBet(
          [
            {
              betId:
                `straight-${index % 37}`,
              amount: 1,
            },
          ],
          winningNumber,
        );

      expect(
        settlement
          .settlement
          .winningNumber,
      ).toBe(
        winningNumber,
      );
      expect(
        settlement.payoutCents,
      ).toBeGreaterThanOrEqual(
        0,
      );
    }
  });

  it("uses one stable payout key per round and session with no cross-session collisions", () => {
    const roundId =
      "payout-stress-round";
    const keys =
      new Set<string>();

    for (
      let index = 0;
      index < 1_000;
      index += 1
    ) {
      const sessionId =
        `session-${index}`;
      const key =
        getRouletteGlobalPayoutIdempotencyKey(
          roundId,
          sessionId,
        );

      expect(
        getRouletteGlobalPayoutIdempotencyKey(
          roundId,
          sessionId,
        ),
      ).toBe(key);

      keys.add(key);
    }

    expect(keys.size).toBe(
      1_000,
    );
  });
});
