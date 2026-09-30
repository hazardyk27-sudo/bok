import {
  describe,
  expect,
  it,
} from "vitest";
import {
  formatRouletteAmount,
  formatRouletteBalance,
  formatRouletteMoney,
  formatRouletteSignedMoney,
  getRouletteAmountScale,
  getRouletteBalanceScale,
} from "./uiFormat";

describe("roulette compact amount formatting", () => {
  it("keeps normal chip totals unchanged", () => {
    expect(
      formatRouletteAmount(0),
    ).toBe("0");
    expect(
      formatRouletteAmount(500),
    ).toBe("500");
  });

  it("keeps large placed-chip labels inside small mobile cells", () => {
    expect(
      formatRouletteAmount(1000),
    ).toBe("1K");
    expect(
      formatRouletteAmount(1250),
    ).toBe("1.25K");
    expect(
      formatRouletteAmount(12500),
    ).toBe("12.5K");
    expect(
      formatRouletteAmount(125000),
    ).toBe("125K");
  });

  it("supports compact negative values defensively", () => {
    expect(
      formatRouletteAmount(-2500),
    ).toBe("-2.5K");
  });

  it("uses a tighter scale for long K/M chip labels", () => {
    expect(
      getRouletteAmountScale(100),
    ).toBe("short");
    expect(
      getRouletteAmountScale(1000),
    ).toBe("short");
    expect(
      getRouletteAmountScale(125000),
    ).toBe("medium");
    expect(
      getRouletteAmountScale(12500),
    ).toBe("long");
    expect(
      getRouletteAmountScale(1310000),
    ).toBe("long");
  });

  it("keeps wallet balance exact and grouped without K/M abbreviations", () => {
    expect(
      formatRouletteBalance(30031409),
    ).toBe("$30,031,409");
    expect(
      formatRouletteBalance(1234.5),
    ).toBe("$1,234.5");
    expect(
      formatRouletteBalance(123456789012),
    ).toBe("$123,456,789,012");
  });

  it("tightens very long wallet balances instead of overflowing the HUD", () => {
    expect(
      getRouletteBalanceScale(999999),
    ).toBe("normal");
    expect(
      getRouletteBalanceScale(30031409),
    ).toBe("compact");
    expect(
      getRouletteBalanceScale(123456789012),
    ).toBe("tight");
  });

  it("adds dollar notation to compact money fields", () => {
    expect(
      formatRouletteMoney(0),
    ).toBe("$0");
    expect(
      formatRouletteMoney(2620000),
    ).toBe("$2.62M");
    expect(
      formatRouletteMoney(-2500),
    ).toBe("-$2.5K");
  });

  it("keeps signed net-result money readable", () => {
    expect(
      formatRouletteSignedMoney(1250),
    ).toBe("+$1.25K");
    expect(
      formatRouletteSignedMoney(-1250),
    ).toBe("-$1.25K");
    expect(
      formatRouletteSignedMoney(0),
    ).toBe("$0");
  });
});
