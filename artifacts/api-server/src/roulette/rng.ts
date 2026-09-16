import { createHash, randomInt, randomUUID } from "node:crypto";
import { MULTIPLIER_VALUES, type RouletteMultiplier } from "./types";

export type RouletteRandomInt = (min: number, max: number) => number;

export const MULTIPLIER_DISTRIBUTION: readonly { value: RouletteMultiplier; weight: number }[] = [
  { value: 50, weight: 52 },
  { value: 100, weight: 24 },
  { value: 150, weight: 10 },
  { value: 200, weight: 6 },
  { value: 250, weight: 3 },
  { value: 300, weight: 2 },
  { value: 400, weight: 1.5 },
  { value: 500, weight: 1 },
];

export function uniformWinningNumber(nextInt: RouletteRandomInt = (min, max) => randomInt(min, max)): number {
  return nextInt(0, 37);
}

export function chooseLuckyNumbers(nextInt: RouletteRandomInt = (min, max) => randomInt(min, max)): number[] {
  const count = nextInt(1, 6);
  const values = new Set<number>();
  while (values.size < count) values.add(uniformWinningNumber(nextInt));
  return [...values].sort((a, b) => a - b);
}

export function weightedMultiplier(nextInt: RouletteRandomInt = (min, max) => randomInt(min, max)): RouletteMultiplier {
  const total = MULTIPLIER_DISTRIBUTION.reduce((sum, choice) => sum + choice.weight, 0);
  let pick = (nextInt(0, 1_000_000) / 1_000_000) * total;
  for (const choice of MULTIPLIER_DISTRIBUTION) {
    pick -= choice.weight;
    if (pick < 0) return choice.value;
  }
  return MULTIPLIER_VALUES[0];
}

export function chooseMultipliers(count: number, nextInt: RouletteRandomInt = (min, max) => randomInt(min, max)): RouletteMultiplier[] {
  return Array.from({ length: count }, () => weightedMultiplier(nextInt));
}

export function createCommitment(roundId: string, winningNumber: number, luckyNumbers: number[], multipliers: RouletteMultiplier[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ roundId, winningNumber, luckyNumbers, multipliers }))
    .digest("hex");
}

export function newId(): string {
  return randomUUID();
}