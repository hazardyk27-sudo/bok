// Shared frontend types for the Idle / İşletmeler module.

export const BUSINESS_IDS = ["stadium", "club-store", "fan-club"] as const;

export type BusinessId = (typeof BUSINESS_IDS)[number];

export type BusinessLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type BusinessStageConfig = {
  level: BusinessLevel;
  name: string;
  costCents: number;
  /**
   * Canonical income value for economy calculations.
   * Later accrual utilities derive precise sub-hour rates from this value.
   */
  dailyIncomeCents: number;
  /**
   * Rounded hourly value approved for display only.
   * Economy logic must not use this as its source of truth.
   */
  hourlyIncomeDisplayCents: number;
  targetRoiDays: number;
};

export type BusinessDefinition = {
  id: BusinessId;
  label: string;
  levels: readonly BusinessStageConfig[];
};
