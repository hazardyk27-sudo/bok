import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  chooseRequestSessionId,
  shouldResolveAuthenticatedWalletSession,
} from "./session";

const appSource = readFileSync(
  fileURLToPath(new URL("../app.ts", import.meta.url)),
  "utf8",
);
const authRepositorySource = readFileSync(
  fileURLToPath(new URL("../auth/repository.ts", import.meta.url)),
  "utf8",
);

describe("authenticated shared-wallet session selection", () => {
  it("re-resolves the account wallet for every authenticated request", () => {
    for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
      expect(shouldResolveAuthenticatedWalletSession({
        hasAuthToken: true,
        method,
        sessionCandidateCount: 1,
        legacySessionId: null,
      })).toBe(true);
    }
  });

  it("never treats guest cookies as an authenticated wallet", () => {
    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: false,
      method: "GET",
      sessionCandidateCount: 1,
      legacySessionId: null,
    })).toBe(false);

    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: false,
      method: "POST",
      sessionCandidateCount: 2,
      legacySessionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    })).toBe(false);
  });

  it("binds two devices with different stale cookies to the same account wallet while auth is valid", () => {
    const accountWallet = "account-wallet-1234567890";

    const deviceA = chooseRequestSessionId({
      authenticatedWalletSessionId: accountWallet,
      convergedWalletSessionId: "device-a-stale-wallet-1234567890",
    });
    const deviceB = chooseRequestSessionId({
      authenticatedWalletSessionId: accountWallet,
      convergedWalletSessionId: "device-b-stale-wallet-1234567890",
    });

    expect(deviceA).toBe(accountWallet);
    expect(deviceB).toBe(accountWallet);
  });

  it("falls back to guest convergence only when the request has no auth identity", () => {
    expect(chooseRequestSessionId({
      authenticatedWalletSessionId: "account-wallet-1234567890",
      convergedWalletSessionId: "stale-higher-wallet-1234567890",
    })).toBe("account-wallet-1234567890");

    expect(chooseRequestSessionId({
      authenticatedWalletSessionId: null,
      convergedWalletSessionId: "guest-wallet-1234567890",
    })).toBe("guest-wallet-1234567890");
  });

  it("uses a lightweight validated auth lookup before guest convergence", () => {
    expect(appSource).toContain('import { AUTH_COOKIE } from "./auth/routes"');
    expect(appSource).toContain('import { authRepository } from "./auth/repository"');
    expect(appSource).toContain("authRepository.getWalletSessionIdBySessionToken(authToken)");
    expect(appSource).toContain("authenticatedWalletSessionId || invalidAuthenticatedSession");

    expect(authRepositorySource).toContain("async getWalletSessionIdBySessionToken(token: string)");
    expect(authRepositorySource).toContain("s.revoked_at IS NULL");
    expect(authRepositorySource).toContain("s.expires_at > NOW()");
  });

  it("detaches a revoked auth cookie instead of falling back to the old account game_session", () => {
    expect(appSource).toContain("const invalidAuthenticatedSession =");
    expect(appSource).toContain("await authRepository.ensureAnonymousWallet(detachedAnonymousSessionId)");
    expect(appSource).toContain("delete req.cookies[AUTH_COOKIE]");
    expect(appSource).toContain("req.cookies[SESSION_COOKIE] = detachedAnonymousSessionId");
    expect(appSource).toContain('res.status(401).json({ error: "AUTH_SESSION_REVOKED" })');
  });
});
