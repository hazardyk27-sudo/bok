import type { RandomSource } from "./types";

export class CryptoRNG implements RandomSource {
  nextFloat() {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] / 4_294_967_296;
  }
}

export class SeededRNG implements RandomSource {
  private state: number;
  constructor(seed: number | string) {
    const text = String(seed);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    this.state = hash >>> 0 || 1;
  }
  nextFloat() {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }
}

export function weightedChoice<T>(source: RandomSource, choices: readonly { value: T; weight: number }[]): T {
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  let pick = source.nextFloat() * total;
  for (const choice of choices) {
    pick -= choice.weight;
    if (pick < 0) return choice.value;
  }
  return choices[choices.length - 1].value;
}