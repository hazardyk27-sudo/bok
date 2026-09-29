import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(
      new URL(relativePath, import.meta.url),
    ),
    "utf8",
  );
}

const rouletteRoutes = source(
  "../roulette/routes.ts",
);
const rouletteRepository = source(
  "../roulette/repository.ts",
);
const slotRoutes = source("../slot/routes.ts");
const slotRepository = source(
  "../slot/repository.ts",
);
const cadiRoutes = source(
  "../cadi-kazan/routes.ts",
);
const cadiRepository = source(
  "../cadi-kazan/repository.ts",
);
const idleRoutes = source("./routes.ts");
const stadiumState = source("./stadiumState.ts");
const seatPurchase = source("./seatPurchase.ts");
const ticketSale = source("./ticketSale.ts");

describe("shared game wallet integration", () => {
  it("keeps one roulette_session cookie identity across all game APIs", () => {
    expect(rouletteRoutes).toContain(
      'const SESSION_COOKIE = "roulette_session";',
    );
    expect(rouletteRoutes).toContain(
      "export { SESSION_COOKIE };",
    );

    for (const routeSource of [
      slotRoutes,
      cadiRoutes,
      idleRoutes,
    ]) {
      expect(routeSource).toContain(
        'import { SESSION_COOKIE } from "../roulette/routes";',
      );
      expect(routeSource).toContain(
        "req.cookies?.[SESSION_COOKIE]",
      );
      expect(routeSource).toContain(
        "res.cookie(SESSION_COOKIE, sessionId",
      );
    }
  });

  it("keeps Slot, Roulette, Cadı Kazan and canonical Idle on roulette_wallets", () => {
    for (const repositorySource of [
      rouletteRepository,
      slotRepository,
      cadiRepository,
      stadiumState,
      seatPurchase,
      ticketSale,
    ]) {
      expect(repositorySource).toContain(
        "roulette_wallets",
      );
      expect(repositorySource).toContain(
        "balance_cents",
      );
      expect(repositorySource).toContain(
        "session_id",
      );
    }
  });

  it("uses the common platform initial wallet value when canonical Idle creates a wallet", () => {
    expect(stadiumState).toContain(
      'INITIAL_SHARED_BALANCE_CENTS',
    );
    expect(stadiumState).toContain(
      'from "../platform/wallet"',
    );
    expect(stadiumState).not.toContain(
      "INITIAL_ROULETTE_BALANCE_CENTS",
    );
  });

  it("locks the shared wallet for canonical Idle debits and credits", () => {
    for (const mutationSource of [
      seatPurchase,
      ticketSale,
    ]) {
      expect(mutationSource).toContain(
        "FROM roulette_wallets",
      );
      expect(mutationSource).toContain(
        "FOR UPDATE",
      );
      expect(mutationSource).toContain(
        "UPDATE roulette_wallets",
      );
    }
  });

  it("locks Stadium before wallet while building /idle/state", () => {
    const stadiumLockIndex = stadiumState.indexOf(
      "ensureStadiumState(",
    );
    const walletLockIndex = stadiumState.indexOf(
      "FOR UPDATE",
    );

    expect(stadiumLockIndex)
      .toBeGreaterThan(-1);
    expect(walletLockIndex)
      .toBeGreaterThan(stadiumLockIndex);
  });
});
