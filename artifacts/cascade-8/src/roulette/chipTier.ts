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

/**
 * The old runtime still has six historic palette slots keyed as fake chip
 * values. Until that markup is removed, translate the canonical tier to the
 * matching slot instead of maintaining a second threshold table.
 */
export function getRouletteLegacyPaletteSlot(
  amount: number,
) {
  switch (getRouletteChipTier(amount)) {
    case "white":
      return 1;
    case "blue":
      return 10;
    case "green":
      return 25;
    case "red":
      return 5;
    case "black":
      return 100;
    case "purple":
      return 500;
  }
}
