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

describe("backend game isolation", () => {
  it("keeps the DB schema index aggregation-only", () => {
    expect(schemaIndex).not.toContain("pgTable(");
    expect(schemaIndex).toContain('export * from "./wallet";');
    expect(schemaIndex).toContain('export * from "./cadi-kazan";');
    expect(schemaIndex).toContain('export * from "./slot";');
    expect(schemaIndex).toContain('export * from "./idle";');
  });

  it("keeps every active game's tables in its own schema file", () => {
    expect(walletSchema).toContain('"roulette_wallets"');
    expect(cadiSchema).toContain('"cadi_kazan_rounds"');
    expect(slotSchema).toContain('"slot_rounds"');
    expect(idleSchema).toContain('"idle_business_states"');
  });

  it("uses the platform wallet contract without cross-game imports", () => {
    for (const source of [slotRepo, cadiRepo, idleRepo]) {
      expect(source).toContain('from "../platform/wallet"');
      expect(source).toContain("INITIAL_SHARED_BALANCE_CENTS");
    }
  });

  it("routes through stable active-game backend entrypoints", () => {
    expect(routesIndex).toContain('from "../cadi-kazan"');
    expect(routesIndex).toContain('from "../slot"');
    expect(routesIndex).toContain('from "../idle"');
    expect(routesIndex).not.toContain('../cadi-kazan/routes');
    expect(routesIndex).not.toContain('../slot/routes');
    expect(routesIndex).not.toContain('../idle/routes');
  });
});
