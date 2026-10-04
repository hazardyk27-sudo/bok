import { describe, expect, it } from "vitest";
import {
  calculateNextTicketPriceFromBtcMove,
  getInitialTicketPriceMicrodollars,
} from "./marketMath";

describe("BTC-linked ticket market math", () => {
  it("boots at the accepted $7.00 ticket price", () => {
    expect(getInitialTicketPriceMicrodollars()).toBe(7_000_000);
  });

  it("keeps the ticket price unchanged when BTC is unchanged", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 7_000_000,
      clamp: "NONE",
    });
  });

  it("amplifies a +0.1% BTC move to a +2% ticket move", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_100_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 7_140_000,
      clamp: "NONE",
    });
  });

  it("amplifies a -0.1% BTC move to a -2% ticket move", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 99_900_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 6_860_000,
      clamp: "NONE",
    });
  });

  it("has no per-tick smoothing or movement cap before the hard range", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_200_000,
    })).toMatchObject({
      // +0.2% BTC ×20 = +4%, so $7.00 -> $7.28 in one tick.
      ticketPriceMicrodollars: 7_280_000,
      clamp: "NONE",
    });

    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 99_800_000,
    })).toMatchObject({
      // -0.2% BTC ×20 = -4%, so $7.00 -> $6.72 in one tick.
      ticketPriceMicrodollars: 6_720_000,
      clamp: "NONE",
    });
  });

  it("hard-clamps a crash to the accepted $0.10 floor", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 95_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 100_000,
      clamp: "MIN",
    });
  });

  it("hard-clamps an oversized rise to the accepted $20 ceiling", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 110_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 20_000_000,
      clamp: "MAX",
    });
  });

  it("allows the amplified move to land exactly on the $20 ceiling", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 107_500_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 20_000_000,
      clamp: "MAX",
    });
  });

  it("compounds each new move from the previous authoritative ticket price", () => {
    const first = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_100_000,
    });

    const second = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: first.ticketPriceMicrodollars,
      previousBtcQuoteUnits: 100_100_000,
      currentBtcQuoteUnits: 100_200_100,
    });

    expect(first.ticketPriceMicrodollars).toBe(7_140_000);
    expect(second.ticketPriceMicrodollars).toBe(7_282_800);
  });

  it("rounds only at final microdollar precision using deterministic half-up math", () => {
    const move = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_005,
      previousBtcQuoteUnits: 600,
      currentBtcQuoteUnits: 601,
    });

    // +1/600 BTC ×20 = +1/30; 4,000,005 × 31/30 = 4,133,338.5.
    expect(move.ticketPriceMicrodollars).toBe(4_133_339);
    expect(move.clamp).toBe("NONE");
  });

  it("rejects invalid BTC quotes and ticket prices", () => {
    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 0,
      previousBtcQuoteUnits: 100,
      currentBtcQuoteUnits: 101,
    })).toThrow("INVALID_IDLE_TICKET_PRICE");

    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 0,
      currentBtcQuoteUnits: 101,
    })).toThrow("INVALID_IDLE_PREVIOUS_BTC_QUOTE");

    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 7_000_000,
      previousBtcQuoteUnits: 100,
      currentBtcQuoteUnits: 0,
    })).toThrow("INVALID_IDLE_CURRENT_BTC_QUOTE");
  });
});
