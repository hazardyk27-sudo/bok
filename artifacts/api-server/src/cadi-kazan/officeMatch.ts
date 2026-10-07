import { randomInt } from "node:crypto";

export const OFFICE_MATCH_CELL_COUNT = 6;
export const OFFICE_MATCH_REQUIRED_MATCHES = 3;
export const OFFICE_POOL_SIZE = 400;
export const OFFICE_MICHAEL_JACKPOT_ODDS = 300;

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

// Base finite pool only. Michael is intentionally excluded from this table and
// is resolved by an independent 1-in-300 jackpot draw before a base ticket is
// claimed. Buying all 400 base tickets costs 400 stakes and returns 368 stakes.
export const OFFICE_POOL_DISTRIBUTION = [
  { symbolId: "STANLEY", count: 3, multiplierBps: 2_000 },
  { symbolId: "DWIGHT", count: 5, multiplierBps: 1_000 },
  { symbolId: "JIM", count: 10, multiplierBps: 500 },
  { symbolId: "KEVIN", count: 104, multiplierBps: 200 },
  { symbolId: null, count: 278, multiplierBps: 0 },
] as const satisfies readonly {
  symbolId: OfficeMatchSymbolId | null;
  count: number;
  multiplierBps: number;
}[];

// Visual-only Michael teasers for all 400 non-jackpot base tickets. The extra
// zero-Michael card keeps the overall visible Michael frequency near the prior
// 14.5% level after the independent 1-in-300 jackpot overlay is included.
export const OFFICE_MICHAEL_TEASE_DISTRIBUTION = [
  { michaelCount: 2, count: 9 },
  { michaelCount: 1, count: 48 },
  { michaelCount: 0, count: 343 },
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

export function drawOfficeMichaelJackpot(
  randomIndex: RandomIndex = (maxExclusive) => randomInt(0, maxExclusive),
) {
  return checkedRandomIndex(randomIndex, OFFICE_MICHAEL_JACKPOT_ODDS) === 0;
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

  const regularCellCount = OFFICE_MATCH_CELL_COUNT - michaelTeaseCount;
  const lossPool = regularSymbolsExcluding(null)
    .flatMap((symbolId) => [symbolId, symbolId]);
  const regularCells = shuffle(lossPool, randomIndex).slice(0, regularCellCount);

  return shuffle([
    ...regularCells,
    ...Array.from({ length: michaelTeaseCount }, () => "MICHAEL" as const),
  ], randomIndex);
}

export function createOfficeMichaelJackpotBoard(
  randomIndex: RandomIndex = (maxExclusive) => randomInt(0, maxExclusive),
) {
  return createOfficeMatchBoard(
    { kind: "WIN", symbolId: "MICHAEL", multiplierBps: 10_000 },
    randomIndex,
    0,
  );
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

  const teaseCounts = OFFICE_MICHAEL_TEASE_DISTRIBUTION.flatMap((entry) =>
    Array.from({ length: entry.count }, () => entry.michaelCount),
  );
  if (teaseCounts.length !== OFFICE_POOL_SIZE) {
    throw new Error("INVALID_OFFICE_MICHAEL_TEASE_DISTRIBUTION");
  }

  const shuffledOutcomes = shuffle(outcomes, randomIndex);
  const shuffledTeaseCounts = shuffle(teaseCounts, randomIndex);

  return shuffledOutcomes.map((outcome, index) => ({
    outcome,
    cells: createOfficeMatchBoard(outcome, randomIndex, shuffledTeaseCounts[index]!),
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
