import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_BUSINESS_IDS,
  BUSINESS_IDS,
} from "./types";

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

describe("Part 25 active Idle frontend scope", () => {
  it("retains legacy identifiers only as migration compatibility", () => {
    expect(ACTIVE_BUSINESS_IDS).toEqual(["stadium"]);
    expect(BUSINESS_IDS).toEqual([
      "stadium",
      "club-store",
      "fan-club",
    ]);
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
    expect(idleIndexSource).not.toContain(
      "ACTIVE_BUSINESS_IDS.map",
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
