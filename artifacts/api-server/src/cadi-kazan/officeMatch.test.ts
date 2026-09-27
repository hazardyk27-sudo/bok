import { describe, expect, it } from "vitest";
import {
  OFFICE_MATCH_CELL_COUNT,
  OFFICE_MATCH_LOSS_WEIGHT_BPS,
  OFFICE_MATCH_ROLL_SCALE,
  OFFICE_MATCH_SYMBOLS,
  OFFICE_MATCH_TARGET_RTP_BPS,
  OFFICE_MATCH_WIN_RATE_BPS,
  createOfficeMatchBoard,
  getOfficeMatchTheoreticalRtpBps,
  selectOfficeMatchOutcome,
} from "./officeMatch";

function sequenceRandom(sequence: number[]) {
  let cursor = 0;
  return (maxExclusive: number) => {
    const raw = sequence[cursor % sequence.length] ?? 0;
    cursor += 1;
    return Math.abs(raw) % maxExclusive;
  };
}

function counts(values: string[]) {
  return values.reduce<Record<string, number>>((map, value) => {
    map[value] = (map[value] ?? 0) + 1;
    return map;
  }, {});
}

describe("The Office 6-cell outcome engine", () => {
  it("locks the approved 2x/5x/10x/20x/100x paytable at 96% RTP", () => {
    expect(OFFICE_MATCH_SYMBOLS.map(({ id, multiplierBps, winWeightBps, special }) => ({
      id,
      multiplierBps,
      winWeightBps,
      special,
    }))).toEqual([
      { id: "KEVIN", multiplierBps: 200, winWeightBps: 2_500, special: false },
      { id: "JIM", multiplierBps: 500, winWeightBps: 500, special: false },
      { id: "DWIGHT", multiplierBps: 1_000, winWeightBps: 100, special: false },
      { id: "STANLEY", multiplierBps: 2_000, winWeightBps: 30, special: false },
      { id: "MICHAEL", multiplierBps: 10_000, winWeightBps: 5, special: true },
    ]);

    expect(OFFICE_MATCH_WIN_RATE_BPS).toBe(3_135);
    expect(OFFICE_MATCH_LOSS_WEIGHT_BPS).toBe(6_865);
    expect(OFFICE_MATCH_WIN_RATE_BPS + OFFICE_MATCH_LOSS_WEIGHT_BPS).toBe(OFFICE_MATCH_ROLL_SCALE);
    expect(getOfficeMatchTheoreticalRtpBps()).toBe(OFFICE_MATCH_TARGET_RTP_BPS);
  });

  it("maps the exact 10,000-roll boundaries to the intended outcomes", () => {
    expect(selectOfficeMatchOutcome(0)).toMatchObject({ symbolId: "KEVIN", multiplierBps: 200 });
    expect(selectOfficeMatchOutcome(2_499)).toMatchObject({ symbolId: "KEVIN", multiplierBps: 200 });
    expect(selectOfficeMatchOutcome(2_500)).toMatchObject({ symbolId: "JIM", multiplierBps: 500 });
    expect(selectOfficeMatchOutcome(2_999)).toMatchObject({ symbolId: "JIM", multiplierBps: 500 });
    expect(selectOfficeMatchOutcome(3_000)).toMatchObject({ symbolId: "DWIGHT", multiplierBps: 1_000 });
    expect(selectOfficeMatchOutcome(3_099)).toMatchObject({ symbolId: "DWIGHT", multiplierBps: 1_000 });
    expect(selectOfficeMatchOutcome(3_100)).toMatchObject({ symbolId: "STANLEY", multiplierBps: 2_000 });
    expect(selectOfficeMatchOutcome(3_129)).toMatchObject({ symbolId: "STANLEY", multiplierBps: 2_000 });
    expect(selectOfficeMatchOutcome(3_130)).toMatchObject({ symbolId: "MICHAEL", multiplierBps: 10_000 });
    expect(selectOfficeMatchOutcome(3_134)).toMatchObject({ symbolId: "MICHAEL", multiplierBps: 10_000 });
    expect(selectOfficeMatchOutcome(3_135)).toEqual({ kind: "LOSS", multiplierBps: 0, symbolId: null });
    expect(selectOfficeMatchOutcome(9_999)).toEqual({ kind: "LOSS", multiplierBps: 0, symbolId: null });
  });

  it("makes Michael Scott 100x exactly 5 in 10,000, equivalent to 1 in 2,000", () => {
    const michaelRolls = Array.from({ length: OFFICE_MATCH_ROLL_SCALE }, (_, roll) => selectOfficeMatchOutcome(roll))
      .filter((outcome) => outcome.kind === "WIN" && outcome.symbolId === "MICHAEL");
    expect(michaelRolls).toHaveLength(5);
  });

  it.each(OFFICE_MATCH_SYMBOLS)("builds a six-cell $id win with exactly three matching symbols and no second triple", (symbol) => {
    const board = createOfficeMatchBoard(
      { kind: "WIN", symbolId: symbol.id, multiplierBps: symbol.multiplierBps },
      sequenceRandom([0, 2, 1, 3, 4, 0, 1, 2, 3]),
    );
    const resultCounts = counts(board);

    expect(board).toHaveLength(OFFICE_MATCH_CELL_COUNT);
    expect(resultCounts[symbol.id]).toBe(3);
    expect(Math.max(...Object.values(resultCounts))).toBe(3);
    expect(Object.entries(resultCounts).filter(([, count]) => count === 3)).toEqual([[symbol.id, 3]]);
  });

  it("builds loss boards with no symbol appearing three times", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const board = createOfficeMatchBoard(
        { kind: "LOSS", multiplierBps: 0, symbolId: null },
        sequenceRandom([seed, seed + 3, seed + 7, seed + 11, seed + 17, seed + 23, seed + 31, seed + 41, seed + 53]),
      );
      expect(board).toHaveLength(OFFICE_MATCH_CELL_COUNT);
      expect(Math.max(...Object.values(counts(board)))).toBeLessThanOrEqual(2);
    }
  });

  it("rejects invalid outcome rolls", () => {
    expect(() => selectOfficeMatchOutcome(-1)).toThrow("INVALID_OFFICE_OUTCOME_ROLL");
    expect(() => selectOfficeMatchOutcome(10_000)).toThrow("INVALID_OFFICE_OUTCOME_ROLL");
    expect(() => selectOfficeMatchOutcome(2.5)).toThrow("INVALID_OFFICE_OUTCOME_ROLL");
  });
});
