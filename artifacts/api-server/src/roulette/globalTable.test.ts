import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_BETTING_WINDOW_MS,
  ROULETTE_RESULT_HOLD_MS,
} from "../../../cascade-8/src/roulette/scenePhase";
import {
  ROULETTE_SIMULATION_VERSION,
} from "../../../cascade-8/src/roulette/spinResult";
import {
  createRouletteGlobalRoundPlan,
  createRouletteGlobalRoundSnapshot,
  getRouletteGlobalRoundPhase,
} from "./globalTable";

describe("roulette global table timeline", () => {
  const bettingOpenAtMs =
    1_800_000_000_000;
  const round =
    createRouletteGlobalRoundPlan({
      roundId: "global-round-1",
      seed: "global-seed-1",
      bettingOpenAtMs,
    });

  it("uses one immutable 20 second betting window before the spin", () => {
    expect(
      round.simulationVersion,
    ).toBe(
      ROULETTE_SIMULATION_VERSION,
    );
    expect(
      round.bettingCloseAtMs -
        round.bettingOpenAtMs,
    ).toBe(
      ROULETTE_BETTING_WINDOW_MS,
    );
    expect(
      round.spinStartedAtMs,
    ).toBe(
      round.bettingCloseAtMs,
    );
    expect(
      round.nextRoundAtMs -
        round.resultAtMs,
    ).toBe(
      ROULETTE_RESULT_HOLD_MS,
    );
    expect(
      round.resultAtMs,
    ).toBeGreaterThan(
      round.spinStartedAtMs,
    );
  });

  it("derives every phase from server timestamps", () => {
    expect(
      getRouletteGlobalRoundPhase(
        round,
        round.bettingOpenAtMs - 1,
      ),
    ).toBe("scheduled");
    expect(
      getRouletteGlobalRoundPhase(
        round,
        round.bettingOpenAtMs,
      ),
    ).toBe("betting");
    expect(
      getRouletteGlobalRoundPhase(
        round,
        round.bettingCloseAtMs - 1,
      ),
    ).toBe("betting");
    expect(
      getRouletteGlobalRoundPhase(
        round,
        round.spinStartedAtMs,
      ),
    ).toBe("spinning");
    expect(
      getRouletteGlobalRoundPhase(
        round,
        round.resultAtMs,
      ),
    ).toBe("result");
    expect(
      getRouletteGlobalRoundPhase(
        round,
        round.nextRoundAtMs,
      ),
    ).toBe("complete");
  });

  it("hides the seed during betting and reveals it only after bets close", () => {
    const betting =
      createRouletteGlobalRoundSnapshot(
        round,
        round.bettingOpenAtMs +
          7_000,
      );
    const spinning =
      createRouletteGlobalRoundSnapshot(
        round,
        round.spinStartedAtMs +
          1,
      );

    expect(betting.phase).toBe(
      "betting",
    );
    expect(betting.seed).toBeNull();
    expect(betting.result).toBeNull();

    expect(spinning.phase).toBe(
      "spinning",
    );
    expect(spinning.seed).toBe(
      round.seed,
    );
    expect(
      spinning.result,
    ).toBeNull();
  });

  it("reveals the authoritative result only when the result phase begins", () => {
    const result =
      createRouletteGlobalRoundSnapshot(
        round,
        round.resultAtMs,
      );

    expect(result.phase).toBe(
      "result",
    );
    expect(result.seed).toBe(
      round.seed,
    );
    expect(result.result).toEqual(
      round.result,
    );
  });

  it("gives every viewer the same round snapshot for the same server time", () => {
    const nowMs =
      round.spinStartedAtMs +
      2_500;

    const firstViewer =
      createRouletteGlobalRoundSnapshot(
        round,
        nowMs,
      );
    const secondViewer =
      createRouletteGlobalRoundSnapshot(
        round,
        nowMs,
      );

    expect(firstViewer).toEqual(
      secondViewer,
    );
  });
});
