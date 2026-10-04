import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MARKET_CONFIG,
  SPEED_LEVELS,
  STADIUM_LEVELS,
  STORAGE_LEVELS,
} from "./config";

const servicesSource = readFileSync(
  fileURLToPath(
    new URL("./services/index.ts", import.meta.url),
  ),
  "utf8",
);

describe("canonical Idle economy smoke", () => {
  it("keeps only Stadium ticket-economy progression in active services", () => {
    expect(STADIUM_LEVELS).toHaveLength(10);
    expect(SPEED_LEVELS).toHaveLength(20);
    expect(STORAGE_LEVELS).toHaveLength(20);
    expect(STADIUM_LEVELS.at(-1)?.maxSeats)
      .toBe(500_000);
    expect(STORAGE_LEVELS.at(-1)?.capacityTickets)
      .toBe(500_000);
  });

  it("keeps the approved global ticket market bounds", () => {
    expect(MARKET_CONFIG.tickMs).toBe(5_000);
    expect(MARKET_CONFIG.btcSensitivity).toBe(20);
    expect(MARKET_CONFIG.initialTicketPriceMicrodollars)
      .toBe(7_000_000);
    expect(MARKET_CONFIG.minTicketPriceMicrodollars)
      .toBe(100_000);
    expect(MARKET_CONFIG.maxTicketPriceMicrodollars)
      .toBe(20_000_000);
  });

  it("contains no passive-cash accrual, collection, or Vault service", () => {
    for (const retired of [
      "dailyIncomeCents",
      "accruedMicrocents",
      "collectableCents",
      "projectIdleBusinessLive",
      "getIdleTotalPassiveIncomeCentsPerHour",
      "getIdleTotalCollectableCents",
      "getIdleVaultUpgradePreview",
    ]) {
      expect(servicesSource).not.toContain(retired);
    }
  });
});
