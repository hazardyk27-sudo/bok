import { describe, expect, it } from "vitest";
import {
  calculateNextTicketPriceFromBtcMove,
  getInitialTicketPriceMicrodollars,
} from "./marketMath";

describe("BTC-linked ticket market math", () => {
  it("boots at the accepted $8.00 ticket price", () => {
    expect(getInitialTicketPriceMicrodollars()).toBe(8_000_000);
  });

  it("keeps the ticket price unchanged when BTC is unchanged", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 8_000_000,
      clamp: "NONE",
    });
  });

  it("amplifies a +0.1% BTC move to a +30% ticket move", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_100_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 10_400_000,
      clamp: "NONE",
    });
  });

  it("amplifies a -0.1% BTC move to a -30% ticket move", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 99_900_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 5_600_000,
      clamp: "NONE",
    });
  });

  it("has no per-tick smoothing or movement cap before the hard range", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_200_000,
    })).toMatchObject({
      // +0.2% BTC ×300 = +60%, so $8.00 -> $12.80 in one tick.
      ticketPriceMicrodollars: 12_800_000,
      clamp: "NONE",
    });

    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 99_800_000,
    })).toMatchObject({
      // -0.2% BTC ×300 = -60%, so $8.00 -> $3.20 in one tick.
      ticketPriceMicrodollars: 3_200_000,
      clamp: "NONE",
    });
  });

  it("hard-clamps a crash to the accepted $0.10 floor", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 99_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 100_000,
      clamp: "MIN",
    });
  });

  it("hard-clamps an oversized rise to the accepted $20 ceiling", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 101_000_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 20_000_000,
      clamp: "MAX",
    });
  });

  it("allows the amplified move to land exactly on the $20 ceiling", () => {
    expect(calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_500_000,
    })).toMatchObject({
      ticketPriceMicrodollars: 20_000_000,
      clamp: "MAX",
    });
  });

  it("compounds each new move from the previous authoritative ticket price", () => {
    const first = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100_000_000,
      currentBtcQuoteUnits: 100_100_000,
    });

    const second = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: first.ticketPriceMicrodollars,
      previousBtcQuoteUnits: 100_100_000,
      currentBtcQuoteUnits: 100_200_100,
    });

    expect(first.ticketPriceMicrodollars).toBe(10_400_000);
    expect(second.ticketPriceMicrodollars).toBe(13_520_000);
  });

  it("rounds only at final microdollar precision using deterministic half-up math", () => {
    const move = calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 4_000_001,
      previousBtcQuoteUnits: 600,
      currentBtcQuoteUnits: 601,
    });

    // +1/600 BTC ×300 = +50%; 4,000,001 × 1.5 = 6,000,001.5.
    expect(move.ticketPriceMicrodollars).toBe(6_000_002);
    expect(move.clamp).toBe("NONE");
  });

  it("rejects invalid BTC quotes and ticket prices", () => {
    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 0,
      previousBtcQuoteUnits: 100,
      currentBtcQuoteUnits: 101,
    })).toThrow("INVALID_IDLE_TICKET_PRICE");

    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 0,
      currentBtcQuoteUnits: 101,
    })).toThrow("INVALID_IDLE_PREVIOUS_BTC_QUOTE");

    expect(() => calculateNextTicketPriceFromBtcMove({
      previousTicketPriceMicrodollars: 8_000_000,
      previousBtcQuoteUnits: 100,
      currentBtcQuoteUnits: 0,
    })).toThrow("INVALID_IDLE_CURRENT_BTC_QUOTE");
  });
});
