import { describe, expect, it } from "vitest";
import { TICKET_MICRO_UNITS } from "../../../cascade-8/src/idle/config";
import { quoteWholeTicketSale } from "./ticketSaleQuote";

describe("whole-ticket sale quote", () => {
  it("decrements exact whole-ticket inventory at the authoritative microdollar price", () => {
    const quote = quoteWholeTicketSale({
      state: {
        storedMicroTickets:
          3 * TICKET_MICRO_UNITS + 500_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 2,
      executionPriceMicrodollars: 4_123_456,
    });

    expect(quote).toEqual({
      soldTickets: 2,
      soldMicroTickets: 2_000_000,
      resultingStoredMicroTickets: 1_500_000,
      executionPriceMicrodollars: 4_123_456,
      grossSaleMicrodollars: 8_246_912,
      walletCreditCents: 824,
      saleRemainderMicrodollars: 6_912,
    });
  });

  it("carries the prior sub-cent remainder into the wallet credit", () => {
    const quote = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 2_000_000,
        saleRemainderMicrodollars: 4_000,
      },
      quantityTickets: 2,
      executionPriceMicrodollars: 4_123_456,
    });

    expect(quote.walletCreditCents).toBe(825);
    expect(quote.saleRemainderMicrodollars).toBe(912);
  });

  it("allows selling all whole tickets while preserving fractional production inventory", () => {
    const quote = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 2_750_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 2,
      executionPriceMicrodollars: 4_000_000,
    });

    expect(quote.resultingStoredMicroTickets).toBe(750_000);
  });

  it("accepts the canonical market floor and ceiling and rejects prices outside them", () => {
    expect(quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: 100_000,
    }).grossSaleMicrodollars).toBe(100_000);

    expect(quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: 20_000_000,
    }).grossSaleMicrodollars).toBe(20_000_000);

    expect(() => quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: 99_999,
    })).toThrow("INVALID_IDLE_TICKET_PRICE");

    expect(() => quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: 20_000_001,
    })).toThrow("INVALID_IDLE_TICKET_PRICE");
  });

  it("handles the maximum canonical 500k-ticket storage sale at the $20 ceiling exactly", () => {
    const quote = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 500_000_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 500_000,
      executionPriceMicrodollars: 20_000_000,
    });

    expect(quote).toMatchObject({
      soldTickets: 500_000,
      soldMicroTickets: 500_000_000_000,
      resultingStoredMicroTickets: 0,
      grossSaleMicrodollars: 10_000_000_000_000,
      walletCreditCents: 1_000_000_000,
      saleRemainderMicrodollars: 0,
    });
  });

  it("makes repeated whole-ticket sales equal one combined sale when execution price is unchanged", () => {
    const price = 200_001;

    const first = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 3_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: price,
    });

    const second = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 2_000_000,
        saleRemainderMicrodollars:
          first.saleRemainderMicrodollars,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: price,
    });

    const third = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_000_000,
        saleRemainderMicrodollars:
          second.saleRemainderMicrodollars,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: price,
    });

    const combined = quoteWholeTicketSale({
      state: {
        storedMicroTickets: 3_000_000,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 3,
      executionPriceMicrodollars: price,
    });

    expect(
      first.walletCreditCents
      + second.walletCreditCents
      + third.walletCreditCents,
    ).toBe(combined.walletCreditCents);
    expect(third.saleRemainderMicrodollars)
      .toBe(combined.saleRemainderMicrodollars);
    expect(third.saleRemainderMicrodollars).toBe(3);
  });

  it("rejects malformed stored inventory and sub-cent remainder state", () => {
    expect(() => quoteWholeTicketSale({
      state: {
        storedMicroTickets: -1,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: 4_000_000,
    })).toThrow("INVALID_IDLE_STORED_MICROTICKETS");

    expect(() => quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_000_000,
        saleRemainderMicrodollars: 10_000,
      },
      quantityTickets: 1,
      executionPriceMicrodollars: 4_000_000,
    })).toThrow("INVALID_IDLE_SALE_REMAINDER");
  });

  it("rejects a sale that would make inventory negative", () => {
    expect(() => quoteWholeTicketSale({
      state: {
        storedMicroTickets: 1_999_999,
        saleRemainderMicrodollars: 0,
      },
      quantityTickets: 2,
      executionPriceMicrodollars: 4_000_000,
    })).toThrow("INSUFFICIENT_IDLE_TICKETS");
  });

  it("rejects zero, fractional, and unsafe whole-ticket quantities", () => {
    for (const quantityTickets of [
      0,
      -1,
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => quoteWholeTicketSale({
        state: {
          storedMicroTickets: 10_000_000,
          saleRemainderMicrodollars: 0,
        },
        quantityTickets,
        executionPriceMicrodollars: 4_000_000,
      })).toThrow("INVALID_IDLE_TICKET_SALE_QUANTITY");
    }
  });
});
