import { RED_NUMBERS } from "./config";

export const ROULETTE_RECENT_RESULT_LIMIT = 11;
export type RouletteResultTone =
  | "green"
  | "red"
  | "black";

export function isRouletteResultNumber(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 36
  );
}

export function normalizeRouletteRecentResults(
  value: unknown,
): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRouletteResultNumber)
    .slice(-ROULETTE_RECENT_RESULT_LIMIT);
}

export function appendRouletteRecentResult(
  history: readonly number[],
  result: number,
): number[] {
  const normalized =
    normalizeRouletteRecentResults(history);

  if (!isRouletteResultNumber(result)) {
    return normalized;
  }

  return [
    ...normalized,
    result,
  ].slice(-ROULETTE_RECENT_RESULT_LIMIT);
}

export function getRouletteResultTone(
  number: number,
): RouletteResultTone {
  if (number === 0) return "green";

  return RED_NUMBERS.has(number)
    ? "red"
    : "black";
}
