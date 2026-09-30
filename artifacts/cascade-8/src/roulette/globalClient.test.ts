import {
  describe,
  expect,
  it,
} from "vitest";
import {
  estimateRouletteServerClockOffset,
  getRouletteGlobalBettingSecondsRemaining,
  getRouletteGlobalClientPhase,
  getRouletteGlobalSpinElapsedMs,
  getRouletteQueuedBetExpectedRevision,
  getRouletteStateSyncDelay,
  ROULETTE_STATE_RETRY_INTERVAL_MS,
  ROULETTE_STATE_SYNC_INTERVAL_MS,
} from "./globalClient";
import type {
  RouletteGlobalTableSnapshot,
} from "./rouletteWalletClient";

const table: RouletteGlobalTableSnapshot = {
  roundId: "global-1",
  simulationVersion:
    "roulette-full-turn-v2",
  phase: "betting",
  serverTimeMs: 10_000,
  bettingOpenAtMs: 10_000,
  bettingCloseAtMs: 30_000,
  spinStartedAtMs: 30_000,
  resultAtMs: 40_000,
  nextRoundAtMs: 42_200,
  seed: null,
  result: null,
};

describe("roulette global client clock", () => {
  it("backs off steady-state polling while keeping connection retries bounded", () => {
    expect(
      getRouletteStateSyncDelay(
        true,
      ),
    ).toBe(
      ROULETTE_STATE_SYNC_INTERVAL_MS,
    );
    expect(
      ROULETTE_STATE_SYNC_INTERVAL_MS,
    ).toBe(5_000);
    expect(
      getRouletteStateSyncDelay(
        false,
      ),
    ).toBe(
      ROULETTE_STATE_RETRY_INTERVAL_MS,
    );
    expect(
      ROULETTE_STATE_RETRY_INTERVAL_MS,
    ).toBe(1_000);
  });

  it("keeps queued writes pinned to the revision they were based on", () => {
    expect(
      getRouletteQueuedBetExpectedRevision(
        4,
        false,
      ),
    ).toBe(4);
    expect(
      getRouletteQueuedBetExpectedRevision(
        4,
        true,
      ),
    ).toBe(5);
  });


  it("estimates server time from the request midpoint", () => {
    expect(
      estimateRouletteServerClockOffset(
        10_100,
        9_900,
        10_000,
      ),
    ).toBe(150);
  });

  it("joins a betting round at the remaining global second", () => {
    expect(
      getRouletteGlobalClientPhase(
        table,
        23_100,
      ),
    ).toBe("betting");
    expect(
      getRouletteGlobalBettingSecondsRemaining(
        table,
        23_100,
      ),
    ).toBe(7);
  });

  it("moves phases only from authoritative timestamps", () => {
    expect(
      getRouletteGlobalClientPhase(
        table,
        29_999,
      ),
    ).toBe("betting");
    expect(
      getRouletteGlobalClientPhase(
        table,
        30_000,
      ),
    ).toBe("spinning");
    expect(
      getRouletteGlobalClientPhase(
        table,
        40_000,
      ),
    ).toBe("result");
    expect(
      getRouletteGlobalClientPhase(
        table,
        42_200,
      ),
    ).toBe("complete");
  });

  it("calculates the exact elapsed global spin time", () => {
    expect(
      getRouletteGlobalSpinElapsedMs(
        table,
        34_250,
      ),
    ).toBe(4_250);
    expect(
      getRouletteGlobalSpinElapsedMs(
        table,
        50_000,
      ),
    ).toBe(10_000);
  });

  it("keeps client phase math stable across one thousand timestamps", () => {
    const rangeStart =
      table.bettingOpenAtMs;
    const rangeEnd =
      table.nextRoundAtMs -
      1;
    const range =
      rangeEnd -
      rangeStart;

    for (
      let index = 0;
      index < 1_000;
      index += 1
    ) {
      const nowMs =
        rangeStart +
        Math.floor(
          (
            range *
            index
          ) /
            999,
        );

      const expectedPhase =
        nowMs <
          table.bettingCloseAtMs
          ? "betting"
          : nowMs <
              table.resultAtMs
            ? "spinning"
            : "result";

      expect(
        getRouletteGlobalClientPhase(
          table,
          nowMs,
        ),
      ).toBe(
        expectedPhase,
      );

      if (
        expectedPhase ===
        "spinning"
      ) {
        expect(
          getRouletteGlobalSpinElapsedMs(
            table,
            nowMs,
          ),
        ).toBe(
          nowMs -
            table.spinStartedAtMs,
        );
      }
    }
  });

  it("gives independent viewers the same betting and spin offsets", () => {
    for (
      let offset = 0;
      offset <= 9_000;
      offset += 250
    ) {
      const nowMs =
        table.spinStartedAtMs +
        offset;

      expect(
        getRouletteGlobalSpinElapsedMs(
          table,
          nowMs,
        ),
      ).toBe(
        getRouletteGlobalSpinElapsedMs(
          table,
          nowMs,
        ),
      );
    }

    for (
      let offset = 0;
      offset < 20_000;
      offset += 250
    ) {
      const nowMs =
        table.bettingOpenAtMs +
        offset;

      expect(
        getRouletteGlobalBettingSecondsRemaining(
          table,
          nowMs,
        ),
      ).toBe(
        Math.max(
          0,
          Math.ceil(
            (
              table.bettingCloseAtMs -
              nowMs
            ) /
              1000,
          ),
        ),
      );
    }
  });

});
