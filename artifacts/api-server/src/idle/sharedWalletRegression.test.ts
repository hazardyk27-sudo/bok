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
  it("keeps one roulette_session cookie identity across all game APIs", () => {
    expect(rouletteRoutes).toContain(
      'const SESSION_COOKIE = "roulette_session";',
    );
    expect(rouletteRoutes).toContain("export { SESSION_COOKIE };");

    for (const routeSource of [slotRoutes, cadiRoutes, idleRoutes]) {
      expect(routeSource).toContain(
        'import { SESSION_COOKIE } from "../roulette/routes";',
      );
      expect(routeSource).toContain("req.cookies?.[SESSION_COOKIE]");
      expect(routeSource).toContain("res.cookie(SESSION_COOKIE, sessionId");
    }
  });

  it("keeps Slot, Roulette, Cadı Kazan and Idle on roulette_wallets", () => {
    for (const repositorySource of [
      rouletteRepository,
      slotRepository,
      cadiRepository,
      idleRepository,
    ]) {
      expect(repositorySource).toContain("roulette_wallets");
      expect(repositorySource).toContain("balance_cents");
      expect(repositorySource).toContain("session_id");
    }
  });

  it("keeps the common initial wallet value as the fallback source", () => {
    for (const repositorySource of [
      slotRepository,
      cadiRepository,
      idleRepository,
    ]) {
      expect(repositorySource).toContain("INITIAL_ROULETTE_BALANCE_CENTS");
    }
  });

  it("keeps Idle collect and upgrades writing the same shared wallet", () => {
    expect(idleRepository).toContain(
      "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1 FOR UPDATE",
    );
    expect(idleRepository).toContain(
      "UPDATE roulette_wallets",
    );
    expect(idleRepository).toContain(
      "INSERT INTO roulette_wallets",
    );
  });
});
