import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatAuthUserCode } from "./repository";
import {
  isValidUsername,
  normalizeUsername,
} from "./security";

const routesSource = readFileSync(
  fileURLToPath(new URL("./routes.ts", import.meta.url)),
  "utf8",
);
const repositorySource = readFileSync(
  fileURLToPath(new URL("./repository.ts", import.meta.url)),
  "utf8",
);
const schemaSource = readFileSync(
  fileURLToPath(new URL("../../../../lib/db/src/schema/auth.ts", import.meta.url)),
  "utf8",
);

describe("account identity contract", () => {
  it("formats immutable sequential usercodes with the canonical 4-4-2 shape", () => {
    expect(formatAuthUserCode(1)).toBe("0000-0000-01");
    expect(formatAuthUserCode(2)).toBe("0000-0000-02");
    expect(formatAuthUserCode(1234567890)).toBe("1234-5678-90");
  });

  it("normalizes and validates usernames deterministically", () => {
    expect(normalizeUsername("  Yavuz_27 ")).toBe("yavuz_27");
    expect(isValidUsername("yavuz_27")).toBe(true);
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("bad-name")).toBe(false);
  });

  it("keeps registration email + username + password and login email-or-username", () => {
    expect(routesSource).toContain("readRegisterCredentials");
    expect(routesSource).toContain("normalizeUsername");
    expect(routesSource).toContain('router.post("/auth/register"');
    expect(routesSource).toContain('router.post("/auth/login"');
    expect(repositorySource).toContain("WHERE u.email = $1 OR u.username = $1");
  });

  it("binds account identity to the one shared wallet and exposes no second balance authority", () => {
    expect(schemaSource).toContain('walletSessionId: text("wallet_session_id")');
    expect(repositorySource).toContain("INSERT INTO shared_wallets");
    expect(repositorySource).toContain("INNER JOIN shared_wallets");
    expect(repositorySource).not.toContain("auth_wallet");
    expect(repositorySource).not.toContain("account_wallet");
  });

  it("keeps password change authenticated and revokes other account sessions", () => {
    expect(routesSource).toContain('router.post("/auth/password"');
    expect(repositorySource).toContain("CURRENT_PASSWORD_INVALID");
    expect(repositorySource).toContain("token_hash <> $2");
  });

  it("does not require outbound email verification for registration", () => {
    expect(routesSource).not.toContain("sendVerificationEmail");
    expect(routesSource).not.toContain("resend-verification");
    expect(routesSource).not.toContain("verify-email");
  });
});
