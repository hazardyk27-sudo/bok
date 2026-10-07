import { describe, expect, it } from "vitest";
import {
  OFFICE_MATCH_CELL_COUNT,
  OFFICE_MATCH_SYMBOLS,
  OFFICE_MICHAEL_TEASE_DISTRIBUTION,
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

describe("The Office 400-ticket pool engine", () => {
  it("locks the approved 400-ticket prize distribution", () => {
    expect(OFFICE_POOL_SIZE).toBe(400);
    expect(OFFICE_POOL_DISTRIBUTION).toEqual([
      { symbolId: "MICHAEL", count: 1, multiplierBps: 10_000 },
      { symbolId: "STANLEY", count: 3, multiplierBps: 2_000 },
      { symbolId: "DWIGHT", count: 5, multiplierBps: 1_000 },
      { symbolId: "JIM", count: 10, multiplierBps: 500 },
      { symbolId: "KEVIN", count: 120, multiplierBps: 200 },
      { symbolId: null, count: 261, multiplierBps: 0 },
    ]);
    expect(OFFICE_POOL_DISTRIBUTION.reduce((sum, entry) => sum + entry.count, 0)).toBe(400);
  });

  it("locks Michael visual frequency separately from prize odds", () => {
    expect(OFFICE_MICHAEL_TEASE_DISTRIBUTION).toEqual([
      { michaelCount: 2, count: 9 },
      { michaelCount: 1, count: 48 },
      { michaelCount: 0, count: 342 },
    ]);
    expect(OFFICE_MICHAEL_TEASE_DISTRIBUTION.reduce((sum, entry) => sum + entry.count, 0)).toBe(399);
  });

  it("locks exactly 500x return from 400 stakes: 125% pool RTP and 34.75% hit rate", () => {
    const totalReturnBps = OFFICE_POOL_DISTRIBUTION.reduce(
      (sum, entry) => sum + entry.count * entry.multiplierBps,
      0,
    );
    const winningTickets = OFFICE_POOL_DISTRIBUTION
      .filter((entry) => entry.symbolId !== null)
      .reduce((sum, entry) => sum + entry.count, 0);

    expect(totalReturnBps).toBe(50_000);
    expect(totalReturnBps / OFFICE_POOL_SIZE).toBe(125);
    expect(winningTickets).toBe(139);
    expect(winningTickets / OFFICE_POOL_SIZE).toBe(0.3475);
  });

  it("prepares exactly 400 complete cards with exact prize and Michael-visibility contracts", () => {
    const tickets = createOfficePoolTickets(sequenceRandom([7, 3, 19, 2, 41, 5, 11, 23, 31]));
    expect(tickets).toHaveLength(400);

    const outcomeCounts = {
      KEVIN: 0,
      JIM: 0,
      DWIGHT: 0,
      STANLEY: 0,
      MICHAEL: 0,
      LOSS: 0,
    };
    const michaelCardHistogram = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
    } as Record<number, number>;

    for (const ticket of tickets) {
      expect(ticket.cells).toHaveLength(OFFICE_MATCH_CELL_COUNT);
      const resultCounts = counts(ticket.cells);
      const michaelCount = resultCounts.MICHAEL ?? 0;
      michaelCardHistogram[michaelCount] = (michaelCardHistogram[michaelCount] ?? 0) + 1;

      if (ticket.outcome.kind === "LOSS") {
        outcomeCounts.LOSS += 1;
        expect(Math.max(...Object.values(resultCounts))).toBeLessThanOrEqual(2);
      } else {
        outcomeCounts[ticket.outcome.symbolId] += 1;
        expect(resultCounts[ticket.outcome.symbolId]).toBe(3);
        expect(Object.entries(resultCounts).filter(([, count]) => count === 3)).toEqual([
          [ticket.outcome.symbolId, 3],
        ]);
      }
    }

    expect(outcomeCounts).toEqual({
      KEVIN: 120,
      JIM: 10,
      DWIGHT: 5,
      STANLEY: 3,
      MICHAEL: 1,
      LOSS: 261,
    });

    expect(michaelCardHistogram).toEqual({
      0: 342,
      1: 48,
      2: 9,
      3: 1,
    });
    expect(tickets.filter((ticket) => ticket.cells.includes("MICHAEL"))).toHaveLength(58);
    expect(tickets.reduce((sum, ticket) => sum + (counts(ticket.cells).MICHAEL ?? 0), 0)).toBe(69);
    expect(tickets.filter((ticket) => (counts(ticket.cells).MICHAEL ?? 0) === 3)).toHaveLength(1);
    expect(tickets.find((ticket) => (counts(ticket.cells).MICHAEL ?? 0) === 3)?.outcome).toEqual({
      kind: "WIN",
      symbolId: "MICHAEL",
      multiplierBps: 10_000,
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
    if (symbol.id === "MICHAEL") expect(resultCounts.MICHAEL).toBe(3);
    else expect(board).not.toContain("MICHAEL");
  });

  it("supports one- and two-Michael teases on non-jackpot winning cards without changing the winner", () => {
    for (const michaelTeaseCount of [1, 2] as const) {
      const board = createOfficeMatchBoard(
        { kind: "WIN", symbolId: "JIM", multiplierBps: 500 },
        sequenceRandom([7, 1, 5, 2, 11, 3, 17]),
        michaelTeaseCount,
      );
      const resultCounts = counts(board);

      expect(resultCounts.JIM).toBe(3);
      expect(resultCounts.MICHAEL).toBe(michaelTeaseCount);
      expect(Object.entries(resultCounts).filter(([, count]) => count === 3)).toEqual([["JIM", 3]]);
    }
  });

  it("supports one- and two-Michael teases on losing cards without creating any winner", () => {
    for (const michaelTeaseCount of [1, 2] as const) {
      for (let seed = 0; seed < 50; seed += 1) {
        const board = createOfficeMatchBoard(
          { kind: "LOSS", multiplierBps: 0, symbolId: null },
          sequenceRandom([seed, seed + 3, seed + 7, seed + 11, seed + 17, seed + 23, seed + 31]),
          michaelTeaseCount,
        );
        const resultCounts = counts(board);

        expect(resultCounts.MICHAEL).toBe(michaelTeaseCount);
        expect(Math.max(...Object.values(resultCounts))).toBeLessThanOrEqual(2);
      }
    }
  });

  it("keeps default loss-board generation below three matches", () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const board = createOfficeMatchBoard(
        { kind: "LOSS", multiplierBps: 0, symbolId: null },
        sequenceRandom([seed, seed + 3, seed + 7, seed + 11, seed + 17, seed + 23, seed + 31, seed + 41, seed + 53]),
      );
      expect(board).toHaveLength(OFFICE_MATCH_CELL_COUNT);
      expect(Math.max(...Object.values(counts(board)))).toBeLessThanOrEqual(2);
      expect(board).not.toContain("MICHAEL");
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
