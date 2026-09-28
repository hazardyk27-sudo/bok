export const LARGE_WIN_MULTIPLIER = 10;

export function isLargeWin(multiplier: number) {
  return multiplier >= LARGE_WIN_MULTIPLIER;
}

export function isMaxWin(multiplier: number, maxWinMultiplier: number) {
  return multiplier >= maxWinMultiplier;
}

export function winTier(multiplier: number) {
  if (multiplier >= 500) return "SUPER WIN";
  if (multiplier >= 100) return "LEGENDARY WIN";
  if (multiplier >= 50) return "EPIC WIN";
  if (multiplier >= 25) return "MEGA WIN";
  return "BIG WIN";
}