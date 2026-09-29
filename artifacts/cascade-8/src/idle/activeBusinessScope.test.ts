import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const idleIndexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);
const servicesSource = readFileSync(
  fileURLToPath(
    new URL("./services/index.ts", import.meta.url),
  ),
  "utf8",
);
const typesSource = readFileSync(
  fileURLToPath(
    new URL("./types/index.ts", import.meta.url),
  ),
  "utf8",
);
const configSource = readFileSync(
  fileURLToPath(
    new URL("./config/index.ts", import.meta.url),
  ),
  "utf8",
);

describe("Part 25 active Idle frontend scope", () => {
  it("contains only canonical Stadium/ticket-market client contracts", () => {
    expect(typesSource).toContain(
      "export type IdleStadiumServerState",
    );
    expect(typesSource).toContain(
      "export type IdleTicketSaleResponse",
    );

    for (const retired of [
      "BusinessId",
      "IdleBusinessServerState",
      "IdleCollectResponse",
      "IdleVaultUpgradeResponse",
      "LEGACY COMPATIBILITY TYPES",
    ]) {
      expect(typesSource).not.toContain(retired);
    }
  });

  it("removes old direct-cash business/vault config from active source", () => {
    for (const retired of [
      "STADIUM_BUSINESS",
      "CLUB_STORE_BUSINESS",
      "FAN_CLUB_BUSINESS",
      "VAULT_LEVELS",
      "dailyIncomeCents",
      "hourlyIncomeDisplayCents",
    ]) {
      expect(configSource).not.toContain(retired);
    }
  });

  it("mounts the Businesses route from canonical Stadium state only", () => {
    expect(idleIndexSource).toContain(
      "fetchIdleStadiumState",
    );
    expect(idleIndexSource).toContain(
      "projectIdleStadiumLive",
    );
    expect(idleIndexSource).toContain(
      "subscribeIdleMarket",
    );
    expect(idleIndexSource).not.toContain(
      "renderBusinessRowShell",
    );
  });

  it("contains no direct-cash collection or legacy business mutation client path", () => {
    for (const retired of [
      "collectAllIdleBusinesses",
      "collectIdleBusiness",
      "upgradeIdleBusiness",
      "upgradeIdleVault",
      "/api/idle/collect-all",
      "/api/idle/businesses/",
      "TÜMÜNÜ TOPLA",
      "BİRİKMİŞ GELİR",
      "KASA KAPASİTESİ",
    ]) {
      expect(idleIndexSource).not.toContain(retired);
      expect(servicesSource).not.toContain(retired);
    }
  });

  it("uses canonical Stadium mutation endpoints only", () => {
    for (const endpoint of [
      "/api/idle/stadium/seats/buy",
      "/api/idle/stadium/upgrade",
      "/api/idle/stadium/speed/upgrade",
      "/api/idle/stadium/storage/upgrade",
      "/api/idle/stadium/tickets/sell",
    ]) {
      expect(servicesSource).toContain(endpoint);
    }
  });
});
