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

describe("authenticated shared-wallet session selection", () => {
  it("re-resolves the account wallet for every authenticated mutation", () => {
    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: true,
      method: "POST",
      sessionCandidateCount: 1,
      legacySessionId: null,
    })).toBe(true);

    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: true,
      method: "PATCH",
      sessionCandidateCount: 1,
      legacySessionId: null,
    })).toBe(true);
  });

  it("re-resolves authenticated read requests when cookies are fragmented", () => {
    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: true,
      method: "GET",
      sessionCandidateCount: 2,
      legacySessionId: null,
    })).toBe(true);

    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: true,
      method: "GET",
      sessionCandidateCount: 1,
      legacySessionId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    })).toBe(true);
  });

  it("keeps steady-state read requests and guests on the cheap convergence path", () => {
    expect(shouldResolveAuthenticatedWalletSession({
      hasAuthToken: true,
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

  it("always gives a validated authenticated wallet precedence over cookie convergence", () => {
    expect(chooseRequestSessionId({
      authenticatedWalletSessionId: "account-wallet-1234567890",
      convergedWalletSessionId: "stale-higher-wallet-1234567890",
    })).toBe("account-wallet-1234567890");

    expect(chooseRequestSessionId({
      authenticatedWalletSessionId: null,
      convergedWalletSessionId: "guest-wallet-1234567890",
    })).toBe("guest-wallet-1234567890");
  });

  it("wires the validated auth session into the request identity before fallback convergence", () => {
    expect(appSource).toContain('import { AUTH_COOKIE } from "./auth/routes"');
    expect(appSource).toContain('import { authRepository } from "./auth/repository"');
    expect(appSource).toContain("authRepository.getUserBySessionToken(authToken)");
    expect(appSource).toContain("authenticatedSession?.walletSessionId ?? null");
    expect(appSource).toContain("authenticatedWalletSessionId\n      ? null\n      : await resolveCanonicalWalletSessionCandidates");
  });
});
