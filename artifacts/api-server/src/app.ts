import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { AUTH_COOKIE } from "./auth/routes";
import { authRepository } from "./auth/repository";
import {
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
      if (err || res.statusCode >= 500) {
        return "error";
      }
      if (res.statusCode >= 400) {
        return "warn";
      }

      const url =
        req.url?.split("?")[0] ??
        "";

      if (
        url === "/api/readyz" ||
        url === "/api/healthz" ||
        url === "/api/roulette/state" ||
        url === "/api/blackjack/health" ||
        url === "/api/idle/market/live"
      ) {
        return "silent";
      }

      return "info";
    },
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());

// game_session is the only live game identity. roulette_session is migration-only.
// Guests still converge fragmented historical wallets by their established server
// balance. Logged-in users are different: users.wallet_session_id is authoritative
// for both reads and writes, so stale/scoped browser cookies cannot switch wallets
// or render a stale wallet as if it were the account balance.
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

    const authenticatedWalletSessionId =
      resolveAuthenticatedWallet && hasAuthToken
        ? await authRepository.getWalletSessionIdBySessionToken(authToken)
        : null;
    const convergedWalletSessionId = authenticatedWalletSessionId
      ? null
      : await resolveCanonicalWalletSessionCandidates(
          sessionCandidates,
          legacySessionId,
        );
    const selectedSessionId = chooseRequestSessionId({
      authenticatedWalletSessionId,
      convergedWalletSessionId,
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
    };

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
      res.clearCookie(LEGACY_SESSION_COOKIE, {
        ...cookieOptions,
        path: "/",
      });
      if (observedLegacyScope) {
        res.clearCookie(LEGACY_SESSION_COOKIE, {
          ...cookieOptions,
          path: observedLegacyScope,
        });
      }
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
