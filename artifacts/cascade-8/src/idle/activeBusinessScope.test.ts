import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACTIVE_BUSINESS_IDS,
  BUSINESS_IDS,
} from "./types";

const idleIndexSource = readFileSync(
  fileURLToPath(new URL("./index.ts", import.meta.url)),
  "utf8",
);

describe("active Idle business scope", () => {
  it("keeps Stadium as the only active business while retaining legacy identifiers", () => {
    expect(ACTIVE_BUSINESS_IDS).toEqual(["stadium"]);
    expect(BUSINESS_IDS).toEqual([
      "stadium",
      "club-store",
      "fan-club",
    ]);
  });

  it("renders and counts only the active Stadium card", () => {
    expect(idleIndexSource).toContain(
      "ACTIVE_BUSINESS_IDS.map(renderBusinessRowShell)",
    );
    expect(idleIndexSource).toContain(
      "ACTIVE_BUSINESS_IDS.length * BUSINESS_LEVELS_PER_BUSINESS",
    );
    expect(idleIndexSource).toContain(
      "${ACTIVE_BUSINESS_IDS.length} AKTİF",
    );
    expect(idleIndexSource).not.toContain(
      "BUSINESS_IDS.map(renderBusinessRowShell)",
    );
  });

  it("rejects inactive legacy business ids at the UI interaction boundary", () => {
    expect(idleIndexSource).toContain(
      "(ACTIVE_BUSINESS_IDS as readonly string[]).includes(",
    );
    expect(idleIndexSource).toContain(
      "businessId of ACTIVE_BUSINESS_IDS",
    );
  });
});
