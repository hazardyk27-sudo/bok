import { BONUS_CONFIG } from "../config/GameConfig";
import type { RandomSource } from "./types";
import { weightedChoice } from "./RNG";

export function baseFreeSpins(scatterCount: number) {
  if (scatterCount >= 6) return BONUS_CONFIG.base[6];
  if (scatterCount === 5) return BONUS_CONFIG.base[5];
  if (scatterCount === 4) return BONUS_CONFIG.base[4];
  return 0;
}

export function retriggerFreeSpins(scatterCount: number) {
  if (scatterCount >= 6) return BONUS_CONFIG.retrigger[6];
  if (scatterCount === 5) return BONUS_CONFIG.retrigger[5];
  if (scatterCount === 4) return BONUS_CONFIG.retrigger[4];
  if (scatterCount === 3) return BONUS_CONFIG.retrigger[3];
  return 0;
}

export function drawCrystalMultipliers(source: RandomSource): number[] {
  const count = weightedChoice(source, BONUS_CONFIG.crystalCountWeights);
  return Array.from({ length: count }, () => weightedChoice(source, BONUS_CONFIG.crystalMultiplierWeights));
}

export function applyCrystalMultiplier(rawPayoutMultiplier: number, crystals: number[]) {
  return rawPayoutMultiplier * (crystals.length ? crystals.reduce((sum, value) => sum + value, 0) : 1);
}