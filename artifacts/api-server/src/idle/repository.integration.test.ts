import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.IDLE_DB_INTEGRATION === "1";

describe.skipIf(!enabled)("IdleRepository PostgreSQL integration", () => {
  let pool: (typeof import("@workspace/db"))["pool"];
  let idleRepository: import("./repository").IdleRepository;
  let server: import("node:http").Server;
  let baseUrl = "";

  beforeAll(async () => {
    const dbModule = await import("@workspace/db");
    const repositoryModule = await import("./repository");
    const appModule = await import("../app");
    pool = dbModule.pool;
    idleRepository = repositoryModule.idleRepository;

    server = appModule.default.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("IDLE_TEST_SERVER_ADDRESS_UNAVAILABLE");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
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

  it("serves Idle state through the real /api route and session cookie", async () => {
    const response = await fetch(`${baseUrl}/api/idle/state`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("set-cookie")).toContain("roulette_session=");

    const body = await response.json() as {
      sessionId: string;
      wallet: { balanceCents: number };
      businesses: Array<{ businessId: string; businessLevel: number | null }>;
    };

    expect(body.sessionId).toMatch(/^[a-f0-9-]{20,80}$/);
    expect(body.wallet.balanceCents).toBe(100_000);
    expect(body.businesses).toHaveLength(3);
    expect(body.businesses.every((business) => business.businessLevel === null))
      .toBe(true);
  });

  it("purchases through the real HTTP endpoint and returns the updated wallet", async () => {
    const stateResponse = await fetch(`${baseUrl}/api/idle/state`);
    const cookie = stateResponse.headers.get("set-cookie")?.split(";")[0];
    expect(cookie).toBeTruthy();

    const response = await fetch(
      `${baseUrl}/api/idle/businesses/fan-club/upgrade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie ?? "",
        },
        body: JSON.stringify({ idempotencyKey: randomUUID() }),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      targetBusinessLevel: number;
      costCents: number;
      balanceCents: number;
      business: { businessLevel: number | null; vaultLevel: number };
    };
    expect(body.targetBusinessLevel).toBe(0);
    expect(body.costCents).toBe(10_000);
    expect(body.balanceCents).toBe(90_000);
    expect(body.business.businessLevel).toBe(0);
    expect(body.business.vaultLevel).toBe(1);
  });

  it("collects through the real HTTP endpoint and replays without double credit", async () => {
    const stateResponse = await fetch(`${baseUrl}/api/idle/state`);
    const cookie = stateResponse.headers.get("set-cookie")?.split(";")[0];
    const stateBody = await stateResponse.json() as { sessionId: string };
    const purchaseAt = new Date("2026-09-25T11:00:00.000Z");
    const collectAt = new Date("2026-09-25T12:00:00.000Z");

    await idleRepository.upgradeBusiness(
      stateBody.sessionId,
      "stadium",
      randomUUID(),
      purchaseAt,
    );
    await pool.query(
      `UPDATE idle_business_states
          SET accrued_microcents = 0,
              checkpoint_at = $3,
              updated_at = $3
        WHERE session_id = $1 AND business_id = $2`,
      [stateBody.sessionId, "stadium", purchaseAt],
    );

    const key = randomUUID();
    const request = () => fetch(
      `${baseUrl}/api/idle/businesses/stadium/collect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie ?? "",
        },
        body: JSON.stringify({ idempotencyKey: key }),
      },
    );

    const first = await request();
    expect(first.status).toBe(200);
    const firstBody = await first.json() as {
      collectedCents: number;
      balanceCents: number;
      replayed: boolean;
    };
    expect(firstBody.collectedCents).toBeGreaterThanOrEqual(416);
    expect(firstBody.balanceCents).toBeGreaterThanOrEqual(50_416);
    expect(firstBody.replayed).toBe(false);

    const replay = await request();
    expect(replay.status).toBe(200);
    const replayBody = await replay.json() as {
      collectedCents: number;
      balanceCents: number;
      replayed: boolean;
    };
    expect(replayBody.collectedCents).toBe(firstBody.collectedCents);
    expect(replayBody.balanceCents).toBe(firstBody.balanceCents);
    expect(replayBody.replayed).toBe(true);
  });

  it("collects every owned business through one HTTP action without double credit on replay", async () => {
    const stateResponse = await fetch(`${baseUrl}/api/idle/state`);
    const cookie = stateResponse.headers.get("set-cookie")?.split(";")[0];
    const stateBody = await stateResponse.json() as { sessionId: string };
    const checkpointAt = new Date("2026-09-25T11:00:00.000Z");

    await idleRepository.upgradeBusiness(
      stateBody.sessionId,
      "stadium",
      randomUUID(),
      checkpointAt,
    );
    await idleRepository.upgradeBusiness(
      stateBody.sessionId,
      "fan-club",
      randomUUID(),
      checkpointAt,
    );
    await pool.query(
      `UPDATE idle_business_states
          SET accrued_microcents = 0,
              checkpoint_at = $2,
              updated_at = $2
        WHERE session_id = $1
          AND business_id IN ('stadium', 'fan-club')`,
      [stateBody.sessionId, checkpointAt],
    );

    const key = randomUUID();
    const request = () => fetch(`${baseUrl}/api/idle/collect-all`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie ?? "",
      },
      body: JSON.stringify({ idempotencyKey: key }),
    });

    const first = await request();
    expect(first.status).toBe(200);
    const firstBody = await first.json() as {
      collectedCents: number;
      balanceCents: number;
      replayed: boolean;
      collections: Array<{ businessId: string; collectedCents: number }>;
    };
    expect(firstBody.replayed).toBe(false);
    expect(firstBody.collections.map((entry) => entry.businessId).sort())
      .toEqual(["fan-club", "stadium"]);
    expect(firstBody.collectedCents).toBeGreaterThan(0);

    const balanceAfterFirst = firstBody.balanceCents;
    const replay = await request();
    expect(replay.status).toBe(200);
    const replayBody = await replay.json() as {
      collectedCents: number;
      balanceCents: number;
      replayed: boolean;
    };
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.collectedCents).toBe(firstBody.collectedCents);
    expect(replayBody.balanceCents).toBe(balanceAfterFirst);
    expect(await walletBalance(stateBody.sessionId)).toBe(balanceAfterFirst);
  });

  it("upgrades Kasa through the real HTTP endpoint", async () => {
    const stateResponse = await fetch(`${baseUrl}/api/idle/state`);
    const cookie = stateResponse.headers.get("set-cookie")?.split(";")[0];

    const purchase = await fetch(
      `${baseUrl}/api/idle/businesses/fan-club/upgrade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie ?? "",
        },
        body: JSON.stringify({ idempotencyKey: randomUUID() }),
      },
    );
    expect(purchase.status).toBe(200);

    const response = await fetch(
      `${baseUrl}/api/idle/businesses/fan-club/vault/upgrade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie ?? "",
        },
        body: JSON.stringify({ idempotencyKey: randomUUID() }),
      },
    );

    expect(response.status).toBe(200);
    const body = await response.json() as {
      targetVaultLevel: number;
      costCents: number;
      balanceCents: number;
      business: { vaultLevel: number };
    };
    expect(body.targetVaultLevel).toBe(2);
    expect(body.costCents).toBe(500);
    expect(body.balanceCents).toBe(89_500);
    expect(body.business.vaultLevel).toBe(2);
  });

  it("returns HTTP 402 for a real insufficient-balance purchase and keeps state unchanged", async () => {
    const stateResponse = await fetch(`${baseUrl}/api/idle/state`);
    const cookie = stateResponse.headers.get("set-cookie")?.split(";")[0];
    const stateBody = await stateResponse.json() as { sessionId: string };

    await pool.query(
      "UPDATE roulette_wallets SET balance_cents = $2 WHERE session_id = $1",
      [stateBody.sessionId, 9_999],
    );

    const response = await fetch(
      `${baseUrl}/api/idle/businesses/fan-club/upgrade`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie ?? "",
        },
        body: JSON.stringify({ idempotencyKey: randomUUID() }),
      },
    );

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({ error: "INSUFFICIENT_IDLE_CREDITS" });
    expect(await walletBalance(stateBody.sessionId)).toBe(9_999);
    expect((await businessRow(stateBody.sessionId, "fan-club"))?.business_level)
      .toBeNull();
  });

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

  it("resets Kasa to Lv1 on a main business upgrade while preserving accrued income", async () => {
    const sessionId = randomUUID();
    const now = new Date("2026-09-25T12:00:00.000Z");

    await idleRepository.upgradeBusiness(
      sessionId,
      "fan-club",
      randomUUID(),
      now,
    );

    const preservedAccruedMicrocents = 12_345_678;
    await pool.query(
      `UPDATE idle_business_states
          SET vault_level = 4,
              accrued_microcents = $3,
              checkpoint_at = $4,
              updated_at = $4
        WHERE session_id = $1 AND business_id = $2`,
      [sessionId, "fan-club", preservedAccruedMicrocents, now],
    );

    const result = await idleRepository.upgradeBusiness(
      sessionId,
      "fan-club",
      randomUUID(),
      now,
    );

    expect(result.targetBusinessLevel).toBe(1);
    expect(result.business.businessLevel).toBe(1);
    expect(result.business.vaultLevel).toBe(1);

    const row = await businessRow(sessionId, "fan-club");
    expect(row?.business_level).toBe(1);
    expect(row?.vault_level).toBe(1);
    expect(Number(row?.accrued_microcents)).toBe(preservedAccruedMicrocents);
  });

  it("keeps accrued income intact when Kasa capacity is upgraded", async () => {
    const sessionId = randomUUID();
    const now = new Date("2026-09-25T12:00:00.000Z");

    await idleRepository.upgradeBusiness(
      sessionId,
      "fan-club",
      randomUUID(),
      now,
    );

    const preservedAccruedMicrocents = 7_654_321;
    await pool.query(
      `UPDATE idle_business_states
          SET accrued_microcents = $3,
              checkpoint_at = $4,
              updated_at = $4
        WHERE session_id = $1 AND business_id = $2`,
      [sessionId, "fan-club", preservedAccruedMicrocents, now],
    );

    const result = await idleRepository.upgradeVault(
      sessionId,
      "fan-club",
      randomUUID(),
      now,
    );

    expect(result.targetVaultLevel).toBe(2);
    expect(result.business.vaultLevel).toBe(2);

    const row = await businessRow(sessionId, "fan-club");
    expect(row?.vault_level).toBe(2);
    expect(Number(row?.accrued_microcents)).toBe(preservedAccruedMicrocents);
  });

});
