import {
  BASE_MULTIPLIER_CORE_CHANCE,
  BASE_MULTIPLIER_CORE_WEIGHTS,
  BONUS_CONFIG,
} from "../config/GameConfig";
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

export function drawMultiplierCore(source: RandomSource, mode: "base" | "bonus" = "bonus") {
  const spawnChance = mode === "base" ? BASE_MULTIPLIER_CORE_CHANCE : BONUS_CONFIG.multiplierCoreSpawnChance;
  const weights = mode === "base" ? BASE_MULTIPLIER_CORE_WEIGHTS : BONUS_CONFIG.multiplierCoreWeights;
  if (source.nextFloat() * 100 >= spawnChance) return null;
  return {
    kind: "MULTIPLIER_CORE" as const,
    value: weightedChoice(source, weights),
  };
}