import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  isValidSessionId,
} from "../platform/session";
import type { BlackjackAuthWalletLookup } from "./httpSessionIdentity";

export const BLACKJACK_AUTH_COOKIE = "fy_auth" as const;

export type BlackjackSessionIdentityMiddlewareOptions = Readonly<{
  lookupAuthWalletSessionId?: BlackjackAuthWalletLookup;
}>;

function writeCanonicalSessionCookie(
  res: Response,
  sessionId: string,
): void {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

export function createBlackjackSessionIdentityMiddleware(
  options: BlackjackSessionIdentityMiddlewareOptions = {},
): RequestHandler {
  const lookupAuthWalletSessionId =
    options.lookupAuthWalletSessionId
    ?? (async (authToken: string) => {
      const { authRepository } = await import("../auth/repository");
      const session = await authRepository.getUserBySessionToken(authToken);
      return session?.walletSessionId ?? null;
    });

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (req.method !== "GET" || req.path !== "/blackjack/session") {
      next();
      return;
    }

    const authToken = req.cookies?.[BLACKJACK_AUTH_COOKIE];
    if (typeof authToken !== "string" || authToken.length === 0) {
      res.status(401).json({
        ready: false,
        status: "LOGIN_REQUIRED",
        error: "BLACKJACK_LOGIN_REQUIRED",
      });
      return;
    }

    try {
      const walletSessionId = await lookupAuthWalletSessionId(authToken);
      if (!isValidSessionId(walletSessionId)) {
        res.status(401).json({
          ready: false,
          status: "LOGIN_REQUIRED",
          error: "BLACKJACK_LOGIN_REQUIRED",
        });
        return;
      }

      req.cookies ??= {};
      req.cookies[SESSION_COOKIE] = walletSessionId;
      writeCanonicalSessionCookie(res, walletSessionId);
      next();
    } catch {
      res.status(503).json({
        ready: false,
        status: "FAILED",
        error: "BLACKJACK_SESSION_UNAVAILABLE",
      });
    }
  };
}

export const blackjackSessionIdentityMiddleware =
  createBlackjackSessionIdentityMiddleware();
