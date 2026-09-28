import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_RESULT_HOLD_MS,
  canEditRouletteBets,
  canStartRouletteSpin,
  getRoulettePhaseStatus,
} from "./scenePhase";

describe("roulette scene focus phases", () => {
  it("allows wager editing only while betting is open", () => {
    expect(
      canEditRouletteBets("betting"),
    ).toBe(true);
    expect(
      canEditRouletteBets("spinning"),
    ).toBe(false);
    expect(
      canEditRouletteBets("settled"),
    ).toBe(false);
  });

  it("allows a new spin only from the betting phase", () => {
    expect(
      canStartRouletteSpin("betting"),
    ).toBe(true);
    expect(
      canStartRouletteSpin("spinning"),
    ).toBe(false);
    expect(
      canStartRouletteSpin("settled"),
    ).toBe(false);
  });

  it("holds the result long enough to read before reopening betting", () => {
    expect(
      ROULETTE_RESULT_HOLD_MS,
    ).toBeGreaterThanOrEqual(1200);
    expect(
      getRoulettePhaseStatus(
        "settled",
        17,
      ),
    ).toBe("RESULT 17");
    expect(
      getRoulettePhaseStatus(
        "betting",
      ),
    ).toBe("BETTING OPEN");
  });
});
