import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_RECENT_RESULT_LIMIT,
  appendRouletteRecentResult,
  getRouletteResultTone,
  normalizeRouletteRecentResults,
} from "./recentResults";

describe("roulette recent result history", () => {
  it("keeps only the newest eleven valid roulette numbers", () => {
    const history = normalizeRouletteRecentResults([
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      37,
      "12",
    ]);

    expect(history).toHaveLength(
      ROULETTE_RECENT_RESULT_LIMIT,
    );
    expect(history).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
    ]);
  });

  it("appends the latest result and drops the oldest", () => {
    const history = [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
    ];

    expect(
      appendRouletteRecentResult(
        history,
        32,
      ),
    ).toEqual([
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      32,
    ]);
  });

  it("maps zero, red and black results to display tones", () => {
    expect(getRouletteResultTone(0)).toBe("green");
    expect(getRouletteResultTone(32)).toBe("red");
    expect(getRouletteResultTone(15)).toBe("black");
  });
});
