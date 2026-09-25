import { describe, expect, it } from "vitest";
import { isLargeWin, isMaxWin, winTier } from "./WinTiers";

describe("large win tiers", () => {
  it("starts the ceremony at 10x", () => {
    expect(isLargeWin(9.99)).toBe(false);
    expect(isLargeWin(10)).toBe(true);
  });

  it("keeps every tier boundary", () => {
    expect(winTier(10)).toBe("BIG WIN");
    expect(winTier(24.99)).toBe("BIG WIN");
    expect(winTier(25)).toBe("MEGA WIN");
    expect(winTier(50)).toBe("EPIC WIN");
    expect(winTier(100)).toBe("LEGENDARY WIN");
    expect(winTier(500)).toBe("SUPER WIN");
  });

  it("uses the configured max-win boundary", () => {
    expect(isMaxWin(9999.99, 10000)).toBe(false);
    expect(isMaxWin(10000, 10000)).toBe(true);
  });
});