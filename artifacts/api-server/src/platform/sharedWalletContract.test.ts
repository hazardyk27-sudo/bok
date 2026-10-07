import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  chooseHighestBalanceSessionCandidate,
  chooseSessionIdForWalletMigration,
  getLegacyScopedSessionPathForRequest,
  getSessionCookieCandidates,
} from "./session";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const appSource = source("../app.ts");
const sessionSource = source("./session.ts");
const walletSource = source("./wallet.ts");
const sessionConvergenceApi = source("./sessionConvergence.ts");
const sessionConvergenceClient = source("../../../cascade-8/src/platform/sessionConvergence.ts");
const frontendMain = source("../../../cascade-8/src/main.ts");
const slotRoutes = source("../slot/routes.ts");
const rouletteRoutes = source("../roulette/routes.ts");
const cadiRoutes = source("../cadi-kazan/routes.ts");
const idleRoutes = source("../idle/routes.ts");
const slotRepository = source("../slot/repository.ts");
const rouletteRepository = source("../roulette/repository.ts");
const cadiRepository = source("../cadi-kazan/repository.ts");
const idleRepositoryPath = fileURLToPath(new URL("../idle/repository.ts", import.meta.url));
const idleWalletSources = existsSync(idleRepositoryPath)
  ? [source("../idle/repository.ts")]
  : [
      source("../idle/stadiumState.ts"),
      source("../idle/seatPurchase.ts"),
      source("../idle/stadiumUpgrade.ts"),
      source("../idle/speedUpgrade.ts"),
      source("../idle/storageUpgrade.ts"),
      source("../idle/ticketSale.ts"),
    ];
const slotSchema = source("../../../../lib/db/src/schema/slot.ts");

describe("canonical shared wallet contract", () => {
  it("uses game_session as the only live game identity", () => {
    expect(sessionSource).toContain('SESSION_COOKIE = "game_session"');
    expect(sessionSource).toContain('LEGACY_SESSION_COOKIE = "roulette_session"');
    expect(appSource).toContain("getSessionCookieCandidates(req.headers.cookie)");
    expect(appSource).toContain("resolveCanonicalWalletSessionCandidates");
  });

  it("detects duplicate path-scoped game_session cookies", () => {
    expect(getSessionCookieCandidates(
      "game_session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; game_session=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    )).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
  });

  it("clears legacy scoped cookies only for active game scopes", () => {
    expect(getLegacyScopedSessionPathForRequest("/api/slot/session-converge")).toBe("/api/slot");
    expect(getLegacyScopedSessionPathForRequest("/api/roulette/spins")).toBe("/api/roulette");
    expect(getLegacyScopedSessionPathForRequest("/api/healthz")).toBeNull();
    expect(sessionSource.toLowerCase()).not.toContain("blackjack");
  });

  it("root-scopes every remaining HTTP game_session cookie", () => {
    for (const routeSource of [slotRoutes, rouletteRoutes, cadiRoutes, idleRoutes]) {
      expect(routeSource).toContain('path: "/"');
    }
  });

  it("discovers every remaining historical game cookie scope before bootstrap", () => {
    for (const endpoint of [
      "/api/slot/session-converge",
      "/api/roulette/session-converge",
      "/api/cadi-kazan/session-converge",
      "/api/idle/session-converge",
    ]) {
      expect(sessionConvergenceClient).toContain(endpoint);
    }
    expect(sessionConvergenceClient.toLowerCase()).not.toContain("blackjack");
    expect(sessionConvergenceApi).toContain("SESSION_CONVERGENCE_ROUTE_PATHS");
    expect(frontendMain).toContain("await convergeLegacyGameSessions()");
  });

  it("preserves the highest discovered fragmented wallet without summing balances", () => {
    expect(chooseHighestBalanceSessionCandidate([
      { sessionId: "slot-shadow", balanceCents: 100_000 },
      { sessionId: "roulette-real", balanceCents: 198_398_592_200 },
      { sessionId: "idle-shadow", balanceCents: 850_000 },
    ])).toBe("roulette-real");
    expect(walletSource).not.toContain("SUM(balance_cents)");
  });

  it("keeps shared_wallets as the only live spendable wallet authority", () => {
    expect(walletSource).toContain('SHARED_WALLET_TABLE = "shared_wallets"');
    for (const repositorySource of [slotRepository, rouletteRepository, cadiRepository]) {
      expect(repositorySource).toContain("shared_wallets");
      expect(repositorySource).not.toContain("roulette_wallets");
    }
    for (const idleWalletSource of idleWalletSources) {
      const usesSharedWalletConstant = idleWalletSource.includes("SHARED_WALLET_TABLE");
      const usesLiteralSharedWallet = idleWalletSource.includes("shared_wallets");
      expect(usesSharedWalletConstant || usesLiteralSharedWallet).toBe(true);
      expect(idleWalletSource).not.toContain("roulette_wallets");
    }
  });

  it("preserves the highest server-side balance during legacy session convergence", () => {
    expect(chooseSessionIdForWalletMigration({
      canonicalSessionId: "canonical-session-123456",
      legacySessionId: "legacy-session-123456789",
      canonicalBalanceCents: 100_000,
      legacyBalanceCents: 250_000_000,
      initialBalanceCents: 100_000,
    })).toBe("legacy-session-123456789");
  });

  it("keeps Slot money storage bigint-safe for high bets and payouts", () => {
    expect(slotSchema).toContain('bigint("stake_cents"');
    expect(slotSchema).toContain('bigint("payout_cents"');
    expect(slotSchema).toContain('bigint("amount_cents"');
    expect(slotRepository).toContain("ensureBigMoneyStorage");
  });
});
