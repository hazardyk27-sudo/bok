import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const storageSource = readFileSync(
  fileURLToPath(new URL("./storageUpgrade.ts", import.meta.url)),
  "utf8",
);

const routeSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

describe("Storage upgrade transaction contract", () => {
  it("exposes a server-derived Storage upgrade API with no client level or price", () => {
    expect(routeSource).toContain(
      'router.post("/idle/stadium/storage/upgrade"',
    );
    expect(routeSource).toContain("idempotencyKey?: unknown;");
    expect(routeSource).not.toContain("targetStorageLevel?: unknown");
    expect(routeSource).not.toContain("storageUpgradeCostCents?: unknown");
  });

  it("checkpoints old-capacity production before expanding Storage", () => {
    expect(storageSource).toContain(
      "runCheckpointedStadiumMutation(",
    );
    expect(storageSource).toContain(
      "resolveNextStorageUpgrade(\n        settledState.storageLevel,",
    );
    expect(storageSource).toContain(
      "storageLevel: upgrade.targetStorageLevel",
    );
    expect(storageSource).toContain(
      "All elapsed production is checkpointed under the OLD Storage capacity first.",
    );
    expect(storageSource).toContain(
      "the newly expanded",
    );
    expect(storageSource).toContain(
      "capacity never retroactively receives tickets",
    );
  });

  it("has no Stadium-level, seat-count, or Speed prerequisite", () => {
    expect(storageSource).toContain(
      "Stadium level, owned seats, and Speed are not prerequisites for Storage.",
    );
    expect(storageSource).not.toContain("settledState.stadiumLevel");
    expect(storageSource).not.toContain("settledState.ownedSeats");
    expect(storageSource).not.toContain("settledState.speedLevel");
  });

  it("locks and debits the shared wallet atomically", () => {
    expect(storageSource).toContain("FROM roulette_wallets");
    expect(storageSource).toContain("FOR UPDATE");
    expect(storageSource).toContain(
      "balanceCents = upgrade.balanceAfterCents",
    );
    expect(storageSource).toContain("UPDATE roulette_wallets");
  });

  it("uses canonical Stadium action receipts for idempotent replay", () => {
    expect(storageSource).toContain(
      'const STORAGE_UPGRADE_ACTION = "STORAGE_UPGRADE"',
    );
    expect(storageSource).toContain(
      "reserveStadiumActionReceipt(",
    );
    expect(storageSource).toContain(
      'actionType: "STORAGE_UPGRADE"',
    );
    expect(storageSource).toContain("target_level");
    expect(storageSource).toContain("replayed: true");
    expect(storageSource).toContain(
      'throw new Error("IDEMPOTENCY_KEY_REUSED")',
    );
  });

  it("maps Storage Lv20 max-level conflicts explicitly", () => {
    expect(routeSource).toContain('"IDLE_STORAGE_MAX_LEVEL"');
  });
});
