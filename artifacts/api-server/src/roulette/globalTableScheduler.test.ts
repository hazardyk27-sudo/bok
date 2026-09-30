import {
  describe,
  expect,
  it,
} from "vitest";
import {
  createRouletteGlobalRoundPlan,
} from "./globalTable";
import {
  buildRouletteGlobalRoundChain,
} from "./globalTableSchedule";

function factory() {
  let index = 0;

  return (
    bettingOpenAtMs: number,
  ) =>
    createRouletteGlobalRoundPlan({
      roundId:
        `global-round-${index}`,
      seed:
        `global-seed-${index++}`,
      bettingOpenAtMs,
    });
}

describe("roulette global table scheduler", () => {
  it("starts a table immediately when no global round exists", () => {
    const nowMs =
      1_800_000_000_000;
    const result =
      buildRouletteGlobalRoundChain({
        latestRound: null,
        nowMs,
        lookaheadMs: 0,
        createRound:
          factory(),
      });

    expect(
      result.rounds[0]
        ?.bettingOpenAtMs,
    ).toBe(nowMs);
    expect(
      result.coveredThroughMs,
    ).toBeGreaterThan(
      nowMs,
    );
    expect(
      result.reachedHorizon,
    ).toBe(true);
  });

  it("chains every new round exactly from the previous nextRoundAt", () => {
    const createRound =
      factory();
    const first =
      createRound(
        1_800_000_000_000,
      );
    const result =
      buildRouletteGlobalRoundChain({
        latestRound: first,
        nowMs:
          first.nextRoundAtMs +
          1,
        lookaheadMs: 60_000,
        createRound,
      });

    let previous =
      first;

    for (
      const round of
      result.rounds
    ) {
      expect(
        round.bettingOpenAtMs,
      ).toBe(
        previous.nextRoundAtMs,
      );
      previous = round;
    }

    expect(
      result.reachedHorizon,
    ).toBe(true);
  });

  it("backfills an old persisted table instead of resetting the clock to now", () => {
    const createRound =
      factory();
    const first =
      createRound(
        1_800_000_000_000,
      );
    const nowMs =
      first.nextRoundAtMs +
      120_000;
    const result =
      buildRouletteGlobalRoundChain({
        latestRound: first,
        nowMs,
        lookaheadMs: 0,
        createRound,
      });

    expect(
      result.rounds.length,
    ).toBeGreaterThan(1);
    expect(
      result.rounds[0]
        ?.bettingOpenAtMs,
    ).toBe(
      first.nextRoundAtMs,
    );
    expect(
      result.coveredThroughMs,
    ).toBeGreaterThan(
      nowMs,
    );
  });

  it("caps catch-up work so a long outage cannot monopolize one event-loop turn", () => {
    const createRound =
      factory();
    const first =
      createRound(
        1_800_000_000_000,
      );
    const result =
      buildRouletteGlobalRoundChain({
        latestRound: first,
        nowMs:
          first.nextRoundAtMs +
          10_000_000,
        lookaheadMs: 60_000,
        maxRounds: 3,
        createRound,
      });

    expect(
      result.rounds,
    ).toHaveLength(3);
    expect(
      result.reachedHorizon,
    ).toBe(false);
  });
});
