const FALSE_VALUES = new Set(["0", "false", "off", "no"]);

export const ROULETTE_ROUND_GENERATION_PAUSED = !FALSE_VALUES.has(
  (process.env.ROULETTE_ROUND_GENERATION_PAUSED ?? "true").trim().toLowerCase(),
);

export function isRouletteRoundGenerationPaused() {
  return ROULETTE_ROUND_GENERATION_PAUSED;
}