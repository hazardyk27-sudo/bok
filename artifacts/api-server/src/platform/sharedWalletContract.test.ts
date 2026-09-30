import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chooseSessionIdForWalletMigration, getSessionCookieCandidates } from "./session";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const appSource = source("../app.ts");
const sessionSource = source("./session.ts");
const walletSource = source("./wallet.ts");
const slotRoutes = source("../slot/routes.ts");
const rouletteRoutes = source("../roulette/routes.ts");
const cadiRoutes = source("../cadi-kazan/routes.ts");
const idleRoutes = source("../idle/routes.ts");
const slotRepository = source("../slot/repository.ts");
const rouletteRepository = source("../roulette/repository.ts");
const cadiRepository = source("../cadi-kazan/repository.ts");
const idleRepository = source("../idle/repository.ts");
const blackjackPlatform = source("./blackjack.ts");
const slotSchema = source("../../../../lib/db/src/schema/slot.ts");

describe("canonical shared wallet contract", () => {
  it("uses game_session as the only live cookie and roulette_session only as legacy input", () => {
    expect(sessionSource).toContain('SESSION_COOKIE = "game_session"');
    expect(sessionSource).toContain('LEGACY_SESSION_COOKIE = "roulette_session"');
    expect(appSource).toContain("getCanonicalSessionId");
    expect(appSource).toContain("getLegacySessionId");
    expect(appSource).toContain("resolveCanonicalWalletSessionId");
    expect(appSource).not.toContain("req.cookies[SESSION_COOKIE] = legacySessionId");
  });

  it("detects duplicate path-scoped game_session cookies", () => {
    expect(getSessionCookieCandidates(
      "game_session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; game_session=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    )).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
    expect(appSource).toContain("LEGACY_SCOPED_SESSION_PATHS");
    expect(appSource).toContain("resolveCanonicalWalletSessionCandidates");
  });

  it("root-scopes every HTTP game_session cookie", () => {
    for (const routeSource of [
      slotRoutes,
      rouletteRoutes,
      cadiRoutes,
      idleRoutes,
      blackjackPlatform,
    ]) {
      expect(routeSource).toContain('path: "/"');
    }
  });

  it("keeps shared_wallets as the only live spendable wallet authority", () => {
    expect(walletSource).toContain('SHARED_WALLET_TABLE = "shared_wallets"');
    expect(walletSource).toContain('LEGACY_WALLET_TABLE = "roulette_wallets"');
    expect(walletSource).toContain("shared_wallet_legacy_imports");

    for (const repositorySource of [
      slotRepository,
      rouletteRepository,
      cadiRepository,
      idleRepository,
      blackjackPlatform,
    ]) {
      expect(repositorySource).toContain("shared_wallets");
      expect(repositorySource).not.toContain("roulette_wallets");
    }
  });

  it("prefers a real legacy balance over an untouched canonical default only during migration", () => {
    expect(chooseSessionIdForWalletMigration({
      canonicalSessionId: "canonical-session-123456",
      legacySessionId: "legacy-session-123456789",
      canonicalBalanceCents: 100_000,
      legacyBalanceCents: 250_000_000,
      initialBalanceCents: 100_000,
    })).toBe("legacy-session-123456789");

    expect(chooseSessionIdForWalletMigration({
      canonicalSessionId: "canonical-session-123456",
      legacySessionId: "legacy-session-123456789",
      canonicalBalanceCents: 300_000_000,
      legacyBalanceCents: 250_000_000,
      initialBalanceCents: 100_000,
    })).toBe("canonical-session-123456");
  });

  it("keeps Slot money storage bigint-safe for high bets and payouts", () => {
    expect(slotSchema).toContain('bigint("stake_cents"');
    expect(slotSchema).toContain('bigint("payout_cents"');
    expect(slotSchema).toContain('bigint("amount_cents"');
    expect(slotRepository).toContain("ensureBigMoneyStorage");
    expect(slotRepository).not.toContain("::integer");
  });
});
