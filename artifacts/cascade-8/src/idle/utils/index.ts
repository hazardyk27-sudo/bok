// Pure Idle calculation/formatting helpers.

export const MILLISECONDS_PER_MINUTE = 60_000;
export const MINUTES_PER_DAY = 24 * 60;
export const MILLISECONDS_PER_DAY = MINUTES_PER_DAY * MILLISECONDS_PER_MINUTE;

/**
 * Returns the precise per-minute income derived from the canonical daily rate.
 * The result may contain fractional cents and must not be rounded before accrual.
 */
export function getIncomePerMinuteCents(dailyIncomeCents: number) {
  if (!Number.isFinite(dailyIncomeCents) || dailyIncomeCents <= 0) return 0;
  return dailyIncomeCents / MINUTES_PER_DAY;
}

/**
 * Returns precise accrued income for an elapsed duration.
 * Rounded display-only hourly values are intentionally not accepted here.
 */
export function getAccruedIncomeCents(dailyIncomeCents: number, elapsedMs: number) {
  if (!Number.isFinite(dailyIncomeCents) || dailyIncomeCents <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return dailyIncomeCents * (elapsedMs / MILLISECONDS_PER_DAY);
}
