import {
  MARKET_MICRODOLLARS_PER_DOLLAR,
} from "../../../cascade-8/src/idle/config";

export const MARKET_MICRODOLLARS_PER_CENT =
  MARKET_MICRODOLLARS_PER_DOLLAR / 100;

export const BTC_QUOTE_DECIMAL_PLACES = 6;

if (!Number.isSafeInteger(MARKET_MICRODOLLARS_PER_CENT)) {
  throw new Error("INVALID_IDLE_MARKET_MONEY_SCALE");
}

export function requireSafeNonNegativeInteger(
  value: number,
  errorCode: string,
) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

export function requireSafePositiveInteger(
  value: number,
  errorCode: string,
) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(errorCode);
  }
  return value;
}

export function bigintToSafeNumber(
  value: bigint,
  errorCode: string,
) {
  if (
    value < BigInt(Number.MIN_SAFE_INTEGER)
    || value > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new Error(errorCode);
  }
  return Number(value);
}

export function roundPositiveRationalHalfUp(
  numerator: bigint,
  denominator: bigint,
) {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error("INVALID_IDLE_FIXED_POINT_RATIONAL");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;

  return remainder * 2n >= denominator
    ? quotient + 1n
    : quotient;
}

function powerOfTen(exponent: number) {
  if (
    !Number.isSafeInteger(exponent)
    || exponent < 0
    || exponent > 18
  ) {
    throw new Error("INVALID_IDLE_FIXED_POINT_SCALE");
  }

  let result = 1n;
  for (let index = 0; index < exponent; index += 1) {
    result *= 10n;
  }
  return result;
}

/**
 * Parses a non-negative decimal string directly into fixed-point integer units.
 *
 * No Number/parseFloat conversion occurs. If the source contains more decimal
 * places than the target scale, the discarded tail is rounded half-up at the
 * target precision.
 *
 * Examples at 6 decimals:
 *   "1"        -> 1_000_000
 *   "1.25"     -> 1_250_000
 *   "1.0000005" -> 1_000_001
 */
export function parseUnsignedDecimalToFixedUnits(
  value: string,
  decimalPlaces: number,
  errorCode = "INVALID_IDLE_DECIMAL_VALUE",
) {
  if (
    typeof value !== "string"
    || !/^\d+(?:\.\d+)?$/.test(value)
  ) {
    throw new Error(errorCode);
  }

  const [wholePart, fractionalPart = ""] = value.split(".");
  const scale = powerOfTen(decimalPlaces);
  const wholeUnits = BigInt(wholePart) * scale;

  const keptFraction = fractionalPart
    .slice(0, decimalPlaces)
    .padEnd(decimalPlaces, "0");

  let fractionalUnits = keptFraction.length > 0
    ? BigInt(keptFraction)
    : 0n;

  const firstDiscardedDigit =
    fractionalPart.length > decimalPlaces
      ? fractionalPart.charCodeAt(decimalPlaces) - 48
      : -1;

  if (firstDiscardedDigit >= 5) {
    fractionalUnits += 1n;
  }

  const totalUnits = wholeUnits + fractionalUnits;

  return bigintToSafeNumber(
    totalUnits,
    "IDLE_FIXED_POINT_VALUE_OVERFLOW",
  );
}

/**
 * Exchange BTC/USD prices are kept as decimal strings until this boundary.
 * The canonical quote unit is one microdollar ($0.000001).
 */
export function parseBtcUsdQuoteToMicrodollars(
  value: string,
) {
  const units = parseUnsignedDecimalToFixedUnits(
    value,
    BTC_QUOTE_DECIMAL_PLACES,
    "INVALID_IDLE_BTC_QUOTE",
  );

  return requireSafePositiveInteger(
    units,
    "INVALID_IDLE_BTC_QUOTE",
  );
}

export type MarketWalletSettlement = {
  walletCreditCents: number;
  saleRemainderMicrodollars: number;
};

/**
 * Converts exact gross sale value in microdollars into the shared wallet's
 * integer-cent scale while carrying every sub-cent microdollar forward.
 *
 * This guarantees that splitting one exact gross value across many settlement
 * calls produces the same eventual wallet cents as settling it in one call.
 */
export function settleMarketMicrodollarsToWalletCents(input: {
  grossSaleMicrodollars: number;
  priorRemainderMicrodollars: number;
}): MarketWalletSettlement {
  const grossSaleMicrodollars = requireSafeNonNegativeInteger(
    input.grossSaleMicrodollars,
    "INVALID_IDLE_GROSS_SALE_MICRODOLLARS",
  );
  const priorRemainderMicrodollars =
    requireSafeNonNegativeInteger(
      input.priorRemainderMicrodollars,
      "INVALID_IDLE_SALE_REMAINDER",
    );

  if (
    priorRemainderMicrodollars >=
    MARKET_MICRODOLLARS_PER_CENT
  ) {
    throw new Error("INVALID_IDLE_SALE_REMAINDER");
  }

  const totalMicrodollars =
    BigInt(grossSaleMicrodollars)
    + BigInt(priorRemainderMicrodollars);
  const microdollarsPerCent =
    BigInt(MARKET_MICRODOLLARS_PER_CENT);

  return {
    walletCreditCents: bigintToSafeNumber(
      totalMicrodollars / microdollarsPerCent,
      "IDLE_WALLET_CREDIT_OVERFLOW",
    ),
    saleRemainderMicrodollars: bigintToSafeNumber(
      totalMicrodollars % microdollarsPerCent,
      "IDLE_SALE_REMAINDER_OVERFLOW",
    ),
  };
}
