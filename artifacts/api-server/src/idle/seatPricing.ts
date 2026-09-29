import {
  MAX_STADIUM_SEATS,
  POST_200K_SEAT_PRICING,
  PRE_200K_SEAT_PRICE_BANDS,
} from "../../../cascade-8/src/idle/config";

export type SeatPurchasePriceSegment = {
  startSeat: number;
  endSeatExclusive: number;
  quantity: number;
  unitPriceCents: number;
  costCents: number;
};

export type SeatPurchaseQuote = {
  currentOwnedSeats: number;
  quantity: number;
  resultingOwnedSeats: number;
  totalCostCents: number;
  segments: SeatPurchasePriceSegment[];
};

function requireSafeNonNegativeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(errorCode);
  }
  return value;
}

function requirePositiveSeatQuantity(quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("INVALID_IDLE_SEAT_PURCHASE_QUANTITY");
  }
  return quantity;
}

function bigintToSafeNumber(value: bigint, errorCode: string) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(errorCode);
  }
  return Number(value);
}

function powBigInt(base: bigint, exponent: number) {
  let result = 1n;
  for (let index = 0; index < exponent; index += 1) {
    result *= base;
  }
  return result;
}

function roundPositiveRationalHalfUp(
  numerator: bigint,
  denominator: bigint,
) {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error("INVALID_IDLE_SEAT_PRICE_RATIONAL");
  }

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator
    ? quotient + 1n
    : quotient;
}

/**
 * Returns the canonical unit price, in wallet cents, for the next seat at the
 * supplied zero-based seat index.
 *
 * 0..199,999 uses the fixed accepted bands.
 * 200,000..499,999 uses:
 *   $1,000 × 1.10^floor((seatIndex - 200,000) / 25,000)
 *
 * The exact rational result is rounded half-up to the nearest wallet cent.
 * The exponent is always derived from the original $1,000 base, so rounding a
 * previous block never compounds into later blocks.
 */
export function getSeatUnitPriceCentsAtSeatIndex(
  seatIndex: number,
) {
  requireSafeNonNegativeInteger(
    seatIndex,
    "INVALID_IDLE_SEAT_INDEX",
  );

  if (seatIndex >= MAX_STADIUM_SEATS) {
    throw new Error("IDLE_STADIUM_MAX_SEATS_REACHED");
  }

  const pre200kBand = PRE_200K_SEAT_PRICE_BANDS.find(
    (band) =>
      seatIndex >= band.startSeat
      && seatIndex < band.endSeatExclusive,
  );

  if (pre200kBand) return pre200kBand.unitPriceCents;

  const {
    startsAtSeats,
    blockSizeSeats,
    baseUnitPriceCents,
    growthNumerator,
    growthDenominator,
  } = POST_200K_SEAT_PRICING;

  const blockIndex = Math.floor(
    (seatIndex - startsAtSeats) / blockSizeSeats,
  );

  const numerator =
    BigInt(baseUnitPriceCents)
    * powBigInt(BigInt(growthNumerator), blockIndex);
  const denominator = powBigInt(
    BigInt(growthDenominator),
    blockIndex,
  );

  return bigintToSafeNumber(
    roundPositiveRationalHalfUp(numerator, denominator),
    "IDLE_SEAT_UNIT_PRICE_OVERFLOW",
  );
}

function getNextSeatPriceBoundary(seatIndex: number) {
  const pre200kBand = PRE_200K_SEAT_PRICE_BANDS.find(
    (band) =>
      seatIndex >= band.startSeat
      && seatIndex < band.endSeatExclusive,
  );
  if (pre200kBand) return pre200kBand.endSeatExclusive;

  const {
    startsAtSeats,
    blockSizeSeats,
    hardMaxSeats,
  } = POST_200K_SEAT_PRICING;

  const blockIndex = Math.floor(
    (seatIndex - startsAtSeats) / blockSizeSeats,
  );

  return Math.min(
    hardMaxSeats,
    startsAtSeats + (blockIndex + 1) * blockSizeSeats,
  );
}

/**
 * Quotes a bulk seat purchase band-by-band.
 *
 * The quote never flattens a multi-band purchase to the price of its first
 * seat, so a request cannot bypass a pre-200k boundary or a 25k post-200k
 * +10% step.
 *
 * Stadium-level capacity is intentionally checked by the action layer against
 * the player's locked row. This pure pricing engine enforces only the global
 * 500,000-seat hard maximum.
 */
export function quoteSeatPurchase(
  currentOwnedSeats: number,
  quantity: number,
): SeatPurchaseQuote {
  requireSafeNonNegativeInteger(
    currentOwnedSeats,
    "INVALID_IDLE_SEAT_COUNT",
  );
  requirePositiveSeatQuantity(quantity);

  if (currentOwnedSeats >= MAX_STADIUM_SEATS) {
    throw new Error("IDLE_STADIUM_MAX_SEATS_REACHED");
  }

  const resultingOwnedSeats = currentOwnedSeats + quantity;
  if (
    !Number.isSafeInteger(resultingOwnedSeats)
    || resultingOwnedSeats > MAX_STADIUM_SEATS
  ) {
    throw new Error("IDLE_STADIUM_MAX_SEATS_EXCEEDED");
  }

  const segments: SeatPurchasePriceSegment[] = [];
  let cursor = currentOwnedSeats;
  let totalCost = 0n;

  while (cursor < resultingOwnedSeats) {
    const boundary = getNextSeatPriceBoundary(cursor);
    const endSeatExclusive = Math.min(
      boundary,
      resultingOwnedSeats,
    );
    const segmentQuantity = endSeatExclusive - cursor;
    const unitPriceCents =
      getSeatUnitPriceCentsAtSeatIndex(cursor);
    const segmentCost =
      BigInt(segmentQuantity) * BigInt(unitPriceCents);

    totalCost += segmentCost;

    segments.push({
      startSeat: cursor,
      endSeatExclusive,
      quantity: segmentQuantity,
      unitPriceCents,
      costCents: bigintToSafeNumber(
        segmentCost,
        "IDLE_SEAT_PURCHASE_COST_OVERFLOW",
      ),
    });

    cursor = endSeatExclusive;
  }

  return {
    currentOwnedSeats,
    quantity,
    resultingOwnedSeats,
    totalCostCents: bigintToSafeNumber(
      totalCost,
      "IDLE_SEAT_PURCHASE_COST_OVERFLOW",
    ),
    segments,
  };
}
