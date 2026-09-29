import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_BETTING_WINDOW_MS,
  ROULETTE_RESULT_HOLD_MS,
  canEditRouletteBets,
  canStartRouletteSpin,
  getRouletteBettingSecondsRemaining,
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

  it("counts a ten second betting window down to zero", () => {
    const deadline = 20_000;

    expect(
      ROULETTE_BETTING_WINDOW_MS,
    ).toBe(10_000);
    expect(
      getRouletteBettingSecondsRemaining(
        deadline,
        10_000,
      ),
    ).toBe(10);
    expect(
      getRouletteBettingSecondsRemaining(
        deadline,
        11_000,
      ),
    ).toBe(9);
    expect(
      getRouletteBettingSecondsRemaining(
        deadline,
        19_999,
      ),
    ).toBe(1);
    expect(
      getRouletteBettingSecondsRemaining(
        deadline,
        20_000,
      ),
    ).toBe(0);
  });

  it("holds the result long enough to read before reopening betting", () => {
    expect(
      ROULETTE_RESULT_HOLD_MS,
    ).toBe(2200);
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
