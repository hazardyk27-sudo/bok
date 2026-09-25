import { IDLE_MICROCENTS_PER_CENT } from "./storage";

export type IdleCentSettlement = {
  walletCreditCents: number;
  remainderMicrocents: number;
};

function requireSafeNonNegativeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

/**
 * Converts whole wallet cents into the persistent microcent scale.
 * Wallet values are always integer cents.
 */
export function centsToIdleMicrocents(cents: number) {
  requireSafeNonNegativeInteger(cents, "INVALID_IDLE_CENTS");
  const microcents = cents * IDLE_MICROCENTS_PER_CENT;
  if (!Number.isSafeInteger(microcents)) {
    throw new Error("IDLE_MICROCENT_OVERFLOW");
  }
  return microcents;
}

/**
 * Splits accrued microcents at collection time.
 *
 * Only complete cents are credited to the shared wallet. The sub-cent
 * remainder stays in idle storage so repeated collections never manufacture
 * or discard fractional passive income.
 */
export function settleIdleMicrocents(accruedMicrocents: number): IdleCentSettlement {
  requireSafeNonNegativeInteger(accruedMicrocents, "INVALID_IDLE_MICROCENTS");

  const walletCreditCents = Math.floor(
    accruedMicrocents / IDLE_MICROCENTS_PER_CENT,
  );
  const remainderMicrocents = accruedMicrocents
    - walletCreditCents * IDLE_MICROCENTS_PER_CENT;

  return {
    walletCreditCents,
    remainderMicrocents,
  };
}
