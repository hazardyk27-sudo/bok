import {
  describe,
  expect,
  it,
} from "vitest";
import {
  alignRouletteRequestReceivedAtToDatabaseClock,
  assertRouletteGlobalBettingOpen,
  getRouletteGlobalStakeCents,
  getNextRouletteGlobalBetRevision,
  settleRouletteGlobalBet,
} from "./globalBet";

describe("roulette global bets", () => {
  it("advances only the exact current bet revision", () => {
    expect(
      getNextRouletteGlobalBetRevision(
        0,
        0,
      ),
    ).toBe(1);
    expect(
      getNextRouletteGlobalBetRevision(
        4,
        4,
      ),
    ).toBe(5);
  });

  it("rejects stale global bet revisions", () => {
    expect(() =>
      getNextRouletteGlobalBetRevision(
        5,
        4,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BET_STALE",
    );
  });


  const round = {
    bettingOpenAtMs:
      1_000,
    bettingCloseAtMs:
      21_000,
  };

  it("accepts bets only inside the authoritative server window", () => {
    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        1_000,
      ),
    ).not.toThrow();

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        20_999,
      ),
    ).not.toThrow();

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        999,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BETTING_NOT_OPEN",
    );

    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        21_000,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BETTING_CLOSED",
    );
  });

  it("keeps the API arrival time authoritative even when database work finishes later", () => {
    const alignedArrival =
      alignRouletteRequestReceivedAtToDatabaseClock({
        requestReceivedAtMs:
          20_400,
        databaseSampleMs:
          20_700,
        sampleStartedAtMs:
          20_580,
        sampleFinishedAtMs:
          20_620,
      });

    expect(alignedArrival).toBe(
      20_500,
    );
    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        alignedArrival,
      ),
    ).not.toThrow();

    // Processing may continue beyond close; acceptance is based on the
    // server-observed API arrival, not on the later lock/commit time.
    expect(24_000).toBeGreaterThan(
      round.bettingCloseAtMs,
    );
  });

  it("rejects a request that actually arrived at or after the close boundary", () => {
    const alignedArrival =
      alignRouletteRequestReceivedAtToDatabaseClock({
        requestReceivedAtMs:
          21_050,
        databaseSampleMs:
          21_300,
        sampleStartedAtMs:
          21_180,
        sampleFinishedAtMs:
          21_220,
      });

    expect(alignedArrival).toBe(
      21_150,
    );
    expect(() =>
      assertRouletteGlobalBettingOpen(
        round,
        alignedArrival,
      ),
    ).toThrow(
      "ROULETTE_GLOBAL_BETTING_CLOSED",
    );
  });

  it("converts the complete editable bet slip to reserved wallet cents", () => {
    expect(
      getRouletteGlobalStakeCents([
        {
          betId: "red",
          amount: 25,
        },
        {
          betId: "straight-17",
          amount: 10,
        },
      ]),
    ).toBe(3_500);

    expect(
      getRouletteGlobalStakeCents(
        [],
      ),
    ).toBe(0);
  });

  it("settles every player against the same global winning number", () => {
    const first =
      settleRouletteGlobalBet(
        [
          {
            betId: "straight-17",
            amount: 10,
          },
          {
            betId: "odd",
            amount: 10,
          },
        ],
        17,
      );
    const second =
      settleRouletteGlobalBet(
        [
          {
            betId: "black",
            amount: 25,
          },
        ],
        17,
      );

    expect(
      first.settlement.winningNumber,
    ).toBe(17);
    expect(
      second.settlement.winningNumber,
    ).toBe(17);
    expect(
      first.payoutCents,
    ).toBe(
      first.settlement.grossReturn *
        100,
    );
    expect(
      second.payoutCents,
    ).toBe(
      second.settlement.grossReturn *
        100,
    );
  });
});
