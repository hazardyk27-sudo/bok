import {
  describe,
  expect,
  it,
} from "vitest";
import {
  ROULETTE_COLUMN_BETS,
  ROULETTE_DOZEN_BETS,
  ROULETTE_OUTSIDE_BETS,
  ROULETTE_STRAIGHT_BETS,
  getStraightBetColorClass,
  renderRouletteBetTable,
} from "./betTable";

describe("roulette betting table", () => {
  it("contains the complete European straight-up layout", () => {
    expect(
      ROULETTE_STRAIGHT_BETS,
    ).toHaveLength(37);
    expect(
      ROULETTE_STRAIGHT_BETS[0],
    ).toMatchObject({
      id: "straight-0",
      number: 0,
    });
    expect(
      ROULETTE_STRAIGHT_BETS[36],
    ).toMatchObject({
      id: "straight-36",
      number: 36,
    });
  });

  it("contains the classic outside, dozen and column groups", () => {
    expect(ROULETTE_COLUMN_BETS).toHaveLength(3);
    expect(ROULETTE_DOZEN_BETS.map((bet) => bet.id)).toEqual([
      "dozen-1",
      "dozen-2",
      "dozen-3",
    ]);
    expect(ROULETTE_OUTSIDE_BETS.map((bet) => bet.id)).toEqual([
      "low",
      "even",
      "red",
      "black",
      "odd",
      "high",
    ]);
  });

  it("uses canonical roulette colors for straight-up cells", () => {
    expect(getStraightBetColorClass(0)).toBe("is-green");
    expect(getStraightBetColorClass(32)).toBe("is-red");
    expect(getStraightBetColorClass(15)).toBe("is-black");
  });

  it("renders touch targets for every core betting area", () => {
    const markup = renderRouletteBetTable();

    expect(markup).toContain('data-bet-id="straight-0"');
    expect(markup).toContain('data-bet-id="straight-36"');
    expect(markup).toContain('data-bet-id="dozen-1"');
    expect(markup).toContain('data-bet-id="column-1"');
    expect(markup).toContain('data-bet-id="red"');
    expect(markup).toContain('data-bet-id="black"');
  });
});
