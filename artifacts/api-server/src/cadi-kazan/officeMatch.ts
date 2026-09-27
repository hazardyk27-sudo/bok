import { randomInt } from "node:crypto";

export const OFFICE_MATCH_CELL_COUNT = 6;
export const OFFICE_MATCH_REQUIRED_MATCHES = 3;
export const OFFICE_MATCH_TARGET_RTP_BPS = 9_600;
export const OFFICE_MATCH_ROLL_SCALE = 10_000;

export const OFFICE_MATCH_SYMBOLS = [
  { id: "KEVIN", label: "Kevin", multiplierBps: 200, winWeightBps: 2_500, special: false },
  { id: "JIM", label: "Jim", multiplierBps: 500, winWeightBps: 500, special: false },
  { id: "DWIGHT", label: "Dwight", multiplierBps: 1_000, winWeightBps: 100, special: false },
  { id: "STANLEY", label: "Stanley", multiplierBps: 2_000, winWeightBps: 30, special: false },
  { id: "MICHAEL", label: "Michael Scott", multiplierBps: 10_000, winWeightBps: 5, special: true },
] as const;

export type OfficeMatchSymbolId = (typeof OFFICE_MATCH_SYMBOLS)[number]["id"];

export type OfficeMatchOutcome =
  | { kind: "LOSS"; multiplierBps: 0; symbolId: null }
  | { kind: "WIN"; multiplierBps: number; symbolId: OfficeMatchSymbolId };

const OFFICE_MATCH_TOTAL_WIN_WEIGHT_BPS = OFFICE_MATCH_SYMBOLS.reduce(
  (total, symbol) => total + symbol.winWeightBps,
  0,
);

export const OFFICE_MATCH_LOSS_WEIGHT_BPS = OFFICE_MATCH_ROLL_SCALE - OFFICE_MATCH_TOTAL_WIN_WEIGHT_BPS;
export const OFFICE_MATCH_WIN_RATE_BPS = OFFICE_MATCH_TOTAL_WIN_WEIGHT_BPS;

export function getOfficeMatchTheoreticalRtpBps() {
  return OFFICE_MATCH_SYMBOLS.reduce(
    (rtpBps, symbol) => rtpBps + symbol.winWeightBps * (symbol.multiplierBps / 100),
    0,
  );
}

export function selectOfficeMatchOutcome(roll: number): OfficeMatchOutcome {
  if (!Number.isInteger(roll) || roll < 0 || roll >= OFFICE_MATCH_ROLL_SCALE) {
    throw new Error("INVALID_OFFICE_OUTCOME_ROLL");
  }

  let cursor = 0;
  for (const symbol of OFFICE_MATCH_SYMBOLS) {
    cursor += symbol.winWeightBps;
    if (roll < cursor) {
      return {
        kind: "WIN",
        multiplierBps: symbol.multiplierBps,
        symbolId: symbol.id,
      };
    }
  }

  return { kind: "LOSS", multiplierBps: 0, symbolId: null };
}

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

  const lossPool = OFFICE_MATCH_SYMBOLS.flatMap((symbol) => [symbol.id, symbol.id]);
  return shuffle(lossPool, randomIndex).slice(0, OFFICE_MATCH_CELL_COUNT);
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
  for (const index of revealedIndices) {
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

  const completed = new Set(revealedIndices).size >= OFFICE_MATCH_CELL_COUNT;
  return {
    completed,
    win: false,
    matchedSymbolId: null,
    multiplierBps: 0,
  };
}

export function createRandomOfficeMatchTicket(): {
  outcome: OfficeMatchOutcome;
  cells: OfficeMatchSymbolId[];
} {
  const outcome = selectOfficeMatchOutcome(randomInt(0, OFFICE_MATCH_ROLL_SCALE));
  return {
    outcome,
    cells: createOfficeMatchBoard(outcome),
  };
}
