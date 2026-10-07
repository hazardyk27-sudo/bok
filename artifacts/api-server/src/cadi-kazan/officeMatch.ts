import { randomInt } from "node:crypto";

export const OFFICE_MATCH_CELL_COUNT = 6;
export const OFFICE_MATCH_REQUIRED_MATCHES = 3;
export const OFFICE_POOL_SIZE = 400;

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

// 400-card finite pool. Buying every card costs 400 stakes and returns exactly
// 500 stakes, so the complete-pool RTP is 125% and full-pool profit is 25%.
export const OFFICE_POOL_DISTRIBUTION = [
  { symbolId: "MICHAEL", count: 1, multiplierBps: 10_000 },
  { symbolId: "STANLEY", count: 3, multiplierBps: 2_000 },
  { symbolId: "DWIGHT", count: 5, multiplierBps: 1_000 },
  { symbolId: "JIM", count: 18, multiplierBps: 500 },
  { symbolId: "KEVIN", count: 100, multiplierBps: 200 },
  { symbolId: null, count: 273, multiplierBps: 0 },
] as const satisfies readonly {
  symbolId: OfficeMatchSymbolId | null;
  count: number;
  multiplierBps: number;
}[];

// Visual-only Michael distribution for the 399 non-jackpot tickets.
// It is intentionally separate from OFFICE_POOL_DISTRIBUTION so changing how
// often Michael is seen can never change the 1-in-400 100x prize probability.
// The visual frequency stays at the previously approved level: 12% single-Michael
// teases and 2.25% double-Michael teases, with the jackpot bringing cards that show
// Michael to 58/400 (14.5%) and cards with 2+ Michael to 10/400 (2.5%).
export const OFFICE_MICHAEL_TEASE_DISTRIBUTION = [
  { michaelCount: 2, count: 9 },
  { michaelCount: 1, count: 48 },
  { michaelCount: 0, count: 342 },
] as const;

export type OfficeMichaelTeaseCount = (typeof OFFICE_MICHAEL_TEASE_DISTRIBUTION)[number]["michaelCount"];

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

function assertMichaelTeaseCount(value: number): asserts value is OfficeMichaelTeaseCount {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error("INVALID_OFFICE_MICHAEL_TEASE_COUNT");
  }
}

function regularSymbolsExcluding(excludedSymbolId: OfficeMatchSymbolId | null) {
  return OFFICE_MATCH_SYMBOLS
    .map((symbol) => symbol.id)
    .filter((symbolId) => symbolId !== "MICHAEL" && symbolId !== excludedSymbolId);
}

export function createOfficeMatchBoard(
  outcome: OfficeMatchOutcome,
  randomIndex: RandomIndex = (maxExclusive) => randomInt(0, maxExclusive),
  michaelTeaseCount: OfficeMichaelTeaseCount = 0,
): OfficeMatchSymbolId[] {
  assertMichaelTeaseCount(michaelTeaseCount);

  if (outcome.kind === "WIN") {
    if (outcome.symbolId === "MICHAEL") {
      if (michaelTeaseCount !== 0) throw new Error("MICHAEL_JACKPOT_CANNOT_HAVE_TEASE_COUNT");
      const fillers = shuffle(
        regularSymbolsExcluding("MICHAEL"),
        randomIndex,
      ).slice(0, OFFICE_MATCH_CELL_COUNT - OFFICE_MATCH_REQUIRED_MATCHES);

      return shuffle([
        outcome.symbolId,
        outcome.symbolId,
        outcome.symbolId,
        ...fillers,
      ], randomIndex);
    }

    const fillerCount = OFFICE_MATCH_CELL_COUNT - OFFICE_MATCH_REQUIRED_MATCHES - michaelTeaseCount;
    const fillers = shuffle(
      regularSymbolsExcluding(outcome.symbolId),
      randomIndex,
    ).slice(0, fillerCount);

    return shuffle([
      outcome.symbolId,
      outcome.symbolId,
      outcome.symbolId,
      ...Array.from({ length: michaelTeaseCount }, () => "MICHAEL" as const),
      ...fillers,
    ], randomIndex);
  }

  // Loss boards may show Michael once or twice as a genuine near-miss tease,
  // but every symbol is still capped below three so a loss can never become a win.
  const regularCellCount = OFFICE_MATCH_CELL_COUNT - michaelTeaseCount;
  const lossPool = regularSymbolsExcluding(null)
    .flatMap((symbolId) => [symbolId, symbolId]);
  const regularCells = shuffle(lossPool, randomIndex).slice(0, regularCellCount);

  return shuffle([
    ...regularCells,
    ...Array.from({ length: michaelTeaseCount }, () => "MICHAEL" as const),
  ], randomIndex);
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

  const nonJackpotTeaseCounts = OFFICE_MICHAEL_TEASE_DISTRIBUTION.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.michaelCount),
  );
  if (nonJackpotTeaseCounts.length !== OFFICE_POOL_SIZE - 1) {
    throw new Error("INVALID_OFFICE_MICHAEL_TEASE_DISTRIBUTION");
  }

  const shuffledOutcomes = shuffle(outcomes, randomIndex);
  const shuffledTeaseCounts = shuffle(nonJackpotTeaseCounts, randomIndex);
  let teaseCursor = 0;

  const tickets = shuffledOutcomes.map((outcome) => {
    const michaelTeaseCount = outcome.kind === "WIN" && outcome.symbolId === "MICHAEL"
      ? 0
      : shuffledTeaseCounts[teaseCursor++]!;

    return {
      outcome,
      cells: createOfficeMatchBoard(outcome, randomIndex, michaelTeaseCount),
    };
  });

  if (teaseCursor !== OFFICE_POOL_SIZE - 1) {
    throw new Error("OFFICE_MICHAEL_TEASE_ASSIGNMENT_MISMATCH");
  }

  return tickets;
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
