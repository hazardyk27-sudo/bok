import {
  MARKET_CONFIG,
  TICKET_MICRO_UNITS,
} from "../../../cascade-8/src/idle/config";
import {
  MARKET_MICRODOLLARS_PER_CENT,
  bigintToSafeNumber,
  requireSafeNonNegativeInteger,
  settleMarketMicrodollarsToWalletCents,
} from "./fixedPoint";

export type WholeTicketSaleQuote = {
  soldTickets: number;
  soldMicroTickets: number;
  resultingStoredMicroTickets: number;
  executionPriceMicrodollars: number;
  grossSaleMicrodollars: number;
  walletCreditCents: number;
  saleRemainderMicrodollars: number;
};

export function requirePositiveTicketQuantity(
  quantityTickets: number,
) {
  if (
    !Number.isSafeInteger(quantityTickets)
    || quantityTickets <= 0
  ) {
    throw new Error(
      "INVALID_IDLE_TICKET_SALE_QUANTITY",
    );
  }

  return quantityTickets;
}

function requireValidExecutionPrice(
  priceMicrodollars: number,
) {
  if (
    !Number.isSafeInteger(priceMicrodollars)
    || priceMicrodollars
      < MARKET_CONFIG.minTicketPriceMicrodollars
    || priceMicrodollars
      > MARKET_CONFIG.maxTicketPriceMicrodollars
  ) {
    throw new Error("INVALID_IDLE_TICKET_PRICE");
  }

  return priceMicrodollars;
}

/**
 * Pure whole-ticket settlement quote.
 *
 * This module deliberately has no database imports so promotion-time
 * regression tests can validate sale arithmetic without provisioning a DB.
 */
export function quoteWholeTicketSale(input: {
  state: {
    storedMicroTickets: number;
    saleRemainderMicrodollars: number;
  };
  quantityTickets: number;
  executionPriceMicrodollars: number;
}): WholeTicketSaleQuote {
  const quantityTickets =
    requirePositiveTicketQuantity(
      input.quantityTickets,
    );

  const executionPriceMicrodollars =
    requireValidExecutionPrice(
      input.executionPriceMicrodollars,
    );

  const storedMicroTickets =
    requireSafeNonNegativeInteger(
      input.state.storedMicroTickets,
      "INVALID_IDLE_STORED_MICROTICKETS",
    );

  const priorRemainderMicrodollars =
    requireSafeNonNegativeInteger(
      input.state.saleRemainderMicrodollars,
      "INVALID_IDLE_SALE_REMAINDER",
    );

  if (
    priorRemainderMicrodollars
    >= MARKET_MICRODOLLARS_PER_CENT
  ) {
    throw new Error(
      "INVALID_IDLE_SALE_REMAINDER",
    );
  }

  const soldMicroTicketsBig =
    BigInt(quantityTickets)
    * BigInt(TICKET_MICRO_UNITS);

  const storedMicroTicketsBig =
    BigInt(storedMicroTickets);

  if (
    soldMicroTicketsBig
    > storedMicroTicketsBig
  ) {
    throw new Error(
      "INSUFFICIENT_IDLE_TICKETS",
    );
  }

  const grossSaleMicrodollarsBig =
    BigInt(quantityTickets)
    * BigInt(executionPriceMicrodollars);

  const soldMicroTickets =
    bigintToSafeNumber(
      soldMicroTicketsBig,
      "IDLE_TICKET_SALE_QUANTITY_OVERFLOW",
    );

  const grossSaleMicrodollars =
    bigintToSafeNumber(
      grossSaleMicrodollarsBig,
      "IDLE_GROSS_SALE_OVERFLOW",
    );

  const settlement =
    settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars,
      priorRemainderMicrodollars,
    });

  return {
    soldTickets: quantityTickets,
    soldMicroTickets,
    resultingStoredMicroTickets:
      storedMicroTickets - soldMicroTickets,
    executionPriceMicrodollars,
    grossSaleMicrodollars,
    walletCreditCents:
      settlement.walletCreditCents,
    saleRemainderMicrodollars:
      settlement.saleRemainderMicrodollars,
  };
}
