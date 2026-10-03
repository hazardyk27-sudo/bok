import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";
import {
  bigintToSafeNumber,
  requireSafePositiveInteger,
  roundPositiveRationalHalfUp,
} from "./fixedPoint";

export type TicketMarketClamp = "NONE" | "MIN" | "MAX";

export type TicketMarketMove = {
  previousTicketPriceMicrodollars: number;
  previousBtcQuoteUnits: number;
  currentBtcQuoteUnits: number;
  ticketPriceMicrodollars: number;
  clamp: TicketMarketClamp;
};

function requireSafeTicketPrice(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("INVALID_IDLE_TICKET_PRICE");
  }
  return value;
}

/**
 * Applies the canonical 5-second BTC-linked ticket-price move:
 *
 *   btcReturn = currentBTC / previousBTC - 1
 *   rawTicket = previousTicket × (1 + 20 × btcReturn)
 *   nextTicket = clamp(rawTicket, $0.10, $20.00)
 *
 * BTC quotes are supplied as positive integers in ANY shared fixed-point scale
 * (for example microdollars). Only the ratio matters, so both quotes merely
 * need to use the same scale.
 *
 * All authoritative price math stays rational/BigInt until the final
 * microdollar rounding. There is deliberately no per-tick move cap or
 * smoothing; only the accepted hard market floor/ceiling are applied.
 */
export function calculateNextTicketPriceFromBtcMove(input: {
  previousTicketPriceMicrodollars: number;
  previousBtcQuoteUnits: number;
  currentBtcQuoteUnits: number;
}): TicketMarketMove {
  const previousTicketPriceMicrodollars =
    requireSafeTicketPrice(
      input.previousTicketPriceMicrodollars,
    );
  const previousBtcQuoteUnits = requireSafePositiveInteger(
    input.previousBtcQuoteUnits,
    "INVALID_IDLE_PREVIOUS_BTC_QUOTE",
  );
  const currentBtcQuoteUnits = requireSafePositiveInteger(
    input.currentBtcQuoteUnits,
    "INVALID_IDLE_CURRENT_BTC_QUOTE",
  );

  const previousBtc = BigInt(previousBtcQuoteUnits);
  const currentBtc = BigInt(currentBtcQuoteUnits);
  const sensitivity = BigInt(MARKET_CONFIG.btcSensitivity);

  // previousBTC + sensitivity × (currentBTC - previousBTC)
  // is the exact numerator of (1 + sensitivity × btcReturn).
  const amplifiedFactorNumerator =
    previousBtc
    + sensitivity * (currentBtc - previousBtc);

  const minPrice = BigInt(
    MARKET_CONFIG.minTicketPriceMicrodollars,
  );
  const maxPrice = BigInt(
    MARKET_CONFIG.maxTicketPriceMicrodollars,
  );
  const denominator = previousBtc;

  // A sufficiently sharp BTC fall can make the raw amplified ticket price
  // zero/negative. The accepted hard floor applies directly in that case.
  if (amplifiedFactorNumerator <= 0n) {
    return {
      previousTicketPriceMicrodollars,
      previousBtcQuoteUnits,
      currentBtcQuoteUnits,
      ticketPriceMicrodollars:
        MARKET_CONFIG.minTicketPriceMicrodollars,
      clamp: "MIN",
    };
  }

  const rawNumerator =
    BigInt(previousTicketPriceMicrodollars)
    * amplifiedFactorNumerator;

  if (rawNumerator <= minPrice * denominator) {
    return {
      previousTicketPriceMicrodollars,
      previousBtcQuoteUnits,
      currentBtcQuoteUnits,
      ticketPriceMicrodollars:
        MARKET_CONFIG.minTicketPriceMicrodollars,
      clamp: "MIN",
    };
  }

  if (rawNumerator >= maxPrice * denominator) {
    return {
      previousTicketPriceMicrodollars,
      previousBtcQuoteUnits,
      currentBtcQuoteUnits,
      ticketPriceMicrodollars:
        MARKET_CONFIG.maxTicketPriceMicrodollars,
      clamp: "MAX",
    };
  }

  const roundedPrice = roundPositiveRationalHalfUp(
    rawNumerator,
    denominator,
  );

  return {
    previousTicketPriceMicrodollars,
    previousBtcQuoteUnits,
    currentBtcQuoteUnits,
    ticketPriceMicrodollars: bigintToSafeNumber(
      roundedPrice,
      "IDLE_TICKET_PRICE_OVERFLOW",
    ),
    clamp: "NONE",
  };
}

export function getInitialTicketPriceMicrodollars() {
  return MARKET_CONFIG.initialTicketPriceMicrodollars;
}
