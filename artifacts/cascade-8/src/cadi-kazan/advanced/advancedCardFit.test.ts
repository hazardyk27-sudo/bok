import { describe, expect, it } from "vitest";
import { ADVANCED_CARD_RATIO, fitAdvancedCardBounds } from "./advancedCardFit";

describe("Advanced 25 contained card fit", () => {
  it.each([
    [360, 220],
    [640, 280],
    [820, 360],
    [1024, 520],
    [1440, 650],
  ])("keeps the full 1200x546 master inside %sx%s", (containerWidth, containerHeight) => {
    const fitted = fitAdvancedCardBounds(containerWidth, containerHeight);
    expect(fitted.width).toBeGreaterThan(0);
    expect(fitted.height).toBeGreaterThan(0);
    expect(fitted.width).toBeLessThanOrEqual(containerWidth - 8);
    expect(fitted.height).toBeLessThanOrEqual(containerHeight - 8);
    expect(fitted.width / fitted.height).toBeCloseTo(ADVANCED_CARD_RATIO, 3);
  });

  it("respects the desktop master-size ceiling", () => {
    const fitted = fitAdvancedCardBounds(2200, 1200);
    expect(fitted.width).toBe(1180);
    expect(fitted.height).toBeCloseTo(1180 / ADVANCED_CARD_RATIO, 3);
  });
});
