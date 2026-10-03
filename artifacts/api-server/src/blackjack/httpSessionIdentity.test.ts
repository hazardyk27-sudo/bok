import { describe, expect, it, vi } from "vitest";
import { resolveBlackjackHttpSessionIdentity } from "./httpSessionIdentity";

const ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GUEST = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CREATED = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("blackjack http session identity", () => {
  it("always prefers an authenticated account wallet over a canonical guest session", async () => {
    const lookupAuthWalletSessionId = vi.fn().mockResolvedValue(ACCOUNT);

    await expect(resolveBlackjackHttpSessionIdentity({
      authToken: "valid-auth-token",
      canonicalSessionId: GUEST,
    }, {
      lookupAuthWalletSessionId,
      createSessionId: () => CREATED,
    })).resolves.toEqual({
      sessionId: ACCOUNT,
      source: "AUTH",
    });
    expect(lookupAuthWalletSessionId).toHaveBeenCalledWith("valid-auth-token");
  });

  it("falls back to canonical guest identity when auth token is expired", async () => {
    const lookupAuthWalletSessionId = vi.fn().mockResolvedValue(null);

    await expect(resolveBlackjackHttpSessionIdentity({
      authToken: "expired-auth-token",
      canonicalSessionId: GUEST,
    }, {
      lookupAuthWalletSessionId,
      createSessionId: () => CREATED,
    })).resolves.toEqual({
      sessionId: GUEST,
      source: "CANONICAL",
    });
  });

  it("creates a guest identity only when neither auth nor canonical identity is available", async () => {
    const lookupAuthWalletSessionId = vi.fn().mockResolvedValue(null);

    await expect(resolveBlackjackHttpSessionIdentity({
      authToken: undefined,
      canonicalSessionId: undefined,
    }, {
      lookupAuthWalletSessionId,
      createSessionId: () => CREATED,
    })).resolves.toEqual({
      sessionId: CREATED,
      source: "GUEST_CREATED",
    });
    expect(lookupAuthWalletSessionId).not.toHaveBeenCalled();
  });

  it("fails closed when an authenticated account points at an invalid wallet session", async () => {
    await expect(resolveBlackjackHttpSessionIdentity({
      authToken: "valid-auth-token",
      canonicalSessionId: GUEST,
    }, {
      lookupAuthWalletSessionId: async () => "invalid",
      createSessionId: () => CREATED,
    })).rejects.toThrow("BLACKJACK_AUTH_WALLET_SESSION_INVALID");
  });
});
