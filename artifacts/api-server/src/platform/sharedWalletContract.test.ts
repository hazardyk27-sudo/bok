import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BLACKJACK_REALTIME_SESSION_COOKIE,
  BLACKJACK_REALTIME_SESSION_COOKIE_PATH,
  resolveBlackjackRealtimeSessionId,
} from "../blackjack/realtimeIdentity";
import { chooseHighestBalanceSessionCandidate, chooseSessionIdForWalletMigration, getLegacyScopedSessionPathForRequest, getSessionCookieCandidates } from "./session";

function source(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
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
const idleRepositoryPath = fileURLToPath(
  new URL("../idle/repository.ts", import.meta.url),
);
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
const blackjackPlatform = source("./blackjack.ts");
const slotSchema = source("../../../../lib/db/src/schema/slot.ts");

describe("canonical shared wallet contract", () => {
  it("uses game_session as the only live cookie and roulette_session only as legacy input", () => {
    expect(sessionSource).toContain('SESSION_COOKIE = "game_session"');
    expect(sessionSource).toContain('LEGACY_SESSION_COOKIE = "roulette_session"');
    expect(appSource).toContain("getSessionCookieCandidates(req.headers.cookie)");
    expect(appSource).toContain("getLegacySessionId");
    expect(appSource).toContain("resolveCanonicalWalletSessionCandidates");
    expect(appSource).not.toContain("req.cookies[SESSION_COOKIE] = legacySessionId");
  });

  it("detects duplicate path-scoped game_session cookies", () => {
    expect(getSessionCookieCandidates(
      "game_session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa; game_session=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    )).toEqual([
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ]);
    expect(sessionSource).toContain("LEGACY_SCOPED_SESSION_PATHS");
    expect(appSource).toContain("resolveCanonicalWalletSessionCandidates");
  });

  it("binds Blackjack realtime identity to the canonical HTTP-selected session", () => {
    const bound = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const header = [
      "game_session=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "game_session=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${bound}`,
    ].join("; ");

    expect(resolveBlackjackRealtimeSessionId(header)).toBe(bound);
    expect(BLACKJACK_REALTIME_SESSION_COOKIE_PATH).toBe("/api/blackjack/ws");
    expect(blackjackPlatform).toContain("setBlackjackRealtimeSessionBinding");
    expect(blackjackPlatform).toContain("resolveBlackjackRealtimeSessionId");
    expect(blackjackPlatform).toContain("BLACKJACK_REALTIME_SESSION_COOKIE_PATH");
    expect(blackjackPlatform).not.toContain("getSessionCookieCandidates");
    expect(blackjackPlatform).not.toContain("candidates.at(-1)");
  });

  it("clears a legacy scoped cookie only after that scope is actually requested", () => {
    expect(getLegacyScopedSessionPathForRequest("/api/slot/session-converge"))
      .toBe("/api/slot");
    expect(getLegacyScopedSessionPathForRequest("/api/roulette/spins"))
      .toBe("/api/roulette");
    expect(getLegacyScopedSessionPathForRequest("/api/healthz"))
      .toBeNull();
    expect(appSource).toContain("getLegacyScopedSessionPathForRequest(req.path)");
    expect(appSource).toContain("path: observedLegacyScope");
    expect(appSource).not.toContain("for (const path of LEGACY_SCOPED_SESSION_PATHS)");
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

    const idleUsesCanonicalSessionImport =
      idleRoutes.includes('from "../platform/session"');
    const idleUsesPlatformGenerationCompatibility =
      idleRoutes.includes('from "../platform/wallet"')
      && idleRoutes.includes('"game_session"');

    expect(
      idleUsesCanonicalSessionImport
      || idleUsesPlatformGenerationCompatibility,
    ).toBe(true);
  });

  it("discovers every historical game cookie scope once per browser profile before mounting the selected game", () => {
    for (const endpoint of [
      "/api/slot/session-converge",
      "/api/roulette/session-converge",
      "/api/cadi-kazan/session-converge",
      "/api/idle/session-converge",
      "/api/blackjack/session-converge",
    ]) {
      expect(sessionConvergenceClient).toContain(endpoint);
    }
    expect(sessionConvergenceClient).toContain("for (const endpoint of SESSION_CONVERGENCE_ENDPOINTS)");
    expect(sessionConvergenceApi).toContain("SESSION_CONVERGENCE_ROUTE_PATHS");
    expect(frontendMain).toContain("await convergeLegacyGameSessions()");
    expect(frontendMain).toContain("window.localStorage.getItem");
    expect(frontendMain).toContain("window.localStorage.setItem");
    expect(frontendMain).toContain("oyun-session-convergence-browser-v1");
  });

  it("avoids a wallet lookup for the steady-state single canonical session", () => {
    expect(walletSource).toContain("candidates.length === 1");
    expect(walletSource).toContain("legacySessionId === null");
    expect(walletSource.indexOf("candidates.length === 1"))
      .toBeLessThan(walletSource.indexOf("pool.query<WalletBalanceRow>"));
  });

  it("suppresses successful high-frequency access logs while preserving error logging", () => {
    expect(appSource).toContain("customLogLevel");
    expect(appSource).toContain('url === "/api/roulette/state"');
    expect(appSource).toContain('url === "/api/idle/market/live"');
    expect(appSource).toContain('return "silent"');
    expect(appSource).toContain('return "error"');
  });

  it("preserves the highest discovered fragmented wallet without summing balances", () => {
    expect(chooseHighestBalanceSessionCandidate([
      { sessionId: "slot-shadow", balanceCents: 100_000 },
      { sessionId: "roulette-real", balanceCents: 198_398_592_200 },
      { sessionId: "idle-shadow", balanceCents: 850_000 },
    ])).toBe("roulette-real");

    expect(chooseHighestBalanceSessionCandidate([
      { sessionId: "older", balanceCents: 500_000 },
      { sessionId: "newer", balanceCents: 500_000 },
    ])).toBe("newer");

    expect(walletSource).not.toContain("SUM(balance_cents)");
  });

  it("journals Blackjack durable checkpoints in the same wallet transaction", () => {
    expect(blackjackPlatform).toContain(
      "createBlackjackJournalCheckpoint",
    );
    expect(blackjackPlatform).toContain(
      "new BlackjackJournalRepository(database)",
    );
    expect(blackjackPlatform).toContain(
      "await journalRepository.append(",
    );
    expect(blackjackPlatform).toContain(
      "MAX(event_sequence)::text AS event_sequence",
    );
    expect(blackjackPlatform).toContain('await client.query("BEGIN")');
    expect(blackjackPlatform).toContain('await client.query("COMMIT")');
    expect(blackjackPlatform).toContain('await client.query("ROLLBACK")');
  });

  it("applies Blackjack money as deltas over the locked shared wallet", () => {
    expect(blackjackPlatform).toContain(
      "rebaseBlackjackSnapshotAgainstSharedWallets",
    );
    expect(blackjackPlatform).toContain(
      "balance_cents::text AS balance_cents",
    );
    expect(blackjackPlatform).toContain("FOR UPDATE");
    expect(blackjackPlatform).toContain(
      "mutation.sharedBalanceAfterCents",
    );
    expect(blackjackPlatform).toContain(
      "loadAvailableBalanceCents: loadBlackjackAvailableBalanceCents",
    );
    expect(blackjackPlatform).not.toContain(
      "BLACKJACK_SHARED_WALLET_CHANGED",
    );
  });

  it("keeps shared_wallets as the only live spendable wallet authority", () => {
    expect(walletSource).toContain('SHARED_WALLET_TABLE = "shared_wallets"');
    expect(walletSource).toContain('LEGACY_WALLET_TABLE = "roulette_wallets"');
    expect(walletSource).toContain("shared_wallet_legacy_imports");

    for (const repositorySource of [
      slotRepository,
      rouletteRepository,
      cadiRepository,
      blackjackPlatform,
    ]) {
      expect(repositorySource).toContain("shared_wallets");
      expect(repositorySource).not.toContain("roulette_wallets");
    }

    for (const idleWalletSource of idleWalletSources) {
      if (idleWalletSource.includes("SHARED_WALLET_TABLE")) {
        expect(idleWalletSource).not.toContain("roulette_wallets");
      } else {
        expect(idleWalletSource).toContain("shared_wallets");
        expect(idleWalletSource).not.toContain("roulette_wallets");
      }
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

    expect(chooseSessionIdForWalletMigration({
      canonicalSessionId: "canonical-session-123456",
      legacySessionId: "legacy-session-123456789",
      canonicalBalanceCents: 300_000_000,
      legacyBalanceCents: 250_000_000,
      initialBalanceCents: 100_000,
    })).toBe("canonical-session-123456");

    expect(chooseSessionIdForWalletMigration({
      canonicalSessionId: "small-root-session-123",
      legacySessionId: "legacy-million-session-123",
      canonicalBalanceCents: 90_000,
      legacyBalanceCents: 250_000_000,
      initialBalanceCents: 100_000,
    })).toBe("legacy-million-session-123");
  });

  it("keeps Slot money storage bigint-safe for high bets and payouts", () => {
    expect(slotSchema).toContain('bigint("stake_cents"');
    expect(slotSchema).toContain('bigint("payout_cents"');
    expect(slotSchema).toContain('bigint("amount_cents"');
    expect(slotRepository).toContain("ensureBigMoneyStorage");
    expect(slotRepository).not.toContain("::integer");
  });
});
