import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);
const repositorySource = readFileSync(
  fileURLToPath(new URL("./repository.ts", import.meta.url)),
  "utf8",
);

describe("Office finite-pool continuity", () => {
  it("does not retire/reset an active pool from the purchase route", () => {
    expect(routesSource).not.toContain("retireOfficePoolsWithJackpotLeak");
    expect(routesSource).not.toContain("UPDATE cadi_kazan_office_pools");
    expect(routesSource).toContain("allowed to exhaust naturally");
  });

  it("still validates the exact approved outcome distribution before using a pool", () => {
    expect(repositorySource).toContain("OFFICE_POOL_DISTRIBUTION.map");
    expect(repositorySource).toContain("actual.size === expected.size");
    expect(repositorySource).toContain("await retireLegacyOfficePools(client)");
  });

  it("claims only one previously-unclaimed ticket under row lock", () => {
    expect(repositorySource).toContain("claimed_round_id IS NULL");
    expect(repositorySource).toContain("LIMIT 1");
    expect(repositorySource).toContain("FOR UPDATE SKIP LOCKED");
  });
});
