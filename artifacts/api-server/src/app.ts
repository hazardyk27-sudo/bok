import { randomUUID } from "node:crypto";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { AUTH_COOKIE } from "./auth/routes";
import { authRepository } from "./auth/repository";
import {
  LEGACY_SCOPED_SESSION_PATHS,
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  chooseRequestSessionId,
  getLegacyScopedSessionPathForRequest,
  getLegacySessionId,
  getSessionCookieCandidates,
  shouldResolveAuthenticatedWalletSession,
} from "./platform/session";
import { resolveCanonicalWalletSessionCandidates } from "./platform/wallet";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    customLogLevel(req, res, err) {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";

      const url = req.url?.split("?")[0] ?? "";
      if (
        url === "/api/readyz" ||
        url === "/api/healthz" ||
        url === "/api/roulette/state" ||
        url === "/api/idle/market/live"
      ) {
        return "silent";
      }
      return "info";
    },
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());

app.use(async (req, res, next) => {
  try {
    const sessionCandidates = getSessionCookieCandidates(req.headers.cookie);
    const legacySessionId = getLegacySessionId(req.cookies);
    const authToken = req.cookies?.[AUTH_COOKIE];
    const hasAuthToken = typeof authToken === "string" && authToken.length > 0;
    const resolveAuthenticatedWallet = shouldResolveAuthenticatedWalletSession({
      hasAuthToken,
      method: req.method,
      sessionCandidateCount: sessionCandidates.length,
      legacySessionId,
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    };

    const authenticatedWalletSessionId =
      resolveAuthenticatedWallet && hasAuthToken
        ? await authRepository.getWalletSessionIdBySessionToken(authToken)
        : null;
    const invalidAuthenticatedSession =
      hasAuthToken && authenticatedWalletSessionId === null;

    let detachedAnonymousSessionId: string | null = null;
    if (invalidAuthenticatedSession) {
      detachedAnonymousSessionId = randomUUID();
      await authRepository.ensureAnonymousWallet(detachedAnonymousSessionId);

      res.clearCookie(AUTH_COOKIE, { ...cookieOptions, path: "/" });
      for (const path of ["/", ...LEGACY_SCOPED_SESSION_PATHS]) {
        res.clearCookie(SESSION_COOKIE, { ...cookieOptions, path });
        res.clearCookie(LEGACY_SESSION_COOKIE, { ...cookieOptions, path });
      }

      delete req.cookies[AUTH_COOKIE];
      delete req.cookies[LEGACY_SESSION_COOKIE];
      req.cookies[SESSION_COOKIE] = detachedAnonymousSessionId;
    }

    const convergedWalletSessionId =
      authenticatedWalletSessionId || invalidAuthenticatedSession
        ? null
        : await resolveCanonicalWalletSessionCandidates(
            sessionCandidates,
            legacySessionId,
          );
    const selectedSessionId = detachedAnonymousSessionId
      ?? chooseRequestSessionId({
        authenticatedWalletSessionId,
        convergedWalletSessionId,
      });

    if (selectedSessionId) {
      req.cookies[SESSION_COOKIE] = selectedSessionId;
      res.cookie(SESSION_COOKIE, selectedSessionId, {
        ...cookieOptions,
        path: "/",
        maxAge: SESSION_COOKIE_MAX_AGE_MS,
      });
    }

    const observedLegacyScope = getLegacyScopedSessionPathForRequest(req.path);
    if (observedLegacyScope) {
      res.clearCookie(SESSION_COOKIE, {
        ...cookieOptions,
        path: observedLegacyScope,
      });
    }

    if (legacySessionId) {
      res.clearCookie(LEGACY_SESSION_COOKIE, { ...cookieOptions, path: "/" });
      if (observedLegacyScope) {
        res.clearCookie(LEGACY_SESSION_COOKIE, {
          ...cookieOptions,
          path: observedLegacyScope,
        });
      }
    }

    if (invalidAuthenticatedSession && !req.path.startsWith("/api/auth/")) {
      res.status(401).json({ error: "AUTH_SESSION_REVOKED" });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

export default app;
