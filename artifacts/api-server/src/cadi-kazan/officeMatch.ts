import { randomInt } from "node:crypto";

export const OFFICE_MATCH_CELL_COUNT = 6;
export const OFFICE_MATCH_REQUIRED_MATCHES = 3;
export const OFFICE_POOL_SIZE = 75;

export const OFFICE_MATCH_SYMBOLS = [
  { id: "KEVIN", label: "Kevin", multiplierBps: 200, special: false },
  { id: "JIM", label: "Jim", multiplierBps: 500, special: false },
  { id: "DWIGHT", label: "Dwight", multiplierBps: 1_000, special: false },
  { id: "STANLEY", label: "Stanley", multiplierBps: 2_000, special: false },
  { id: "MICHAEL", label: "Michael Scott", multiplierBps: 10_000, special: true },
] as const;

export type OfficeMatchSymbolId = (typeof OFFICE_MATCH_SYMBOLS)[number]["id"];

export type OfficeMatchOutcome =
  | { kind: "LOSS"; multiplierBps: 0; symbolId: null }
  | { kind: "WIN"; multiplierBps: number; symbolId: OfficeMatchSymbolId };

export const OFFICE_POOL_DISTRIBUTION = [
  { symbolId: "MICHAEL", count: 1, multiplierBps: 10_000 },
  { symbolId: "STANLEY", count: 2, multiplierBps: 2_000 },
  { symbolId: "DWIGHT", count: 4, multiplierBps: 1_000 },
  { symbolId: "JIM", count: 8, multiplierBps: 500 },
  { symbolId: "KEVIN", count: 20, multiplierBps: 200 },
  { symbolId: null, count: 40, multiplierBps: 0 },
] as const satisfies readonly {
  symbolId: OfficeMatchSymbolId | null;
  count: number;
  multiplierBps: number;
}[];

type RandomIndex = (maxExclusive: number) => number;

function checkedRandomIndex(randomIndex: RandomIndex, maxExclusive: number) {
  const value = randomIndex(maxExclusive);
  if (!Number.isInteger(value) || value < 0 || value >= maxExclusive) {
    throw new Error("INVALID_OFFICE_RANDOM_INDEX");
  }
  return value;
}

function shuffle<T>(values: readonly T[], randomIndex: RandomIndex) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = checkedRandomIndex(randomIndex, index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createOfficeMatchBoard(
  outcome: OfficeMatchOutcome,
  randomIndex: RandomIndex = (maxExclusive) => randomInt(0, maxExclusive),
): OfficeMatchSymbolId[] {
  if (outcome.kind === "WIN") {
    const fillers = shuffle(
      OFFICE_MATCH_SYMBOLS
        .map((symbol) => symbol.id)
        .filter((symbolId) => symbolId !== outcome.symbolId),
      randomIndex,
    ).slice(0, OFFICE_MATCH_CELL_COUNT - OFFICE_MATCH_REQUIRED_MATCHES);

    return shuffle([
      outcome.symbolId,
      outcome.symbolId,
      outcome.symbolId,
      ...fillers,
    ], randomIndex);
  }

  // Two of each symbol is the hard ceiling for a losing ticket, so a loss
  // can never accidentally contain the winning three-of-a-kind.
  const lossPool = OFFICE_MATCH_SYMBOLS.flatMap((symbol) => [symbol.id, symbol.id]);
  return shuffle(lossPool, randomIndex).slice(0, OFFICE_MATCH_CELL_COUNT);
}

export type PreparedOfficePoolTicket = {
  outcome: OfficeMatchOutcome;
  cells: OfficeMatchSymbolId[];
};

export function createOfficePoolTickets(
  randomIndex: RandomIndex = (maxExclusive) => randomInt(0, maxExclusive),
): PreparedOfficePoolTicket[] {
  const outcomes: OfficeMatchOutcome[] = OFFICE_POOL_DISTRIBUTION.flatMap((entry) =>
    Array.from({ length: entry.count }, () => (
      entry.symbolId === null
        ? { kind: "LOSS" as const, multiplierBps: 0 as const, symbolId: null }
        : {
            kind: "WIN" as const,
            multiplierBps: entry.multiplierBps,
            symbolId: entry.symbolId,
          }
    )),
  );

  if (outcomes.length !== OFFICE_POOL_SIZE) throw new Error("INVALID_OFFICE_POOL_DISTRIBUTION");

  return shuffle(outcomes, randomIndex).map((outcome) => ({
    outcome,
    cells: createOfficeMatchBoard(outcome, randomIndex),
  }));
}

export function getOfficeMatchSymbol(symbolId: OfficeMatchSymbolId) {
  const symbol = OFFICE_MATCH_SYMBOLS.find((candidate) => candidate.id === symbolId);
  if (!symbol) throw new Error("INVALID_OFFICE_SYMBOL");
  return symbol;
}

export function resolveOfficeMatchReveal(
  cells: readonly OfficeMatchSymbolId[],
  revealedIndices: readonly number[],
): {
  completed: boolean;
  win: boolean;
  matchedSymbolId: OfficeMatchSymbolId | null;
  multiplierBps: number;
} {
  if (cells.length !== OFFICE_MATCH_CELL_COUNT) throw new Error("INVALID_OFFICE_BOARD");

  const counts = new Map<OfficeMatchSymbolId, number>();
  const uniqueRevealedIndices = [...new Set(revealedIndices)];
  for (const index of uniqueRevealedIndices) {
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) throw new Error("INVALID_OFFICE_REVEAL_INDEX");
    const symbolId = cells[index];
    getOfficeMatchSymbol(symbolId);
    counts.set(symbolId, (counts.get(symbolId) ?? 0) + 1);
  }

  for (const symbol of OFFICE_MATCH_SYMBOLS) {
    if ((counts.get(symbol.id) ?? 0) >= OFFICE_MATCH_REQUIRED_MATCHES) {
      return {
        completed: true,
        win: true,
        matchedSymbolId: symbol.id,
        multiplierBps: symbol.multiplierBps,
      };
    }
  }

  const completed = uniqueRevealedIndices.length >= OFFICE_MATCH_CELL_COUNT;
  return {
    completed,
    win: false,
    matchedSymbolId: null,
    multiplierBps: 0,
  };
}
