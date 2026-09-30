import { describe, expect, it } from "vitest";
import {
  getSeatUnitPriceCentsAtSeatIndex,
  quoteSeatPurchase,
} from "./seatPricing";

describe("Stadium seat pricing", () => {
  it("uses the accepted fixed bands before 200k seats", () => {
    expect(getSeatUnitPriceCentsAtSeatIndex(0)).toBe(100);
    expect(getSeatUnitPriceCentsAtSeatIndex(999)).toBe(100);

    expect(getSeatUnitPriceCentsAtSeatIndex(1_000)).toBe(300);
    expect(getSeatUnitPriceCentsAtSeatIndex(4_999)).toBe(300);

    expect(getSeatUnitPriceCentsAtSeatIndex(5_000)).toBe(500);
    expect(getSeatUnitPriceCentsAtSeatIndex(149_999)).toBe(50_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(150_000)).toBe(100_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(199_999)).toBe(100_000);
  });

  it("uses the accepted +10 percent per 25k formula from the original $1,000 base", () => {
    expect(getSeatUnitPriceCentsAtSeatIndex(200_000)).toBe(100_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(224_999)).toBe(100_000);

    expect(getSeatUnitPriceCentsAtSeatIndex(225_000)).toBe(110_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(250_000)).toBe(121_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(275_000)).toBe(133_100);
    expect(getSeatUnitPriceCentsAtSeatIndex(300_000)).toBe(146_410);
    expect(getSeatUnitPriceCentsAtSeatIndex(325_000)).toBe(161_051);
    expect(getSeatUnitPriceCentsAtSeatIndex(350_000)).toBe(177_156);
    expect(getSeatUnitPriceCentsAtSeatIndex(375_000)).toBe(194_872);
    expect(getSeatUnitPriceCentsAtSeatIndex(400_000)).toBe(214_359);
    expect(getSeatUnitPriceCentsAtSeatIndex(425_000)).toBe(235_795);
    expect(getSeatUnitPriceCentsAtSeatIndex(450_000)).toBe(259_374);
    expect(getSeatUnitPriceCentsAtSeatIndex(475_000)).toBe(285_312);
  });

  it("splits a purchase across a pre-200k boundary instead of flattening the price", () => {
    const quote = quoteSeatPurchase(999, 2);

    expect(quote.totalCostCents).toBe(400);
    expect(quote.segments).toEqual([
      {
        startSeat: 999,
        endSeatExclusive: 1_000,
        quantity: 1,
        unitPriceCents: 100,
        costCents: 100,
      },
      {
        startSeat: 1_000,
        endSeatExclusive: 1_001,
        quantity: 1,
        unitPriceCents: 300,
        costCents: 300,
      },
    ]);
  });

  it("splits a purchase across a post-200k 25k price step", () => {
    const quote = quoteSeatPurchase(224_999, 2);

    expect(quote.totalCostCents).toBe(210_000);
    expect(quote.segments).toEqual([
      {
        startSeat: 224_999,
        endSeatExclusive: 225_000,
        quantity: 1,
        unitPriceCents: 100_000,
        costCents: 100_000,
      },
      {
        startSeat: 225_000,
        endSeatExclusive: 225_001,
        quantity: 1,
        unitPriceCents: 110_000,
        costCents: 110_000,
      },
    ]);
  });

  it("prices the 210k to 260k example band-by-band", () => {
    const quote = quoteSeatPurchase(210_000, 50_000);

    expect(quote.resultingOwnedSeats).toBe(260_000);
    expect(quote.totalCostCents).toBe(5_460_000_000);
    expect(quote.segments).toEqual([
      {
        startSeat: 210_000,
        endSeatExclusive: 225_000,
        quantity: 15_000,
        unitPriceCents: 100_000,
        costCents: 1_500_000_000,
      },
      {
        startSeat: 225_000,
        endSeatExclusive: 250_000,
        quantity: 25_000,
        unitPriceCents: 110_000,
        costCents: 2_750_000_000,
      },
      {
        startSeat: 250_000,
        endSeatExclusive: 260_000,
        quantity: 10_000,
        unitPriceCents: 121_000,
        costCents: 1_210_000_000,
      },
    ]);
  });

  it("allows a quote that ends exactly at the 500k hard maximum", () => {
    const quote = quoteSeatPurchase(499_999, 1);

    expect(quote.resultingOwnedSeats).toBe(500_000);
    expect(quote.segments).toHaveLength(1);
    expect(quote.segments[0]?.unitPriceCents).toBe(285_312);
  });

  it("rejects invalid quantities and any purchase beyond 500k", () => {
    expect(() => quoteSeatPurchase(1_000, 0))
      .toThrow("INVALID_IDLE_SEAT_PURCHASE_QUANTITY");

    expect(() => quoteSeatPurchase(500_000, 1))
      .toThrow("IDLE_STADIUM_MAX_SEATS_REACHED");

    expect(() => quoteSeatPurchase(499_999, 2))
      .toThrow("IDLE_STADIUM_MAX_SEATS_EXCEEDED");

    expect(() => getSeatUnitPriceCentsAtSeatIndex(500_000))
      .toThrow("IDLE_STADIUM_MAX_SEATS_REACHED");
  });
});
