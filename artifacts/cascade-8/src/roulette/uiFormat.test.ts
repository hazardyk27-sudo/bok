import {
  describe,
  expect,
  it,
} from "vitest";
import {
  formatRouletteAmount,
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
});
