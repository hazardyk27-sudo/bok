import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const schemaIndex = read("../../../lib/db/src/schema/index.ts");
const walletSchema = read("../../../lib/db/src/schema/wallet.ts");
const rouletteSchema = read("../../../lib/db/src/schema/roulette.ts");
const physicsSchema = read("../../../lib/db/src/schema/physics-lab.ts");
const cadiSchema = read("../../../lib/db/src/schema/cadi-kazan.ts");
const slotSchema = read("../../../lib/db/src/schema/slot.ts");
const idleSchema = read("../../../lib/db/src/schema/idle.ts");

const serverIndex = read("./index.ts");
const routesIndex = read("./routes/index.ts");
const rouletteRepo = read("./roulette/repository.ts");
const slotRepo = read("./slot/repository.ts");
const cadiRepo = read("./cadi-kazan/repository.ts");
const idleRepo = read("./idle/repository.ts");

describe("backend game isolation", () => {
  it("keeps the DB schema index aggregation-only", () => {
    expect(schemaIndex).not.toContain("pgTable(");
    expect(schemaIndex).toContain('export * from "./wallet";');
    expect(schemaIndex).toContain('export * from "./roulette";');
    expect(schemaIndex).toContain('export * from "./physics-lab";');
    expect(schemaIndex).toContain('export * from "./cadi-kazan";');
    expect(schemaIndex).toContain('export * from "./slot";');
    expect(schemaIndex).toContain('export * from "./idle";');
  });

  it("keeps every game's tables in its own schema file", () => {
    expect(walletSchema).toContain('pgTable("roulette_wallets"');
    expect(rouletteSchema).toContain('pgTable("roulette_rounds"');
    expect(rouletteSchema).toContain('pgTable("roulette_bets"');
    expect(physicsSchema).toContain('pgTable("physics_lab_rounds"');
    expect(cadiSchema).toContain('pgTable("cadi_kazan_rounds"');
    expect(slotSchema).toContain('pgTable("slot_rounds"');
    expect(idleSchema).toContain('pgTable("idle_business_states"');
  });

  it("uses the platform wallet contract instead of cross-importing Roulette", () => {
    for (const source of [slotRepo, cadiRepo, idleRepo]) {
      expect(source).toContain('from "../platform/wallet"');
      expect(source).not.toContain('from "../roulette/types"');
      expect(source).toContain("INITIAL_SHARED_BALANCE_CENTS");
    }
    expect(rouletteRepo).toContain('from "../platform/wallet"');
    expect(rouletteRepo).toContain("INITIAL_SHARED_BALANCE_CENTS");
  });

  it("routes through stable game backend entrypoints", () => {
    expect(routesIndex).toContain('from "../roulette"');
    expect(routesIndex).toContain('from "../physics-lab"');
    expect(routesIndex).toContain('from "../cadi-kazan"');
    expect(routesIndex).toContain('from "../slot"');
    expect(routesIndex).toContain('from "../idle"');
    expect(routesIndex).not.toContain('../roulette/routes');
    expect(routesIndex).not.toContain('../cadi-kazan/routes');
    expect(routesIndex).not.toContain('../slot/routes');
    expect(routesIndex).not.toContain('../idle/routes');
  });

  it("keeps shared server bootstrap behind the Roulette runtime boundary", () => {
    expect(serverIndex).toContain('from "./roulette"');
    expect(serverIndex).not.toContain('from "./roulette/repository"');
    expect(serverIndex).not.toContain('from "./roulette/realtime"');
    expect(serverIndex).toContain("attachRouletteRuntime(server)");
    expect(serverIndex).toContain("startRouletteRuntime()");
    expect(serverIndex).toContain("stopRouletteRuntime()");
  });
});
