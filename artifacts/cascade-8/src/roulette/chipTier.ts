export type RouletteChipTier =
  | "white"
  | "blue"
  | "green"
  | "red"
  | "black"
  | "purple";

/** Single source of truth for every placed-chip color decision. */
export function getRouletteChipTier(
  amount: number,
): RouletteChipTier {
  if (amount >= 5_000) return "purple";
  if (amount >= 2_000) return "black";
  if (amount >= 500) return "red";
  if (amount >= 100) return "green";
  if (amount >= 50) return "blue";
  return "white";
}
