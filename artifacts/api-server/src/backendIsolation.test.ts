import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const schemaIndex = read("../../../lib/db/src/schema/index.ts");
const walletSchema = read("../../../lib/db/src/schema/wallet.ts");
const dbRuntime = read("../../../lib/db/src/index.ts");
const drizzleConfig = read("../../../lib/db/drizzle.config.ts");
const migrationScript = read("../../../scripts/migrate-replit-postgres-to-supabase.sh");
const cadiSchema = read("../../../lib/db/src/schema/cadi-kazan.ts");
const slotSchema = read("../../../lib/db/src/schema/slot.ts");
const idleSchema = read("../../../lib/db/src/schema/idle.ts");
const authSchema = read("../../../lib/db/src/schema/auth.ts");
const rouletteSchema = read("../../../lib/db/src/schema/roulette.ts");
const routesIndex = read("./routes/index.ts");
const healthRoutes = read("./routes/health.ts");
const slotRepo = read("./slot/repository.ts");
const cadiRepo = read("./cadi-kazan/repository.ts");
const idleRepositoryPath = fileURLToPath(
  new URL("./idle/repository.ts", import.meta.url),
);
const idleWalletSources = existsSync(idleRepositoryPath)
  ? [read("./idle/repository.ts")]
  : [
      read("./idle/stadiumState.ts"),
      read("./idle/seatPurchase.ts"),
      read("./idle/stadiumUpgrade.ts"),
      read("./idle/speedUpgrade.ts"),
      read("./idle/storageUpgrade.ts"),
      read("./idle/ticketSale.ts"),
    ];
const rouletteRepo = read("./roulette/repository.ts");
const slotRoutes = read("./slot/routes.ts");
const cadiRoutes = read("./cadi-kazan/routes.ts");
const idleRoutes = read("./idle/routes.ts");
const rouletteRoutes = read("./roulette/routes.ts");
const authRoutes = read("./auth/routes.ts");
const authRepository = read("./auth/repository.ts");
const blackjackPlatform = read("./platform/blackjack.ts");
const sessionPlatform = read("./platform/session.ts");
const walletPlatform = read("./platform/wallet.ts");
const sessionConvergenceApi = read("./platform/sessionConvergence.ts");
const sessionConvergenceClient = read("../../cascade-8/src/platform/sessionConvergence.ts");
const frontendMain = read("../../cascade-8/src/main.ts");
const appSource = read("./app.ts");
const apiPackage = read("../package.json");
const apiDevRunner = read("../dev-runner.mjs");
const serverIndex = read("./index.ts");
const viteConfig = read("../../cascade-8/vite.config.ts");
const localStackScript = read("../../../scripts/run-local-stack.sh");
const replitSyncScript = read("../../../scripts/replit-sync-preview.sh");

describe("backend game isolation", () => {
  it("keeps the DB schema index aggregation-only", () => {
    expect(schemaIndex).not.toContain("pgTable(");
    expect(schemaIndex).toContain('export * from "./wallet";');
    expect(schemaIndex).toContain('export * from "./cadi-kazan";');
    expect(schemaIndex).toContain('export * from "./slot";');
    expect(schemaIndex).toContain('export * from "./idle";');
    expect(schemaIndex).toContain('export * from "./auth";');
    expect(schemaIndex).toContain('export * from "./blackjack";');
    expect(schemaIndex).toContain('export * from "./roulette";');
  });

  it("keeps shared wallet and game tables in their own schema files", () => {
    expect(walletSchema).toContain('"shared_wallets"');
    expect(cadiSchema).toContain('"cadi_kazan_rounds"');
    expect(slotSchema).toContain('"slot_rounds"');
    expect(idleSchema).toContain('"idle_business_states"');
    expect(authSchema).toContain('"users"');
    expect(authSchema).toContain('"wallet_session_id"');
    expect(rouletteSchema).toContain('"roulette_rounds"');
  });

  it("uses shared platform wallet and session contracts", () => {
    for (const source of [slotRepo, cadiRepo, rouletteRepo]) {
      expect(source).toContain('from "../platform/wallet"');
      expect(source).toContain("INITIAL_SHARED_BALANCE_CENTS");
      expect(source).toContain("shared_wallets");
    }

    for (const idleSource of idleWalletSources) {
      expect(idleSource).toContain('from "../platform/wallet"');
      expect(idleSource).toContain("INITIAL_SHARED_BALANCE_CENTS");
      if (idleSource.includes("SHARED_WALLET_TABLE")) {
        expect(idleSource).not.toContain("roulette_wallets");
      } else {
        expect(idleSource).toContain("shared_wallets");
      }
    }

    expect(blackjackPlatform).toContain('from "./wallet"');
    expect(blackjackPlatform).toContain("INITIAL_SHARED_BALANCE_CENTS");
    expect(blackjackPlatform).toContain("shared_wallets");

    for (const source of [slotRoutes, cadiRoutes, rouletteRoutes]) {
      expect(source).toContain('from "../platform/session"');
    }

    const idleUsesCanonicalSessionImport =
      idleRoutes.includes('from "../platform/session"');
    const idleUsesPlatformGenerationCompatibility =
      idleRoutes.includes('from "../platform/wallet"')
      && idleRoutes.includes('"game_session"')
      && idleRoutes.includes('path: "/"');

    expect(
      idleUsesCanonicalSessionImport
      || idleUsesPlatformGenerationCompatibility,
    ).toBe(true);

    expect(blackjackPlatform).toContain('from "./session"');
    expect(blackjackPlatform).toContain("shared_wallets");
  });

  it("routes through stable live-game backend entrypoints", () => {
    expect(routesIndex).toContain('from "../cadi-kazan"');
    expect(routesIndex).toContain('from "../slot"');
    expect(routesIndex).toContain('from "../idle"');
    expect(routesIndex).toContain('from "../blackjack"');
    expect(routesIndex).toContain('from "../roulette"');
    expect(routesIndex).toContain('authRouter } from "../auth"');
    expect(routesIndex).toContain("router.use(authRouter)");
  });

  it("wires account identity to the canonical shared wallet without a second wallet table", () => {
    expect(authRoutes).toContain('const GAME_SESSION_COOKIE = "game_session"');
    expect(authRoutes).toContain('router.post("/auth/register"');
    expect(authRoutes).toContain('router.post("/auth/login"');
    expect(authRepository).toContain("INSERT INTO shared_wallets");
    expect(authRepository).toContain("INNER JOIN shared_wallets");
    expect(authRepository).not.toContain("auth_wallet");
    expect(frontendMain).toContain('currentPath === "/account"');
    expect(frontendMain).toContain('import("./account")');
  });

  it("keeps one root-scoped shared game_session identity with legacy migration", () => {
    expect(sessionPlatform).toContain('SESSION_COOKIE = "game_session"');
    expect(sessionPlatform).toContain('LEGACY_SESSION_COOKIE = "roulette_session"');
    expect(sessionPlatform).toContain("LEGACY_SCOPED_SESSION_PATHS");
    expect(appSource).toContain("getSessionCookieCandidates(req.headers.cookie)");
    expect(appSource).toContain("getLegacySessionId(req.cookies)");
    expect(appSource).toContain("resolveCanonicalWalletSessionCandidates");
    expect(appSource).toContain("res.cookie(SESSION_COOKIE, selectedSessionId");
    expect(appSource).toContain('path: "/"');
    expect(appSource).toContain("getLegacyScopedSessionPathForRequest(req.path)");
    expect(appSource).toContain("res.clearCookie(SESSION_COOKIE");
    expect(appSource).toContain("res.clearCookie(LEGACY_SESSION_COOKIE");
    expect(appSource).not.toContain("res.cookie(SESSION_COOKIE, legacySessionId");
  });

  it("actively discovers legacy game-scoped sessions before game bootstrap", () => {
    expect(routesIndex).toContain('sessionConvergenceRouter } from "../platform/sessionConvergence"');
    expect(routesIndex.indexOf("router.use(sessionConvergenceRouter)"))
      .toBeLessThan(routesIndex.indexOf("router.use(slotRouter)"));
    for (const path of [
      "/api/slot/session-converge",
      "/api/roulette/session-converge",
      "/api/cadi-kazan/session-converge",
      "/api/idle/session-converge",
      "/api/blackjack/session-converge",
    ]) {
      expect(sessionConvergenceClient).toContain(path);
    }
    expect(sessionConvergenceClient).toContain("for (const endpoint of SESSION_CONVERGENCE_ENDPOINTS)");
    expect(sessionConvergenceClient).toContain('credentials: "same-origin"');
    expect(frontendMain).toContain('"./platform/sessionConvergence"');
    expect(frontendMain).toContain("await convergeLegacyGameSessions()");
    expect(sessionConvergenceApi).toContain("SESSION_CONVERGENCE_ROUTE_PATHS");
  });

  it("preserves the highest discovered wallet without summing fragmented balances", () => {
    expect(sessionPlatform).toContain("chooseHighestBalanceSessionCandidate");
    expect(walletPlatform).toContain("chooseHighestBalanceSessionCandidate(");
    expect(walletPlatform).not.toContain("SUM(balance_cents)");
  });

  it("keeps the Replit API runtime hot-reloadable after preview sync", () => {
    expect(apiPackage).toContain("node --watch");
    expect(apiPackage).toContain("--watch-path=src");
    expect(apiPackage).toContain("--watch-path=../cascade-8/src");
    expect(apiPackage).toContain("--watch-path=../../lib/db/src");
    expect(apiPackage).toContain("./dev-runner.mjs");
    expect(apiDevRunner).toContain('spawnSync("pnpm", ["run", "build"]');
    expect(apiDevRunner).toContain("dist/index.mjs");
  });

  it("fails closed on an unverified or implicit Supabase cutover", () => {
    expect(walletSchema).toContain('"oyun_migration_receipts"');
    expect(dbRuntime).toContain('USE_SUPABASE_DATABASE === "true"');
    expect(dbRuntime).toContain(": env.DATABASE_URL;");
    expect(dbRuntime).not.toContain(
      "env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL",
    );
    expect(drizzleConfig).toContain('USE_SUPABASE_DATABASE === "true"');
    expect(drizzleConfig).toContain(": process.env.DATABASE_URL;");
    expect(drizzleConfig).not.toContain(
      "process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL",
    );
    expect(dbRuntime).toContain("assertDatabaseCutoverReady");
    expect(dbRuntime).toContain("SUPABASE_CUTOVER_BLOCKED");
    expect(dbRuntime).toContain("helium_to_supabase_v1");
    expect(serverIndex).toContain("await assertDatabaseCutoverReady()");
    expect(serverIndex.indexOf("await assertDatabaseCutoverReady()"))
      .toBeLessThan(serverIndex.indexOf("server.listen(port"));
    expect(migrationScript).toContain("oyun_migration_receipts");
    expect(migrationScript).toContain("VERIFIED_MIGRATION_RECEIPT: yes");
    expect(migrationScript.indexOf('if [[ "$relation_issues" -ne 0 ]]'))
      .toBeLessThan(migrationScript.indexOf("VERIFIED_MIGRATION_RECEIPT: yes"));
  });

  it("keeps Replit web, API and sync health checks on one API port", () => {
    expect(viteConfig).toContain(
      'const defaultApiProxyTarget = "http://127.0.0.1:8080"',
    );
    expect(localStackScript).toContain('API_PORT="${API_PORT:-8080}"');
    expect(replitSyncScript).toContain(
      "Waiting for API runtime readiness on 127.0.0.1:8080",
    );
    expect(replitSyncScript).toContain(
      "fetch('http://127.0.0.1:8080/api/readyz'",
    );
    expect(replitSyncScript).toContain("AbortSignal.timeout(2000)");
    expect(localStackScript).toContain("/api/readyz");
    expect(healthRoutes).toContain('router.get("/readyz"');
    expect(healthRoutes).toContain('await pool.query("SELECT 1")');
  });

  it("does not let shared startup maintenance block the HTTP listener", () => {
    const listenAt = serverIndex.indexOf("server.listen(port");
    const walletInitializationAt = serverIndex.indexOf(
      "initializeSharedWalletPlatform()",
    );
    const blackjackAttachAt = serverIndex.indexOf(
      "attachBlackjackPlatformRuntime(server)",
    );

    expect(listenAt).toBeGreaterThan(-1);
    expect(walletInitializationAt).toBeGreaterThan(-1);
    expect(blackjackAttachAt).toBeGreaterThan(-1);
    expect(listenAt).toBeLessThan(walletInitializationAt);
    expect(listenAt).toBeLessThan(blackjackAttachAt);
    expect(serverIndex).not.toContain(
      "await initializeSharedWalletPlatform()",
    );
    expect(serverIndex).not.toContain(
      "await attachBlackjackPlatformRuntime(server)",
    );
    expect(serverIndex).toContain("void initializeSharedWalletPlatform()");
    expect(serverIndex).toContain("void attachBlackjackPlatformRuntime(server)");
    expect(serverIndex).toContain("pool.end()");
  });

  it("never waits indefinitely for the shared-wallet startup advisory lock", () => {
    expect(walletPlatform).toContain("pg_try_advisory_xact_lock");
    expect(walletPlatform).not.toContain(
      "SELECT pg_advisory_xact_lock(hashtextextended('shared-wallet-platform-v2'",
    );
    expect(walletPlatform).toContain("skippedBecauseAnotherInitializer: true");
  });

  it("wires Blackjack runtime through shared platform entrypoints", () => {
    expect(routesIndex).toContain(
      'blackjackPlatformRouter } from "../platform/blackjack"',
    );
    expect(routesIndex).toContain("router.use(blackjackPlatformRouter)");
    expect(serverIndex).toContain(
      'attachBlackjackPlatformRuntime } from "./platform/blackjack"',
    );
    expect(serverIndex).toContain(
      "void attachBlackjackPlatformRuntime(server)",
    );
    expect(blackjackPlatform).toContain(
      "initializeAndAttachBlackjackServerRuntime",
    );
    expect(blackjackPlatform).toContain(
      "createShuffledBlackjackShoe",
    );
    expect(blackjackPlatform).toContain(
      "BLACKJACK_SHARED_WALLET_CHANGED",
    );
  });

});
