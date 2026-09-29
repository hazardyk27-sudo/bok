import { describe, expect, it } from "vitest";
import { TICKET_MICRO_UNITS } from "../../../cascade-8/src/idle/config";
import { quoteWholeTicketSale } from "./ticketSale";

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
