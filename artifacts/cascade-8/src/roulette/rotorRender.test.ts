import { describe, expect, it } from "vitest";
import { normalizeRotorAngle } from "./wheelRenderer";

describe("roulette rotor render state", () => {
  it("normalizes finite rotor angles into one positive revolution", () => {
    const tau = Math.PI * 2;

    expect(normalizeRotorAngle(0)).toBe(0);
    expect(normalizeRotorAngle(tau)).toBeCloseTo(0);
    expect(normalizeRotorAngle(tau + Math.PI / 3)).toBeCloseTo(Math.PI / 3);
    expect(normalizeRotorAngle(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5);
  });

  it("falls back safely for non-finite render input", () => {
    expect(normalizeRotorAngle(Number.NaN)).toBe(0);
    expect(normalizeRotorAngle(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
