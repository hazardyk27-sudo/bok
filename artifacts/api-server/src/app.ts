import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_MS,
  getLegacyScopedSessionPathForRequest,
  getLegacySessionId,
  getSessionCookieCandidates,
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
// When both cookies exist, preserve an established canonical wallet unless it is
// only the untouched default while the legacy identity has a real balance.
app.use(async (req, res, next) => {
  try {
    const sessionCandidates = getSessionCookieCandidates(req.headers.cookie);
    const legacySessionId = getLegacySessionId(req.cookies);
    const selectedSessionId = await resolveCanonicalWalletSessionCandidates(
      sessionCandidates,
      legacySessionId,
    );

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
