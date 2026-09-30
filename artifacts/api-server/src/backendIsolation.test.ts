import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const schemaIndex = read("../../../lib/db/src/schema/index.ts");
const walletSchema = read("../../../lib/db/src/schema/wallet.ts");
const cadiSchema = read("../../../lib/db/src/schema/cadi-kazan.ts");
const slotSchema = read("../../../lib/db/src/schema/slot.ts");
const idleSchema = read("../../../lib/db/src/schema/idle.ts");
const rouletteSchema = read("../../../lib/db/src/schema/roulette.ts");
const routesIndex = read("./routes/index.ts");
const slotRepo = read("./slot/repository.ts");
const cadiRepo = read("./cadi-kazan/repository.ts");
const idleRepo = read("./idle/repository.ts");
const rouletteRepo = read("./roulette/repository.ts");
const slotRoutes = read("./slot/routes.ts");
const cadiRoutes = read("./cadi-kazan/routes.ts");
const idleRoutes = read("./idle/routes.ts");
const rouletteRoutes = read("./roulette/routes.ts");
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

describe("backend game isolation", () => {
  it("keeps the DB schema index aggregation-only", () => {
    expect(schemaIndex).not.toContain("pgTable(");
    expect(schemaIndex).toContain('export * from "./wallet";');
    expect(schemaIndex).toContain('export * from "./cadi-kazan";');
    expect(schemaIndex).toContain('export * from "./slot";');
    expect(schemaIndex).toContain('export * from "./idle";');
    expect(schemaIndex).toContain('export * from "./blackjack";');
    expect(schemaIndex).toContain('export * from "./roulette";');
  });

  it("keeps shared wallet and game tables in their own schema files", () => {
    expect(walletSchema).toContain('"shared_wallets"');
    expect(cadiSchema).toContain('"cadi_kazan_rounds"');
    expect(slotSchema).toContain('"slot_rounds"');
    expect(idleSchema).toContain('"idle_business_states"');
    expect(rouletteSchema).toContain('"roulette_rounds"');
  });

  it("uses shared platform wallet and session contracts", () => {
    for (const source of [slotRepo, cadiRepo, idleRepo, rouletteRepo]) {
      expect(source).toContain('from "../platform/wallet"');
      expect(source).toContain("INITIAL_SHARED_BALANCE_CENTS");
      expect(source).toContain("shared_wallets");
    }
    expect(blackjackPlatform).toContain('from "./wallet"');
    expect(blackjackPlatform).toContain("INITIAL_SHARED_BALANCE_CENTS");
    expect(blackjackPlatform).toContain("shared_wallets");
    for (const source of [slotRoutes, cadiRoutes, idleRoutes, rouletteRoutes]) {
      expect(source).toContain('from "../platform/session"');
    }
    expect(blackjackPlatform).toContain('from "./session"');
    expect(blackjackPlatform).toContain("shared_wallets");
  });

  it("routes through stable live-game backend entrypoints", () => {
    expect(routesIndex).toContain('from "../cadi-kazan"');
    expect(routesIndex).toContain('from "../slot"');
    expect(routesIndex).toContain('from "../idle"');
    expect(routesIndex).toContain('from "../blackjack"');
    expect(routesIndex).toContain('from "../roulette"');
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
    expect(frontendMain).toContain('import("./platform/sessionConvergence")');
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

  it("wires Blackjack runtime through shared platform entrypoints", () => {
    expect(routesIndex).toContain(
      'blackjackPlatformRouter } from "../platform/blackjack"',
    );
    expect(routesIndex).toContain("router.use(blackjackPlatformRouter)");
    expect(serverIndex).toContain(
      'attachBlackjackPlatformRuntime } from "./platform/blackjack"',
    );
    expect(serverIndex).toContain(
      "await attachBlackjackPlatformRuntime(server)",
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
