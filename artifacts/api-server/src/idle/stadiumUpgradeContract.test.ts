import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const upgradeSource = readFileSync(
  fileURLToPath(new URL("./stadiumUpgrade.ts", import.meta.url)),
  "utf8",
);

const routeSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

describe("Stadium unlock transaction contract", () => {
  it("exposes a server-derived next-level API with no client target or price", () => {
    expect(routeSource).toContain(
      'router.post("/idle/stadium/upgrade"',
    );
    expect(routeSource).toContain("idempotencyKey?: unknown;");
    expect(routeSource).not.toContain("targetStadiumLevel?: unknown");
    expect(routeSource).not.toContain("unlockCostCents?: unknown");
  });

  it("uses the checkpoint-before-mutation transaction boundary", () => {
    expect(upgradeSource).toContain(
      "runCheckpointedStadiumMutation(",
    );
    expect(upgradeSource).toContain(
      "resolveNextStadiumUpgrade(\n        settledState.stadiumLevel,",
    );
    expect(upgradeSource).toContain(
      "stadiumLevel: upgrade.targetStadiumLevel",
    );
  });

  it("does not require current seat capacity to be filled before unlock", () => {
    expect(upgradeSource).toContain(
      "Owned seats are intentionally NOT inspected as an unlock prerequisite.",
    );
    expect(upgradeSource).not.toContain(
      "settledState.ownedSeats ===",
    );
    expect(upgradeSource).not.toContain(
      "settledState.ownedSeats >=",
    );
  });

  it("locks and debits the shared wallet atomically", () => {
    expect(upgradeSource).toContain("FROM roulette_wallets");
    expect(upgradeSource).toContain("FOR UPDATE");
    expect(upgradeSource).toContain(
      "balanceCents = upgrade.balanceAfterCents",
    );
    expect(upgradeSource).toContain("UPDATE roulette_wallets");
  });

  it("uses Stadium action receipts for idempotent replay", () => {
    expect(upgradeSource).toContain(
      'const STADIUM_UPGRADE_ACTION = "STADIUM_UPGRADE"',
    );
    expect(upgradeSource).toContain(
      "reserveStadiumActionReceipt(",
    );
    expect(upgradeSource).toContain(
      'actionType: "STADIUM_UPGRADE"',
    );
    expect(upgradeSource).toContain("target_level");
    expect(upgradeSource).toContain("replayed: true");
    expect(upgradeSource).toContain("currentBalanceCents");
    expect(upgradeSource).toContain(
      'throw new Error("IDEMPOTENCY_KEY_REUSED")',
    );
  });

  it("revalidates replay cost/balance against canonical config", () => {
    expect(upgradeSource).toContain("const targetConfig =");
    expect(upgradeSource).toContain("costCents !== targetConfig.unlockCostCents");
    expect(upgradeSource).toContain("balanceCents < 0");
  });

  it("guards receipt completion by key, session, and action", () => {
    expect(upgradeSource).toContain("AND session_id = $5");
    expect(upgradeSource).toContain("AND action_type = $6");
    expect(upgradeSource).toContain("RETURNING id");
    expect(upgradeSource).toContain(
      'throw new Error("IDLE_STADIUM_RECEIPT_UPDATE_CONFLICT")',
    );
  });

  it("maps max-level conflicts explicitly", () => {
    expect(routeSource).toContain(
      '"IDLE_STADIUM_MAX_LEVEL"',
    );
  });
});
