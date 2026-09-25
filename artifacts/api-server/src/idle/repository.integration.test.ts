import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.IDLE_DB_INTEGRATION === "1";

describe.skipIf(!enabled)("IdleRepository PostgreSQL integration", () => {
  let pool: (typeof import("@workspace/db"))["pool"];
  let idleRepository: import("./repository").IdleRepository;

  beforeAll(async () => {
    const dbModule = await import("@workspace/db");
    const repositoryModule = await import("./repository");
    pool = dbModule.pool;
    idleRepository = repositoryModule.idleRepository;
  });

  afterAll(async () => {
    await pool?.end();
  });

  async function walletBalance(sessionId: string) {
    const result = await pool.query<{ balance_cents: number }>(
      "SELECT balance_cents FROM roulette_wallets WHERE session_id = $1",
      [sessionId],
    );
    return Number(result.rows[0]?.balance_cents);
  }

  async function businessRow(sessionId: string, businessId: string) {
    const result = await pool.query<{
      business_level: number | null;
      vault_level: number;
      accrued_microcents: number;
    }>(
      `SELECT business_level, vault_level, accrued_microcents
         FROM idle_business_states
        WHERE session_id = $1 AND business_id = $2`,
      [sessionId, businessId],
    );
    return result.rows[0];
  }

  async function ledgerCount(
    sessionId: string,
    businessId: string,
    kind: string,
  ) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM idle_ledger
        WHERE session_id = $1 AND business_id = $2 AND kind = $3`,
      [sessionId, businessId, kind],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  it("creates the shared wallet and exactly three unowned business rows", async () => {
    const sessionId = randomUUID();
    const now = new Date("2026-09-25T12:00:00.000Z");

    const state = await idleRepository.getSessionState(sessionId, now);

    expect(state.wallet.balanceCents).toBe(100_000);
    expect(state.businesses).toHaveLength(3);
    expect(state.businesses.map((business) => business.businessId)).toEqual([
      "stadium",
      "club-store",
      "fan-club",
    ]);
    expect(
      state.businesses.every(
        (business) =>
          business.businessLevel === null
          && business.vaultLevel === 1
          && business.projectedAccruedMicrocents === 0,
      ),
    ).toBe(true);
  });

  it("purchases a business once and replays the same idempotency key without a second debit", async () => {
    const sessionId = randomUUID();
    const key = randomUUID();
    const now = new Date("2026-09-25T12:00:00.000Z");

    const first = await idleRepository.upgradeBusiness(
      sessionId,
      "fan-club",
      key,
      now,
    );
    const replay = await idleRepository.upgradeBusiness(
      sessionId,
      "fan-club",
      key,
      new Date(now.getTime() + 1_000),
    );

    expect(first.replayed).toBe(false);
    expect(first.targetBusinessLevel).toBe(0);
    expect(first.costCents).toBe(10_000);
    expect(first.balanceCents).toBe(90_000);

    expect(replay.replayed).toBe(true);
    expect(replay.targetBusinessLevel).toBe(0);
    expect(replay.balanceCents).toBe(90_000);

    expect(await walletBalance(sessionId)).toBe(90_000);
    expect(await ledgerCount(sessionId, "fan-club", "BUSINESS_UPGRADE_DEBIT"))
      .toBe(1);

    const row = await businessRow(sessionId, "fan-club");
    expect(row?.business_level).toBe(0);
    expect(row?.vault_level).toBe(1);
  });

  it("collects one hour of Stadium income atomically and never double-credits a replay", async () => {
    const sessionId = randomUUID();
    const purchaseKey = randomUUID();
    const collectKey = randomUUID();
    const collectAt = new Date("2026-09-25T12:00:00.000Z");
    const checkpointAt = new Date(collectAt.getTime() - 60 * 60 * 1000);

    await idleRepository.upgradeBusiness(
      sessionId,
      "stadium",
      purchaseKey,
      checkpointAt,
    );

    await pool.query(
      `UPDATE idle_business_states
          SET accrued_microcents = 0,
              checkpoint_at = $3,
              updated_at = $3
        WHERE session_id = $1 AND business_id = $2`,
      [sessionId, "stadium", checkpointAt],
    );

    const before = await walletBalance(sessionId);
    expect(before).toBe(50_000);

    const first = await idleRepository.collectBusiness(
      sessionId,
      "stadium",
      collectKey,
      collectAt,
    );
    const replay = await idleRepository.collectBusiness(
      sessionId,
      "stadium",
      collectKey,
      new Date(collectAt.getTime() + 5_000),
    );

    expect(first.replayed).toBe(false);
    expect(first.collectedCents).toBe(416);
    expect(first.remainderMicrocents).toBe(666_666);
    expect(first.balanceCents).toBe(50_416);

    expect(replay.replayed).toBe(true);
    expect(replay.collectedCents).toBe(416);
    expect(replay.balanceCents).toBe(50_416);

    expect(await walletBalance(sessionId)).toBe(50_416);
    expect(await ledgerCount(sessionId, "stadium", "COLLECT_CREDIT")).toBe(1);

    const row = await businessRow(sessionId, "stadium");
    expect(Number(row?.accrued_microcents)).toBe(666_666);
  });

  it("upgrades Kasa once, preserves state and does not double-debit a replay", async () => {
    const sessionId = randomUUID();
    const purchaseKey = randomUUID();
    const vaultKey = randomUUID();
    const now = new Date("2026-09-25T12:00:00.000Z");

    await idleRepository.upgradeBusiness(
      sessionId,
      "fan-club",
      purchaseKey,
      now,
    );

    const first = await idleRepository.upgradeVault(
      sessionId,
      "fan-club",
      vaultKey,
      now,
    );
    const replay = await idleRepository.upgradeVault(
      sessionId,
      "fan-club",
      vaultKey,
      new Date(now.getTime() + 1_000),
    );

    expect(first.replayed).toBe(false);
    expect(first.targetVaultLevel).toBe(2);
    expect(first.costCents).toBe(500);
    expect(first.balanceCents).toBe(89_500);

    expect(replay.replayed).toBe(true);
    expect(replay.targetVaultLevel).toBe(2);
    expect(replay.balanceCents).toBe(89_500);

    expect(await walletBalance(sessionId)).toBe(89_500);
    expect(await ledgerCount(sessionId, "fan-club", "VAULT_UPGRADE_DEBIT"))
      .toBe(1);

    const row = await businessRow(sessionId, "fan-club");
    expect(row?.business_level).toBe(0);
    expect(row?.vault_level).toBe(2);
  });

  it("rolls back a rejected purchase without leaving a receipt or state mutation", async () => {
    const sessionId = randomUUID();
    const key = randomUUID();
    const now = new Date("2026-09-25T12:00:00.000Z");

    await idleRepository.getSessionState(sessionId, now);
    await pool.query(
      "UPDATE roulette_wallets SET balance_cents = $2 WHERE session_id = $1",
      [sessionId, 9_999],
    );

    await expect(
      idleRepository.upgradeBusiness(sessionId, "fan-club", key, now),
    ).rejects.toThrow("INSUFFICIENT_IDLE_CREDITS");

    expect(await walletBalance(sessionId)).toBe(9_999);

    const row = await businessRow(sessionId, "fan-club");
    expect(row?.business_level).toBeNull();
    expect(row?.vault_level).toBe(1);

    const receipt = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM idle_action_receipts
        WHERE idempotency_key = $1`,
      [key],
    );
    expect(Number(receipt.rows[0]?.count ?? 0)).toBe(0);
  });
});
