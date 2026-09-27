export const BLACKJACK_BASE_CHIP_VALUES_CENTS = [
  1_000,   // 10
  2_500,   // 25
  5_000,   // 50
  10_000,  // 100
  25_000,  // 250
  50_000,  // 500
  100_000, // 1K
] as const;

export const BLACKJACK_HIGH_ROLLER_START_CENTS = 100_000 as const;

function assertSafeNonNegativeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `Blackjack ${label} must be a non-negative safe integer`,
    );
  }
}

function assertSafePositiveInteger(label: string, value: number): void {
  assertSafeNonNegativeInteger(label, value);
  if (value === 0) {
    throw new RangeError(`Blackjack ${label} must be greater than zero`);
  }
}

function safeDouble(value: number): number {
  const doubled = value * 2;
  if (!Number.isSafeInteger(doubled) || doubled <= value) {
    throw new RangeError(
      "Blackjack chip denomination exceeds safe integer range",
    );
  }
  return doubled;
}

function isPowerOfTwo(value: number): boolean {
  if (!Number.isSafeInteger(value) || value < 1) return false;
  const exponent = Math.log2(value);
  return Number.isInteger(exponent);
}

export function isBlackjackChipDenominationCents(value: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) return false;

  if (
    (BLACKJACK_BASE_CHIP_VALUES_CENTS as readonly number[]).includes(value)
  ) {
    return true;
  }

  if (value < BLACKJACK_HIGH_ROLLER_START_CENTS) return false;
  if (value % BLACKJACK_HIGH_ROLLER_START_CENTS !== 0) return false;

  const multiplier = value / BLACKJACK_HIGH_ROLLER_START_CENTS;
  return isPowerOfTwo(multiplier);
}

export function getNextBlackjackChipDenominationCents(
  currentCents: number,
): number {
  if (!isBlackjackChipDenominationCents(currentCents)) {
    throw new RangeError("Blackjack current chip is not a valid denomination");
  }

  const base = BLACKJACK_BASE_CHIP_VALUES_CENTS as readonly number[];
  const baseIndex = base.indexOf(currentCents);
  if (baseIndex >= 0 && baseIndex < base.length - 1) {
    return base[baseIndex + 1];
  }

  return safeDouble(currentCents);
}

export function getPreviousBlackjackChipDenominationCents(
  currentCents: number,
): number | null {
  if (!isBlackjackChipDenominationCents(currentCents)) {
    throw new RangeError("Blackjack current chip is not a valid denomination");
  }

  const base = BLACKJACK_BASE_CHIP_VALUES_CENTS as readonly number[];
  const baseIndex = base.indexOf(currentCents);
  if (baseIndex === 0) return null;
  if (baseIndex > 0) return base[baseIndex - 1];

  const previous = currentCents / 2;
  if (!Number.isSafeInteger(previous)) {
    throw new RangeError("Blackjack previous chip cannot be represented safely");
  }
  return previous;
}

export function doubleBlackjackHighRollerChipCents(
  currentCents: number,
): number {
  if (
    !isBlackjackChipDenominationCents(currentCents) ||
    currentCents < BLACKJACK_HIGH_ROLLER_START_CENTS
  ) {
    throw new RangeError(
      "Blackjack high-roller doubling requires a valid chip of 1K or more",
    );
  }
  return safeDouble(currentCents);
}

export function getBlackjackChipDenominationsUpToCents(
  availableBalanceCents: number,
): readonly number[] {
  assertSafeNonNegativeInteger(
    "availableBalanceCents",
    availableBalanceCents,
  );

  const values: number[] = [];
  for (const value of BLACKJACK_BASE_CHIP_VALUES_CENTS) {
    if (value <= availableBalanceCents) values.push(value);
  }

  if (availableBalanceCents < BLACKJACK_HIGH_ROLLER_START_CENTS) {
    return Object.freeze(values);
  }

  let next = safeDouble(BLACKJACK_HIGH_ROLLER_START_CENTS);
  while (next <= availableBalanceCents) {
    values.push(next);

    if (next > Math.floor(Number.MAX_SAFE_INTEGER / 2)) break;
    next = safeDouble(next);
  }

  return Object.freeze(values);
}

export function getBlackjackChipCredits(valueCents: number): number {
  assertSafePositiveInteger("chip valueCents", valueCents);
  if (valueCents % 100 !== 0) {
    throw new RangeError(
      "Blackjack chip denomination must represent whole credit units",
    );
  }
  return valueCents / 100;
}
