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
const routesIndex = read("./routes/index.ts");
const slotRepo = read("./slot/repository.ts");
const cadiRepo = read("./cadi-kazan/repository.ts");
const idleRepo = read("./idle/repository.ts");
const slotRoutes = read("./slot/routes.ts");
const cadiRoutes = read("./cadi-kazan/routes.ts");
const idleRoutes = read("./idle/routes.ts");
const blackjackPlatform = read("./platform/blackjack.ts");
const serverIndex = read("./index.ts");

describe("backend game isolation", () => {
  it("keeps the DB schema index aggregation-only", () => {
    expect(schemaIndex).not.toContain("pgTable(");
    expect(schemaIndex).toContain('export * from "./wallet";');
    expect(schemaIndex).toContain('export * from "./cadi-kazan";');
    expect(schemaIndex).toContain('export * from "./slot";');
    expect(schemaIndex).toContain('export * from "./idle";');
    expect(schemaIndex).toContain('export * from "./blackjack";');
  });

  it("keeps shared wallet and game tables in their own schema files", () => {
    expect(walletSchema).toContain('"shared_wallets"');
    expect(cadiSchema).toContain('"cadi_kazan_rounds"');
    expect(slotSchema).toContain('"slot_rounds"');
    expect(idleSchema).toContain('"idle_business_states"');
  });

  it("uses shared platform wallet and session contracts", () => {
    for (const source of [slotRepo, cadiRepo, idleRepo]) {
      expect(source).toContain('from "../platform/wallet"');
      expect(source).toContain("INITIAL_SHARED_BALANCE_CENTS");
      expect(source).toContain("shared_wallets");
    }
    expect(blackjackPlatform).toContain('from "./wallet"');
    expect(blackjackPlatform).toContain("INITIAL_SHARED_BALANCE_CENTS");
    expect(blackjackPlatform).toContain("shared_wallets");
    for (const source of [slotRoutes, cadiRoutes, idleRoutes]) {
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
