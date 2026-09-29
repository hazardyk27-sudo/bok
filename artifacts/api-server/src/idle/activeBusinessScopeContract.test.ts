import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_IDLE_BUSINESS_IDS,
  IDLE_BUSINESS_IDS,
  isActiveIdleBusinessId,
} from "./storage";

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);
const repositorySource = readFileSync(
  fileURLToPath(new URL("./repository.ts", import.meta.url)),
  "utf8",
);

describe("active Idle backend business scope", () => {
  it("exposes Stadium as the only active legacy business target", () => {
    expect(ACTIVE_IDLE_BUSINESS_IDS).toEqual(["stadium"]);
    expect(isActiveIdleBusinessId("stadium")).toBe(true);
    expect(isActiveIdleBusinessId("club-store")).toBe(false);
    expect(isActiveIdleBusinessId("fan-club")).toBe(false);
  });

  it("retains old identifiers for migration-safe persisted rows", () => {
    expect(IDLE_BUSINESS_IDS).toEqual([
      "stadium",
      "club-store",
      "fan-club",
    ]);
    expect(repositorySource).toContain(
      "const ids = IDLE_BUSINESS_IDS.map(() => randomUUID());",
    );
    expect(repositorySource).not.toContain(
      "DELETE FROM idle_business_states",
    );
  });

  it("filters legacy state responses and all legacy mutation routes through the active scope", () => {
    expect(routesSource).toContain(
      ".filter((business) =>\n          isActiveIdleBusinessId(business.businessId))",
    );

    const activeGuardCount =
      routesSource.split(
        "if (!isActiveIdleBusinessId(businessId))",
      ).length - 1;

    expect(activeGuardCount).toBe(3);
  });

  it("prevents repository-level Club Store/Fan Club collection or progression", () => {
    const guardCallCount =
      repositorySource.split(
        "requireActiveLegacyBusinessId(businessId);",
      ).length - 1;

    expect(guardCallCount).toBe(3);
    expect(repositorySource).toContain(
      "isActiveIdleBusinessId(business.businessId)",
    );
  });
});
