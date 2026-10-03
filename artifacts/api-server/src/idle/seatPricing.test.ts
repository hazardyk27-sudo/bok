import { describe, expect, it } from "vitest";
import {
  getSeatUnitPriceCentsAtSeatIndex,
  quoteSeatPurchase,
} from "./seatPricing";

describe("Stadium seat pricing", () => {
  it("uses the accepted broad fixed bands through 500k seats", () => {
    expect(getSeatUnitPriceCentsAtSeatIndex(0)).toBe(300);
    expect(getSeatUnitPriceCentsAtSeatIndex(49_999)).toBe(300);

    expect(getSeatUnitPriceCentsAtSeatIndex(50_000)).toBe(500);
    expect(getSeatUnitPriceCentsAtSeatIndex(149_999)).toBe(500);

    expect(getSeatUnitPriceCentsAtSeatIndex(150_000)).toBe(1_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(249_999)).toBe(1_000);

    expect(getSeatUnitPriceCentsAtSeatIndex(250_000)).toBe(2_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(349_999)).toBe(2_000);

    expect(getSeatUnitPriceCentsAtSeatIndex(350_000)).toBe(3_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(449_999)).toBe(3_000);

    expect(getSeatUnitPriceCentsAtSeatIndex(450_000)).toBe(5_000);
    expect(getSeatUnitPriceCentsAtSeatIndex(499_999)).toBe(5_000);
  });

  it("splits a purchase across the 50k boundary instead of flattening the price", () => {
    const quote = quoteSeatPurchase(49_999, 2);

    expect(quote.totalCostCents).toBe(800);
    expect(quote.segments).toEqual([
      {
        startSeat: 49_999,
        endSeatExclusive: 50_000,
        quantity: 1,
        unitPriceCents: 300,
        costCents: 300,
      },
      {
        startSeat: 50_000,
        endSeatExclusive: 50_001,
        quantity: 1,
        unitPriceCents: 500,
        costCents: 500,
      },
    ]);
  });

  it("splits a purchase across the 150k boundary", () => {
    const quote = quoteSeatPurchase(149_999, 2);

    expect(quote.totalCostCents).toBe(1_500);
    expect(quote.segments).toEqual([
      {
        startSeat: 149_999,
        endSeatExclusive: 150_000,
        quantity: 1,
        unitPriceCents: 500,
        costCents: 500,
      },
      {
        startSeat: 150_000,
        endSeatExclusive: 150_001,
        quantity: 1,
        unitPriceCents: 1_000,
        costCents: 1_000,
      },
    ]);
  });

  it("prices the 210k to 260k example band-by-band", () => {
    const quote = quoteSeatPurchase(210_000, 50_000);

    expect(quote.resultingOwnedSeats).toBe(260_000);
    expect(quote.totalCostCents).toBe(60_000_000);
    expect(quote.segments).toEqual([
      {
        startSeat: 210_000,
        endSeatExclusive: 250_000,
        quantity: 40_000,
        unitPriceCents: 1_000,
        costCents: 40_000_000,
      },
      {
        startSeat: 250_000,
        endSeatExclusive: 260_000,
        quantity: 10_000,
        unitPriceCents: 2_000,
        costCents: 20_000_000,
      },
    ]);
  });

  it("charges $147k to grow from the free 1k start to 50k", () => {
    const quote = quoteSeatPurchase(1_000, 49_000);

    expect(quote.resultingOwnedSeats).toBe(50_000);
    expect(quote.totalCostCents).toBe(14_700_000);
  });

  it("charges $9.147m from the free 1k start to the 500k maximum", () => {
    const quote = quoteSeatPurchase(1_000, 499_000);

    expect(quote.resultingOwnedSeats).toBe(500_000);
    expect(quote.totalCostCents).toBe(914_700_000);
    expect(quote.segments).toHaveLength(6);
  });

  it("allows a quote that ends exactly at the 500k hard maximum", () => {
    const quote = quoteSeatPurchase(499_999, 1);

    expect(quote.resultingOwnedSeats).toBe(500_000);
    expect(quote.segments).toHaveLength(1);
    expect(quote.segments[0]?.unitPriceCents).toBe(5_000);
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
