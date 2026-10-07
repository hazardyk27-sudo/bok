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
const routesIndex = read("./routes/index.ts");
const healthRoutes = read("./routes/health.ts");
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

const slotRepo = read("./slot/repository.ts");
const cadiRepo = read("./cadi-kazan/repository.ts");
const rouletteRepo = read("./roulette/repository.ts");
const idleRepositoryPath = fileURLToPath(new URL("./idle/repository.ts", import.meta.url));
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

describe("backend game isolation", () => {
  it("keeps the schema aggregator limited to active platform/game schemas", () => {
    expect(schemaIndex).not.toContain("pgTable(");
    for (const name of ["wallet", "cadi-kazan", "slot", "idle", "auth", "roulette"]) {
      expect(schemaIndex).toContain(`export * from "./${name}";`);
    }
    expect(schemaIndex.toLowerCase()).not.toContain("blackjack");
  });

  it("routes only active backend games", () => {
    for (const name of ["cadi-kazan", "slot", "idle", "roulette", "auth"]) {
      expect(routesIndex).toContain(name);
    }
    expect(routesIndex.toLowerCase()).not.toContain("blackjack");
  });

  it("keeps shared wallet/session authority for every remaining game", () => {
    for (const source of [slotRepo, cadiRepo, rouletteRepo]) {
      expect(source).toContain('from "../platform/wallet"');
      expect(source).toContain("shared_wallets");
    }
    for (const source of idleWalletSources) {
      const usesSharedWalletConstant = source.includes("SHARED_WALLET_TABLE");
      const usesLiteralSharedWallet = source.includes("shared_wallets");
      expect(usesSharedWalletConstant || usesLiteralSharedWallet).toBe(true);
      expect(source).not.toContain("roulette_wallets");
    }
    expect(walletPlatform).toContain('SHARED_WALLET_TABLE = "shared_wallets"');
    expect(sessionPlatform).toContain('SESSION_COOKIE = "game_session"');
  });

  it("converges only active historical game scopes", () => {
    for (const endpoint of [
      "/api/slot/session-converge",
      "/api/roulette/session-converge",
      "/api/cadi-kazan/session-converge",
      "/api/idle/session-converge",
    ]) {
      expect(sessionConvergenceClient).toContain(endpoint);
    }
    expect(sessionConvergenceClient.toLowerCase()).not.toContain("blackjack");
    expect(sessionPlatform.toLowerCase()).not.toContain("blackjack");
    expect(sessionConvergenceApi).toContain("SESSION_CONVERGENCE_ROUTE_PATHS");
  });

  it("keeps the retired game out of shared runtime and frontend routing", () => {
    expect(routesIndex.toLowerCase()).not.toContain("blackjack");
    expect(serverIndex.toLowerCase()).not.toContain("blackjack");
    expect(frontendMain.toLowerCase()).not.toContain("blackjack");
    expect(appSource.toLowerCase()).not.toContain("blackjack");
  });

  it("fails closed on an unverified or implicit Supabase cutover", () => {
    expect(walletSchema).toContain('"oyun_migration_receipts"');
    expect(dbRuntime).toContain('USE_SUPABASE_DATABASE === "true"');
    expect(dbRuntime).toContain("assertDatabaseCutoverReady");
    expect(drizzleConfig).toContain('USE_SUPABASE_DATABASE === "true"');
    expect(serverIndex).toContain("await assertDatabaseCutoverReady()");
    expect(migrationScript).toContain("oyun_migration_receipts");
    expect(migrationScript).toContain("VERIFIED_MIGRATION_RECEIPT: yes");
  });

  it("keeps Replit web, API and readiness checks aligned", () => {
    expect(apiPackage).toContain("node --watch");
    expect(apiDevRunner).toContain('spawnSync("pnpm", ["run", "build"]');
    expect(viteConfig).toContain('const defaultApiProxyTarget = "http://127.0.0.1:8080"');
    expect(localStackScript).toContain('API_PORT="${API_PORT:-8080}"');
    expect(replitSyncScript).toContain("127.0.0.1:8080/api/readyz");
    expect(healthRoutes).toContain('router.get("/readyz"');
  });
});
