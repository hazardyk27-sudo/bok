// Pure Idle calculation/formatting helpers.

export const MILLISECONDS_PER_MINUTE = 60_000;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = HOURS_PER_DAY * 60;
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


/**
 * Returns the precise maximum amount a vault can hold for the current
 * business income and vault capacity. Fractional cents are preserved here;
 * persistence/collection code can decide when to settle whole cents.
 */
export function getVaultCapacityCents(dailyIncomeCents: number, capacityHours: number) {
  if (!Number.isFinite(dailyIncomeCents) || dailyIncomeCents <= 0) return 0;
  if (!Number.isFinite(capacityHours) || capacityHours <= 0) return 0;
  return dailyIncomeCents * (capacityHours / HOURS_PER_DAY);
}
