import { describe, expect, it } from "vitest";
import {
  calculateNextTicketPriceFromBtcMove,
  getInitialTicketPriceMicrodollars,
} from "./marketMath";

describe("BTC-linked ticket market math", () => {
  it("boots at the accepted $4.00 ticket price", () => {
    expect(getInitialTicketPriceMicrodollars()).toBe(4_000_000);
  });

  it("keeps the ticket price unchanged when BTC is unchanged", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 4_000_000,
      clamp: "NONE",
    });
  });

  it("amplifies a +1% BTC move to a +15% ticket move", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 101_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 4_600_000,
      clamp: "NONE",
    });
  });

  it("amplifies a -1% BTC move to a -15% ticket move", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 99_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 3_400_000,
      clamp: "NONE",
    });
  });

  it("has no per-tick smoothing or movement cap", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 105_000_000,
    })).toMatchObject({
      // +5% BTC ×15 = +75%, so $4.00 -> $7.00 in one tick.
      ticketPriceMicrodollars: 7_000_000,
      clamp: "NONE",
    });

    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 95_000_000,
    })).toMatchObject({
      // -5% BTC ×15 = -75%, so $4.00 -> $1.00 in one tick.
      ticketPriceMicrodollars: 1_000_000,
      clamp: "NONE",
    });
  });

  it("hard-clamps a crash to the accepted $0.20 floor", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 90_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 200_000,
      clamp: "MIN",
    });
  });

  it("hard-clamps an oversized rise to the accepted $10 ceiling", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 111_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 10_000_000,
      clamp: "MAX",
    });
  });

  it("allows the amplified move to land exactly on the $10 ceiling", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 110_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 10_000_000,
      clamp: "MAX",
    });
  });

  it("compounds each new move from the previous authoritative ticket price", () => {
    const first = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 101_000_000,
    });

    const second = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: first.ticketPriceMicrodollars,
      previousBtcQuoteUnits: 101_000_000,
      currentBtcQuoteUnits: 102_010_000,
    });

    expect(first.ticketPriceMicrodollars).toBe(4_600_000);
    expect(second.ticketPriceMicrodollars).toBe(5_290_000);
  });

  it("rounds only at final microdollar precision using deterministic half-up math", () => {
    const move = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_001,
      previousBtcQuoteUnits: 3,
      currentBtcQuoteUnits: 4,
    });

    expect(Number.isInteger(move.ticketPriceMicrodollars)).toBe(true);
    expect(move.ticketPriceMicrodollars).toBeGreaterThan(0);
  });

  it("rejects invalid BTC quotes and ticket prices", () => {
    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 0,
      previousBtcQuoteUnits: 100,
      currentBtcQuoteUnits: 101,
    })).toThrow("INVALID_IDLE_TICKET_PRICE");

    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 0,
      currentBtcQuoteUnits: 101,
    })).toThrow("INVALID_IDLE_PREVIOUS_BTC_QUOTE");

    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_000,
      previousBtcQuoteUnits: 100,
      currentBtcQuoteUnits: 0,
    })).toThrow("INVALID_IDLE_CURRENT_BTC_QUOTE");
  });
});
