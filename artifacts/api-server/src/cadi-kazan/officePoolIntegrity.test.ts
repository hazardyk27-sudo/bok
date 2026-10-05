import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const integritySource = readFileSync(
  fileURLToPath(new URL("./officePoolIntegrity.ts", import.meta.url)),
  "utf8",
);
const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);

describe("Office jackpot pool integrity", () => {
  it("retires old active/ready pools where Michael leaked onto non-jackpot cards", () => {
    expect(integritySource).toContain("t.outcome_symbol IS DISTINCT FROM 'MICHAEL'");
    expect(integritySource).toContain("t.office_cells @> '[\"MICHAEL\"]'::jsonb");
    expect(integritySource).toContain("t.outcome_symbol = 'MICHAEL'");
    expect(integritySource).toContain(") <> 3");
    expect(integritySource).toContain("p.status IN ('ACTIVE', 'READY')");
  });

  it("runs the retirement before an Office round is created", () => {
    const retireAt = routesSource.indexOf("await retireOfficePoolsWithJackpotLeak(sessionId)");
    const createAt = routesSource.indexOf("cadiKazanRepository.createRound(sessionId");
    expect(retireAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(retireAt);
  });

  it("does not retire a pool underneath an already-active round", () => {
    expect(integritySource).toContain("WHERE session_id = $1 AND status = 'ACTIVE' LIMIT 1");
    expect(integritySource).toContain("if (activeRound.rows[0])");
  });
});
