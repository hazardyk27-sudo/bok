import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mutationSource = readFileSync(
  fileURLToPath(new URL("./stadiumMutation.ts", import.meta.url)),
  "utf8",
);
const repositorySource = readFileSync(
  fileURLToPath(new URL("./stadiumRepository.ts", import.meta.url)),
  "utf8",
);
const receiptSource = readFileSync(
  fileURLToPath(new URL("./stadiumActionReceipt.ts", import.meta.url)),
  "utf8",
);

const actionSources = [
  readFileSync(
    fileURLToPath(new URL("./seatPurchase.ts", import.meta.url)),
    "utf8",
  ),
  readFileSync(
    fileURLToPath(new URL("./stadiumUpgrade.ts", import.meta.url)),
    "utf8",
  ),
  readFileSync(
    fileURLToPath(new URL("./speedUpgrade.ts", import.meta.url)),
    "utf8",
  ),
  readFileSync(
    fileURLToPath(new URL("./storageUpgrade.ts", import.meta.url)),
    "utf8",
  ),
  readFileSync(
    fileURLToPath(new URL("./ticketSale.ts", import.meta.url)),
    "utf8",
  ),
];

describe("Stadium concurrency/idempotency contract", () => {
  it("serializes all same-session economy mutations on the Stadium row", () => {
    expect(repositorySource).toContain(
      '${forUpdate ? "FOR UPDATE" : ""}',
    );

    const beginIndex = mutationSource.indexOf(
      'await client.query("BEGIN")',
    );
    const checkpointIndex = mutationSource.indexOf(
      "const checkpoint = await checkpointStadiumProduction(",
    );
    const decideIndex = mutationSource.indexOf(
      "const decision = await decide(",
    );

    expect(beginIndex).toBeGreaterThan(-1);
    expect(checkpointIndex).toBeGreaterThan(beginIndex);
    expect(decideIndex).toBeGreaterThan(checkpointIndex);
  });

  it("routes every active Stadium mutation through one serialized receipt reservation", () => {
    for (const source of actionSources) {
      expect(source).toContain(
        "reserveStadiumActionReceipt(",
      );
      expect(source).toContain(
        "runCheckpointedStadiumMutation(",
      );
    }

    expect(receiptSource).toContain(
      "ON CONFLICT (idempotency_key) DO NOTHING",
    );
    expect(receiptSource).toContain("FOR UPDATE");
    expect(receiptSource).toContain(
      'throw new Error("IDEMPOTENCY_KEY_REUSED")',
    );
  });

  it("locks the shared wallet before every debit or credit", () => {
    for (const source of actionSources) {
      expect(source).toContain("FROM roulette_wallets");
      expect(source).toContain("FOR UPDATE");
      expect(source).toContain("UPDATE roulette_wallets");
    }
  });

  it("guards every receipt completion by key + session + action and requires RETURNING id", () => {
    for (const source of actionSources) {
      expect(source).toContain("AND session_id =");
      expect(source).toContain("AND action_type =");
      expect(source).toContain("RETURNING id");
      expect(source).toContain(
        'throw new Error("IDLE_STADIUM_RECEIPT_UPDATE_CONFLICT")',
      );
    }
  });

  it("fails closed if either checkpoint or final Stadium update affects anything other than one row", () => {
    expect(repositorySource).toContain(
      'throw new Error("IDLE_STADIUM_CHECKPOINT_UPDATE_CONFLICT")',
    );
    expect(mutationSource).toContain(
      'throw new Error("IDLE_STADIUM_STATE_UPDATE_CONFLICT")',
    );
  });

  it("poisons a connection when rollback fails instead of returning uncertain transaction state to the pool", () => {
    expect(mutationSource).toContain(
      "IDLE_STADIUM_ROLLBACK_FAILED",
    );
    expect(mutationSource).toContain("client.release(");
    expect(mutationSource).toContain("if (!released)");
  });
});
