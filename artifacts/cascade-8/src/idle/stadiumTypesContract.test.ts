import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./types/index.ts", import.meta.url)),
  "utf8",
);

describe("canonical Stadium type contracts", () => {
  it("defines the new Stadium progression levels and ticket state", () => {
    expect(source).toContain("export type StadiumLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;");
    expect(source).toContain("export type SpeedLevel =");
    expect(source).toContain("export type StorageLevel = SpeedLevel;");
    expect(source).toContain("export type IdleStadiumServerState = {");
    expect(source).toContain("ownedSeats: number;");
    expect(source).toContain("storedMicroTickets: number;");
    expect(source).toContain("productionRateMicroTicketsPerHour: number;");
    expect(source).toContain("productionCheckpointAt: string;");
  });

  it("defines the global market snapshot and 24-hour history contracts", () => {
    expect(source).toContain("export type TicketMarketSnapshot = {");
    expect(source).toContain("priceMicrodollars: number;");
    expect(source).toContain('"binance-btcusdt"');
    expect(source).toContain('"coinbase-btc-usd"');
    expect(source).toContain("export type IdleTicketMarketHistoryResponse = {");
    expect(source).toContain("windowHours: 24;");
  });

  it("defines server-authoritative action responses for every new economy action", () => {
    expect(source).toContain("export type IdleSeatPurchaseResponse = {");
    expect(source).toContain("export type IdleStadiumLevelUpgradeResponse = {");
    expect(source).toContain("export type IdleSpeedUpgradeResponse = {");
    expect(source).toContain("export type IdleStorageUpgradeResponse = {");
    expect(source).toContain("export type IdleTicketSaleResponse = {");
    expect(source).toContain("executionPriceMicrodollars: number;");
    expect(source).toContain("saleRemainderMicrodollars: number;");
  });

  it("marks old direct-cash contracts as temporary compatibility only", () => {
    expect(source).toContain("LEGACY COMPATIBILITY TYPES");
    expect(source).toContain("Do not add new features to these legacy contracts.");
  });
});
