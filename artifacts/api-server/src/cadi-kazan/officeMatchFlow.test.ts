import { describe, expect, it } from "vitest";
import {
  OFFICE_MATCH_SYMBOLS,
  OFFICE_POOL_DISTRIBUTION,
  OFFICE_POOL_SIZE,
  createOfficeMatchBoard,
  createOfficePoolTickets,
  resolveOfficeMatchReveal,
  type OfficeMatchSymbolId,
} from "./officeMatch";
import {
  getCashoutPayoutCents,
  getPreparedReveal,
  getVisibleOfficeCells,
} from "./types";

function deterministicRandom(seed: number) {
  let state = seed >>> 0;
  return (maxExclusive: number) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % maxExclusive;
  };
}

function winningRevealOrder(board: readonly OfficeMatchSymbolId[], symbolId: OfficeMatchSymbolId) {
  const winnerIndices = board
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value === symbolId)
    .map((entry) => entry.index);
  const otherIndices = board
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value !== symbolId)
    .map((entry) => entry.index);

  return [
    winnerIndices[0],
    otherIndices[0],
    winnerIndices[1],
    otherIndices[1],
    winnerIndices[2],
  ];
}

describe("The Office full outcome/reveal contract", () => {
  it("builds every 75-ticket pool with the exact approved distribution", () => {
    const tickets = createOfficePoolTickets(deterministicRandom(20261002));
    expect(tickets).toHaveLength(OFFICE_POOL_SIZE);
    expect(OFFICE_POOL_DISTRIBUTION).toEqual([
      { symbolId: "MICHAEL", count: 1, multiplierBps: 10_000 },
      { symbolId: "STANLEY", count: 2, multiplierBps: 2_000 },
      { symbolId: "DWIGHT", count: 4, multiplierBps: 1_000 },
      { symbolId: "JIM", count: 8, multiplierBps: 500 },
      { symbolId: "KEVIN", count: 20, multiplierBps: 200 },
      { symbolId: null, count: 40, multiplierBps: 0 },
    ]);

    const counts = {
      KEVIN: 0,
      JIM: 0,
      DWIGHT: 0,
      STANLEY: 0,
      MICHAEL: 0,
      LOSS: 0,
    };
    for (const ticket of tickets) {
      if (ticket.outcome.kind === "LOSS") counts.LOSS += 1;
      else counts[ticket.outcome.symbolId] += 1;
    }
    expect(counts).toEqual({
      KEVIN: 20,
      JIM: 8,
      DWIGHT: 4,
      STANLEY: 2,
      MICHAEL: 1,
      LOSS: 40,
    });
  });

  it.each(OFFICE_MATCH_SYMBOLS)(
    "settles the complete $id path on the third matching scratch and pays the configured multiplier",
    (symbol) => {
      for (let seed = 1; seed <= 24; seed += 1) {
        const board = createOfficeMatchBoard(
          { kind: "WIN", symbolId: symbol.id, multiplierBps: symbol.multiplierBps },
          deterministicRandom(seed),
        );
        const revealOrder = winningRevealOrder(board, symbol.id);

        const beforeThird = resolveOfficeMatchReveal(board, revealOrder.slice(0, 4));
        expect(beforeThird).toEqual({
          completed: false,
          win: false,
          matchedSymbolId: null,
          multiplierBps: 0,
        });

        const settled = resolveOfficeMatchReveal(board, revealOrder);
        expect(settled).toEqual({
          completed: true,
          win: true,
          matchedSymbolId: symbol.id,
          multiplierBps: symbol.multiplierBps,
        });

        expect(getCashoutPayoutCents(100, settled.multiplierBps)).toBe(symbol.multiplierBps);
        expect(getCashoutPayoutCents(100_000_000, settled.multiplierBps)).toBe(
          Math.floor((100_000_000 * symbol.multiplierBps) / 100),
        );
      }
    },
  );

  it("prepares exactly one touched cell without changing the board or settlement state", () => {
    const board: OfficeMatchSymbolId[] = ["MICHAEL", "KEVIN", "JIM", "DWIGHT", "STANLEY", "MICHAEL"];
    expect(getPreparedReveal("round-1", "OFFICE_MATCH_6", 1, [], board)).toEqual({
      roundId: "round-1",
      cellIndex: 1,
      mode: "OFFICE_MATCH_6",
      kind: "OFFICE",
      symbolId: "KEVIN",
    });
    expect(getPreparedReveal("round-2", "ADVANCED", 4, [4], [])).toEqual({
      roundId: "round-2",
      cellIndex: 4,
      mode: "ADVANCED",
      kind: "BOMB",
    });
    expect(getPreparedReveal("round-3", "STANDARD", 2, [0], [])).toEqual({
      roundId: "round-3",
      cellIndex: 2,
      mode: "STANDARD",
      kind: "SAFE",
    });
  });

  it("never leaks hidden Office symbols while the round is active", () => {
    const board: OfficeMatchSymbolId[] = [
      "MICHAEL",
      "KEVIN",
      "JIM",
      "DWIGHT",
      "STANLEY",
      "MICHAEL",
    ];

    expect(getVisibleOfficeCells("ACTIVE", [], board)).toEqual([]);
    expect(getVisibleOfficeCells("ACTIVE", [1, 3], board)).toEqual([
      { index: 1, symbolId: "KEVIN" },
      { index: 3, symbolId: "DWIGHT" },
    ]);
    expect(getVisibleOfficeCells("COMPLETED", [1, 3], board)).toEqual(
      board.map((symbolId, index) => ({ index, symbolId })),
    );
  });

  it("does not let duplicate reveal indices manufacture a false triple", () => {
    const board: OfficeMatchSymbolId[] = [
      "KEVIN",
      "JIM",
      "DWIGHT",
      "STANLEY",
      "MICHAEL",
      "JIM",
    ];

    expect(resolveOfficeMatchReveal(board, [1, 1, 1])).toEqual({
      completed: false,
      win: false,
      matchedSymbolId: null,
      multiplierBps: 0,
    });
  });

  it("keeps loss tickets alive through five unique scratches and closes them on the sixth", () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const board = createOfficeMatchBoard(
        { kind: "LOSS", multiplierBps: 0, symbolId: null },
        deterministicRandom(seed),
      );

      expect(resolveOfficeMatchReveal(board, [0, 1, 2, 3, 4])).toEqual({
        completed: false,
        win: false,
        matchedSymbolId: null,
        multiplierBps: 0,
      });

      expect(resolveOfficeMatchReveal(board, [0, 1, 2, 3, 4, 5])).toEqual({
        completed: true,
        win: false,
        matchedSymbolId: null,
        multiplierBps: 0,
      });
    }
  });
});
