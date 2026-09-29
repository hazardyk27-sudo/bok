import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const speedSource = readFileSync(
  fileURLToPath(new URL("./speedUpgrade.ts", import.meta.url)),
  "utf8",
);

const routeSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

describe("Speed upgrade transaction contract", () => {
  it("exposes a server-derived Speed upgrade API with no client level or price", () => {
    expect(routeSource).toContain(
      'router.post("/idle/stadium/speed/upgrade"',
    );
    expect(routeSource).toContain("idempotencyKey?: unknown;");
    expect(routeSource).not.toContain("targetSpeedLevel?: unknown");
    expect(routeSource).not.toContain("speedUpgradeCostCents?: unknown");
  });

  it("checkpoints old-Speed production before changing the level", () => {
    expect(speedSource).toContain(
      "runCheckpointedStadiumMutation(",
    );
    expect(speedSource).toContain(
      "resolveNextSpeedUpgrade(\n        settledState.speedLevel,",
    );
    expect(speedSource).toContain(
      "speedLevel: upgrade.targetSpeedLevel",
    );
    expect(speedSource).toContain(
      "the old Speed remains authoritative for the entire pre-upgrade interval",
    );
  });

  it("has no Stadium-level, seat-count, or Storage prerequisite", () => {
    expect(speedSource).toContain(
      "The action has no Stadium-level, seat-count, or Storage prerequisite.",
    );
    expect(speedSource).not.toContain("settledState.stadiumLevel");
    expect(speedSource).not.toContain("settledState.ownedSeats");
    expect(speedSource).not.toContain("settledState.storageLevel");
  });

  it("locks and debits the shared wallet atomically", () => {
    expect(speedSource).toContain("FROM roulette_wallets");
    expect(speedSource).toContain("FOR UPDATE");
    expect(speedSource).toContain(
      "balanceCents = upgrade.balanceAfterCents",
    );
    expect(speedSource).toContain("UPDATE roulette_wallets");
  });

  it("uses canonical Stadium action receipts for idempotent replay", () => {
    expect(speedSource).toContain(
      'const SPEED_UPGRADE_ACTION = "SPEED_UPGRADE"',
    );
    expect(speedSource).toContain(
      "reserveStadiumActionReceipt(",
    );
    expect(speedSource).toContain(
      'actionType: "SPEED_UPGRADE"',
    );
    expect(speedSource).toContain("target_level");
    expect(speedSource).toContain("replayed: true");
    expect(speedSource).toContain(
      'throw new Error("IDEMPOTENCY_KEY_REUSED")',
    );
  });

  it("maps Speed Lv20 max-level conflicts explicitly", () => {
    expect(routeSource).toContain('"IDLE_SPEED_MAX_LEVEL"');
  });
});
