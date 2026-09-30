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
  getCanonicalSessionId,
  getLegacySessionId,
} from "./platform/session";
import { resolveCanonicalWalletSessionId } from "./platform/wallet";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
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
    const canonicalSessionId = getCanonicalSessionId(req.cookies);
    const legacySessionId = getLegacySessionId(req.cookies);
    const selectedSessionId = await resolveCanonicalWalletSessionId(
      canonicalSessionId,
      legacySessionId,
    );

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };

    if (selectedSessionId) {
      req.cookies[SESSION_COOKIE] = selectedSessionId;
      if (canonicalSessionId !== selectedSessionId) {
        res.cookie(SESSION_COOKIE, selectedSessionId, {
          ...cookieOptions,
          maxAge: SESSION_COOKIE_MAX_AGE_MS,
        });
      }
    }

    if (legacySessionId) {
      res.clearCookie(LEGACY_SESSION_COOKIE, cookieOptions);
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
