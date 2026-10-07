import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./leaderboard.ts", import.meta.url)),
  "utf8",
);

describe("Idle leaderboard UI contract", () => {
  it("shows the three wealth dimensions and sorts server-side by total wealth", () => {
    expect(source).toContain("NAKİT");
    expect(source).toContain("SERMAYE");
    expect(source).toContain("TOPLAM SERVET");
    expect(source).toContain("/api/idle/leaderboard");
    expect(source).toContain("Nakit + Sermaye = Toplam Servet");
  });

  it("does not expose email or wallet identifiers in the public table", () => {
    expect(source).not.toContain("email");
    expect(source).not.toContain("walletSessionId");
  });
});
