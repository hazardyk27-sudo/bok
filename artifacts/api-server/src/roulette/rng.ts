import { createHash, randomInt, randomUUID } from "node:crypto";
import { MULTIPLIER_VALUES, type RouletteMultiplier } from "./types";

const multiplierWeights: readonly { value: RouletteMultiplier; weight: number }[] = [
  { value: 50, weight: 52 },
  { value: 100, weight: 24 },
  { value: 150, weight: 10 },
  { value: 200, weight: 6 },
  { value: 250, weight: 3 },
  { value: 300, weight: 2 },
  { value: 400, weight: 1.5 },
  { value: 500, weight: 1 },
];

export function uniformWinningNumber(): number {
  return randomInt(0, 37);
}

export function chooseLuckyNumbers(): number[] {
  const count = randomInt(1, 6);
  const values = new Set<number>();
  while (values.size < count) values.add(uniformWinningNumber());
  return [...values].sort((a, b) => a - b);
}

export function weightedMultiplier(): RouletteMultiplier {
  const total = multiplierWeights.reduce((sum, choice) => sum + choice.weight, 0);
  let pick = (randomInt(0, 1_000_000) / 1_000_000) * total;
  for (const choice of multiplierWeights) {
    pick -= choice.weight;
    if (pick < 0) return choice.value;
  }
  return MULTIPLIER_VALUES[0];
}

export function chooseMultipliers(count: number): RouletteMultiplier[] {
  return Array.from({ length: count }, () => weightedMultiplier());
}

export function createCommitment(roundId: string, winningNumber: number, luckyNumbers: number[], multipliers: RouletteMultiplier[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ roundId, winningNumber, luckyNumbers, multipliers }))
    .digest("hex");
}

export function newId(): string {
  return randomUUID();
}