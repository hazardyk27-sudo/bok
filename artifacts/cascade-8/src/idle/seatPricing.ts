import {
  MAX_STADIUM_SEATS,
  SEAT_PRICE_BANDS,
} from "./config";

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

function getSeatPriceBand(seatIndex: number) {
  const band = SEAT_PRICE_BANDS.find(
    (entry) =>
      seatIndex >= entry.startSeat
      && seatIndex < entry.endSeatExclusive,
  );

  if (!band) {
    throw new Error("IDLE_STADIUM_SEAT_PRICE_BAND_MISSING");
  }

  return band;
}

/**
 * Returns the canonical unit price, in wallet cents, for the next seat at the
 * supplied zero-based seat index.
 *
 * Prices are intentionally stable across broad capacity bands:
 *   0..49,999       = $3
 *   50,000..149,999 = $5
 *   150,000..249,999 = $10
 *   250,000..349,999 = $20
 *   350,000..449,999 = $30
 *   450,000..499,999 = $50
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

  return getSeatPriceBand(seatIndex).unitPriceCents;
}

export function getNextSeatPriceBoundary(seatIndex: number) {
  requireSafeNonNegativeInteger(
    seatIndex,
    "INVALID_IDLE_SEAT_INDEX",
  );

  if (seatIndex >= MAX_STADIUM_SEATS) {
    throw new Error("IDLE_STADIUM_MAX_SEATS_REACHED");
  }

  return getSeatPriceBand(seatIndex).endSeatExclusive;
}

/**
 * Quotes a bulk seat purchase band-by-band so a single request can never
 * bypass a capacity price boundary.
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
