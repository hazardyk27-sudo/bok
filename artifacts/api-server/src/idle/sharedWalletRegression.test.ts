import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const rouletteRoutes = source("../roulette/routes.ts");
const rouletteRepository = source("../roulette/repository.ts");
const slotRoutes = source("../slot/routes.ts");
const slotRepository = source("../slot/repository.ts");
const cadiRoutes = source("../cadi-kazan/routes.ts");
const cadiRepository = source("../cadi-kazan/repository.ts");
const idleRoutes = source("./routes.ts");
const idleRepository = source("./repository.ts");

describe("shared game wallet integration", () => {
  it("keeps one game_session identity across all game APIs", () => {
    for (const routeSource of [
      rouletteRoutes,
      slotRoutes,
      cadiRoutes,
      idleRoutes,
    ]) {
      expect(routeSource).toContain(
        'import { SESSION_COOKIE } from "../platform/session";',
      );
      expect(routeSource).toContain("req.cookies?.[SESSION_COOKIE]");
      expect(routeSource).toContain("res.cookie(SESSION_COOKIE, sessionId");
    }
  });

  it("keeps Slot, Roulette, Cadı Kazan and Idle on shared_wallets only", () => {
    for (const repositorySource of [
      rouletteRepository,
      slotRepository,
      cadiRepository,
      idleRepository,
    ]) {
      expect(repositorySource).toContain("shared_wallets");
      expect(repositorySource).not.toContain("roulette_wallets");
      expect(repositorySource).toContain("balance_cents");
      expect(repositorySource).toContain("session_id");
    }
  });

  it("keeps the common platform initial wallet value as Idle's fallback source", () => {
    expect(idleRepository).toContain(
      'import { INITIAL_SHARED_BALANCE_CENTS } from "../platform/wallet";',
    );
    expect(idleRepository).toContain("INITIAL_SHARED_BALANCE_CENTS");
    expect(idleRepository).not.toContain("INITIAL_ROULETTE_BALANCE_CENTS");
  });

  it("keeps Idle collect and upgrades writing the same shared wallet", () => {
    expect(idleRepository).toContain(
      "SELECT balance_cents FROM shared_wallets WHERE session_id = $1 FOR UPDATE",
    );
    expect(idleRepository).toContain("UPDATE shared_wallets");
    expect(idleRepository).toContain("INSERT INTO shared_wallets");
  });
});
