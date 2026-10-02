import { describe, expect, it } from "vitest";
import {
  OFFICE_MATCH_CELL_COUNT,
  OFFICE_MATCH_SYMBOLS,
  OFFICE_POOL_DISTRIBUTION,
  OFFICE_POOL_SIZE,
  createOfficeMatchBoard,
  createOfficePoolTickets,
  resolveOfficeMatchReveal,
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

describe("The Office 75-ticket pool engine", () => {
  it("locks the approved 75-ticket distribution", () => {
    expect(OFFICE_POOL_SIZE).toBe(75);
    expect(OFFICE_POOL_DISTRIBUTION).toEqual([
      { symbolId: "MICHAEL", count: 1, multiplierBps: 10_000 },
      { symbolId: "STANLEY", count: 2, multiplierBps: 2_000 },
      { symbolId: "DWIGHT", count: 4, multiplierBps: 1_000 },
      { symbolId: "JIM", count: 8, multiplierBps: 500 },
      { symbolId: "KEVIN", count: 20, multiplierBps: 200 },
      { symbolId: null, count: 40, multiplierBps: 0 },
    ]);
    expect(OFFICE_POOL_DISTRIBUTION.reduce((sum, entry) => sum + entry.count, 0)).toBe(75);
  });

  it("prepares exactly 75 complete cards before any card is claimed", () => {
    const tickets = createOfficePoolTickets(sequenceRandom([7, 3, 19, 2, 41, 5, 11, 23, 31]));
    expect(tickets).toHaveLength(75);

    const outcomeCounts = {
      KEVIN: 0,
      JIM: 0,
      DWIGHT: 0,
      STANLEY: 0,
      MICHAEL: 0,
      LOSS: 0,
    };
    for (const ticket of tickets) {
      expect(ticket.cells).toHaveLength(OFFICE_MATCH_CELL_COUNT);
      if (ticket.outcome.kind === "LOSS") {
        outcomeCounts.LOSS += 1;
        expect(Math.max(...Object.values(counts(ticket.cells)))).toBeLessThanOrEqual(2);
      } else {
        outcomeCounts[ticket.outcome.symbolId] += 1;
        expect(counts(ticket.cells)[ticket.outcome.symbolId]).toBe(3);
      }
    }

    expect(outcomeCounts).toEqual({
      KEVIN: 20,
      JIM: 8,
      DWIGHT: 4,
      STANLEY: 2,
      MICHAEL: 1,
      LOSS: 40,
    });
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

  it("settles immediately on the third matching revealed symbol", () => {
    const board = ["DWIGHT", "KEVIN", "DWIGHT", "JIM", "STANLEY", "DWIGHT"] as const;

    expect(resolveOfficeMatchReveal(board, [0, 1, 2, 3])).toEqual({
      completed: false,
      win: false,
      matchedSymbolId: null,
      multiplierBps: 0,
    });

    expect(resolveOfficeMatchReveal(board, [0, 1, 2, 3, 5])).toEqual({
      completed: true,
      win: true,
      matchedSymbolId: "DWIGHT",
      multiplierBps: 1_000,
    });
  });

  it("settles a loss only after all six cells are revealed", () => {
    const board = ["KEVIN", "JIM", "DWIGHT", "STANLEY", "KEVIN", "JIM"] as const;

    expect(resolveOfficeMatchReveal(board, [0, 1, 2, 3, 4])).toMatchObject({
      completed: false,
      win: false,
      multiplierBps: 0,
    });

    expect(resolveOfficeMatchReveal(board, [0, 1, 2, 3, 4, 5])).toEqual({
      completed: true,
      win: false,
      matchedSymbolId: null,
      multiplierBps: 0,
    });
  });
});
