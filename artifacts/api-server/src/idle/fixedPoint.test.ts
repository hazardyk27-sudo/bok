import { describe, expect, it } from "vitest";
import {
  BTC_QUOTE_DECIMAL_PLACES,
  MARKET_MICRODOLLARS_PER_CENT,
  parseBtcUsdQuoteToMicrodollars,
  parseUnsignedDecimalToFixedUnits,
  settleMarketMicrodollarsToWalletCents,
} from "./fixedPoint";

describe("Idle market fixed-point precision", () => {
  it("uses six decimal places for exchange BTC/USD quotes", () => {
    expect(BTC_QUOTE_DECIMAL_PLACES).toBe(6);
    expect(parseBtcUsdQuoteToMicrodollars("100000"))
      .toBe(100_000_000_000);
    expect(parseBtcUsdQuoteToMicrodollars("100000.123456"))
      .toBe(100_000_123_456);
  });

  it("parses decimal strings without floating-point conversion", () => {
    expect(parseUnsignedDecimalToFixedUnits("1", 6))
      .toBe(1_000_000);
    expect(parseUnsignedDecimalToFixedUnits("1.25", 6))
      .toBe(1_250_000);
    expect(parseUnsignedDecimalToFixedUnits("0.000001", 6))
      .toBe(1);
  });

  it("rounds excess decimal places half-up at the target precision", () => {
    expect(parseUnsignedDecimalToFixedUnits("1.0000004", 6))
      .toBe(1_000_000);
    expect(parseUnsignedDecimalToFixedUnits("1.0000005", 6))
      .toBe(1_000_001);
    expect(parseUnsignedDecimalToFixedUnits("0.9999999", 6))
      .toBe(1_000_000);
  });

  it("rejects ambiguous/non-decimal exchange representations", () => {
    for (const value of [
      "",
      "-1",
      "+1",
      "1e5",
      "1,000.00",
      ".5",
      "5.",
      "abc",
    ]) {
      expect(() => parseBtcUsdQuoteToMicrodollars(value))
        .toThrow("INVALID_IDLE_BTC_QUOTE");
    }

    expect(() => parseBtcUsdQuoteToMicrodollars("0"))
      .toThrow("INVALID_IDLE_BTC_QUOTE");
  });

  it("defines one wallet cent as exactly 10,000 microdollars", () => {
    expect(MARKET_MICRODOLLARS_PER_CENT).toBe(10_000);
  });

  it("carries sub-cent sale value instead of discarding it", () => {
    expect(settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 6_000,
      priorRemainderMicrodollars: 0,
    })).toEqual({
      walletCreditCents: 0,
      saleRemainderMicrodollars: 6_000,
    });

    expect(settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 6_000,
      priorRemainderMicrodollars: 6_000,
    })).toEqual({
      walletCreditCents: 1,
      saleRemainderMicrodollars: 2_000,
    });
  });

  it("makes split settlements equal one combined settlement", () => {
    const first = settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 3_333,
      priorRemainderMicrodollars: 0,
    });
    const second = settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 3_333,
      priorRemainderMicrodollars:
        first.saleRemainderMicrodollars,
    });
    const third = settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 3_334,
      priorRemainderMicrodollars:
        second.saleRemainderMicrodollars,
    });

    const combined = settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 10_000,
      priorRemainderMicrodollars: 0,
    });

    expect(
      first.walletCreditCents
      + second.walletCreditCents
      + third.walletCreditCents,
    ).toBe(combined.walletCreditCents);
    expect(third.saleRemainderMicrodollars)
      .toBe(combined.saleRemainderMicrodollars);
  });

  it("rejects malformed sale remainder state", () => {
    expect(() => settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: 1,
      priorRemainderMicrodollars: 10_000,
    })).toThrow("INVALID_IDLE_SALE_REMAINDER");

    expect(() => settleMarketMicrodollarsToWalletCents({
      grossSaleMicrodollars: -1,
      priorRemainderMicrodollars: 0,
    })).toThrow("INVALID_IDLE_GROSS_SALE_MICRODOLLARS");
  });
});
