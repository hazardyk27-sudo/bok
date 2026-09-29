import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_IDLE_BUSINESS_IDS,
  IDLE_BUSINESS_IDS,
} from "./storage";

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);
const stateSource = readFileSync(
  fileURLToPath(
    new URL("./stadiumState.ts", import.meta.url),
  ),
  "utf8",
);
const repositorySource = readFileSync(
  fileURLToPath(
    new URL("./repository.ts", import.meta.url),
  ),
  "utf8",
);

describe("Part 25 backend cutover", () => {
  it("keeps old identifiers available without exposing them as active economy", () => {
    expect(ACTIVE_IDLE_BUSINESS_IDS)
      .toEqual(["stadium"]);
    expect(IDLE_BUSINESS_IDS).toEqual([
      "stadium",
      "club-store",
      "fan-club",
    ]);
    expect(repositorySource).not.toContain(
      "DELETE FROM idle_business_states",
    );
  });

  it("serves /idle/state from canonical Stadium + wallet + market state", () => {
    expect(routesSource).toContain(
      'router.get("/idle/state"',
    );
    expect(routesSource).toContain(
      "getIdleStadiumState(sessionId)",
    );
    expect(stateSource).toContain(
      "stadiumRepository.getSessionState(",
    );
    expect(stateSource).toContain(
      "roulette_wallets",
    );
    expect(stateSource).toContain(
      "ticketMarketPersistence.getCurrentState()",
    );
    expect(stateSource).not.toContain(
      "idle_business_states",
    );
  });

  it("removes every direct-cash HTTP mutation path", () => {
    for (const retired of [
      '/idle/collect-all',
      '/idle/businesses/:businessId/collect',
      '/idle/businesses/:businessId/upgrade',
      '/idle/businesses/:businessId/vault/upgrade',
    ]) {
      expect(routesSource).not.toContain(retired);
    }

    expect(routesSource).not.toContain(
      "idleRepository",
    );
    expect(routesSource).not.toContain(
      "serializeBusiness",
    );
  });

  it("keeps canonical Stadium economy mutations mounted", () => {
    for (const endpoint of [
      '/idle/stadium/seats/buy',
      '/idle/stadium/upgrade',
      '/idle/stadium/speed/upgrade',
      '/idle/stadium/storage/upgrade',
      '/idle/stadium/tickets/sell',
    ]) {
      expect(routesSource).toContain(endpoint);
    }
  });
});
