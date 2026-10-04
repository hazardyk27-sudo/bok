import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE } from "../platform/session";
import {
  BLACKJACK_AUTH_COOKIE,
  createBlackjackSessionIdentityMiddleware,
} from "./sessionIdentityMiddleware";

const ACCOUNT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const GUEST = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function harness(input: {
  authToken?: string;
  canonicalSessionId?: string;
  lookup: (token: string) => Promise<string | null>;
}) {
  const cookies: Record<string, unknown> = {};
  if (input.authToken) cookies[BLACKJACK_AUTH_COOKIE] = input.authToken;
  if (input.canonicalSessionId) cookies[SESSION_COOKIE] = input.canonicalSessionId;

  const req = {
    method: "GET",
    path: "/blackjack/session",
    cookies,
  } as unknown as Request;
  const cookie = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { cookie, status } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  const middleware = createBlackjackSessionIdentityMiddleware({
    lookupAuthWalletSessionId: input.lookup,
  });

  return { req, res, next, cookie, json, status, middleware };
}

describe("blackjack session identity middleware", () => {
  it("uses only the authenticated account wallet for the table session", async () => {
    const h = harness({
      authToken: "valid-token",
      canonicalSessionId: GUEST,
      lookup: async () => ACCOUNT,
    });

    await h.middleware(h.req, h.res, h.next);

    expect(h.req.cookies[SESSION_COOKIE]).toBe(ACCOUNT);
    expect(h.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      ACCOUNT,
      expect.objectContaining({ path: "/", httpOnly: true }),
    );
    expect(h.next).toHaveBeenCalledTimes(1);
    expect(h.status).not.toHaveBeenCalled();
  });

  it("rejects an expired account session instead of falling back to guest", async () => {
    const h = harness({
      authToken: "expired-token",
      canonicalSessionId: GUEST,
      lookup: async () => null,
    });

    await h.middleware(h.req, h.res, h.next);

    expect(h.status).toHaveBeenCalledWith(401);
    expect(h.json).toHaveBeenCalledWith({
      ready: false,
      status: "LOGIN_REQUIRED",
      error: "BLACKJACK_LOGIN_REQUIRED",
    });
    expect(h.cookie).not.toHaveBeenCalled();
    expect(h.next).not.toHaveBeenCalled();
  });

  it("rejects a browser with no account login", async () => {
    const h = harness({
      canonicalSessionId: GUEST,
      lookup: async () => ACCOUNT,
    });

    await h.middleware(h.req, h.res, h.next);

    expect(h.status).toHaveBeenCalledWith(401);
    expect(h.next).not.toHaveBeenCalled();
  });

  it("returns a bounded 503 when the account lookup fails", async () => {
    const h = harness({
      authToken: "valid-token",
      canonicalSessionId: GUEST,
      lookup: async () => {
        throw new Error("db unavailable");
      },
    });

    await h.middleware(h.req, h.res, h.next);

    expect(h.status).toHaveBeenCalledWith(503);
    expect(h.json).toHaveBeenCalledWith({
      ready: false,
      status: "FAILED",
      error: "BLACKJACK_SESSION_UNAVAILABLE",
    });
    expect(h.next).not.toHaveBeenCalled();
  });

  it("does not affect unrelated routes", async () => {
    const h = harness({
      authToken: "valid-token",
      canonicalSessionId: GUEST,
      lookup: async () => ACCOUNT,
    });
    Object.assign(h.req, { path: "/roulette/state" });

    await h.middleware(h.req, h.res, h.next);

    expect(h.next).toHaveBeenCalledTimes(1);
    expect(h.cookie).not.toHaveBeenCalled();
  });
});
