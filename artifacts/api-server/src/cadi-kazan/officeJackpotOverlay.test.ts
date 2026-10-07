import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  fileURLToPath(new URL("./repository.ts", import.meta.url)),
  "utf8",
);

describe("Office Michael jackpot overlay transaction contract", () => {
  it("resolves duplicate start requests before any Michael RNG is evaluated", () => {
    const duplicateIndex = repositorySource.indexOf("const duplicate = await client.query<CadiRoundRow>");
    const jackpotIndex = repositorySource.indexOf("const officeJackpot = input.mode === \"OFFICE_MATCH_6\" && drawOfficeMichaelJackpot()");

    expect(duplicateIndex).toBeGreaterThanOrEqual(0);
    expect(jackpotIndex).toBeGreaterThan(duplicateIndex);
  });

  it("never claims a finite base ticket when the independent Michael jackpot wins", () => {
    expect(repositorySource).toContain('input.mode === "OFFICE_MATCH_6" && !officeJackpot');
    expect(repositorySource).toContain("? await claimOfficeTicket(client, roundId, sessionId)");
    expect(repositorySource).toContain("officeJackpot\n        ? await getOfficePoolRemainingWithoutClaim(client)");
    expect(repositorySource).toContain("officeJackpot\n        ? createOfficeMichaelJackpotBoard()");
  });

  it("keeps jackpot payout on the existing single Office settlement path", () => {
    expect(repositorySource).toContain("const resolution = resolveOfficeMatchReveal(officeCells, nextRevealedCells)");
    expect(repositorySource).toContain("'PAYOUT_CREDIT'");
    expect(repositorySource).toContain("`payout:${roundId}`");
    expect(repositorySource).not.toContain("MICHAEL_PAYOUT_CREDIT");
  });
});
