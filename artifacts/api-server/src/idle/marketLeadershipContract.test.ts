import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const leadershipSource = readFileSync(
  fileURLToPath(new URL("./marketLeadership.ts", import.meta.url)),
  "utf8",
);

const dbWiringSource = readFileSync(
  fileURLToPath(new URL("./marketLeadershipDb.ts", import.meta.url)),
  "utf8",
);

describe("global market writer leadership source contract", () => {
  it("uses a non-blocking PostgreSQL session advisory lock", () => {
    expect(leadershipSource).toContain(
      "pg_try_advisory_lock(",
    );
    expect(leadershipSource).toContain(
      "IDLE_MARKET_ADVISORY_LOCK_NAMESPACE",
    );
    expect(leadershipSource).toContain(
      "IDLE_MARKET_ADVISORY_LOCK_KEY",
    );
    expect(leadershipSource).not.toContain(
      "pg_try_advisory_xact_lock",
    );
  });

  it("holds the acquired DB client instead of releasing it between 5-second ticks", () => {
    expect(leadershipSource).toContain(
      "this.leaderClient = client;",
    );
    expect(leadershipSource).toContain(
      "if (this.leaderClient) return true;",
    );
    expect(leadershipSource).toContain(
      "Leadership remains held after",
    );
  });

  it("releases followers immediately and unlocks leaders on the same session", () => {
    expect(leadershipSource).toContain(
      "if (!acquired) {\n        client.release();",
    );
    expect(leadershipSource).toContain(
      "pg_advisory_unlock(",
    );
  });

  it("destroys an uncertain DB session instead of returning a possibly locked connection to the pool", () => {
    expect(leadershipSource).toContain(
      "Never return a session with an uncertain session-level advisory lock",
    );
    expect(leadershipSource).toContain(
      'new Error("IDLE_MARKET_LEADER_RELEASE_FAILED")',
    );
  });

  it("wires runtime leadership to the shared PostgreSQL pool in one place", () => {
    expect(dbWiringSource).toContain(
      'import { pool } from "@workspace/db";',
    );
    expect(dbWiringSource).toContain(
      "new GlobalMarketWriterLeadership({",
    );
    expect(dbWiringSource).toContain(
      "connect: () => pool.connect()",
    );
  });
});
