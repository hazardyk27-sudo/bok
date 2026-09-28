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
  getLegacySessionId,
} from "./platform/session";

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

// Isolation v2 renamed the historical shared session cookie from
// roulette_session to game_session. Prefer the legacy ID once when it is
// still present so existing wallet/business state stays attached to the same
// server-side session, then migrate the browser forward to game_session.
app.use((req, res, next) => {
  const legacySessionId = getLegacySessionId(req.cookies);
  if (legacySessionId) {
    req.cookies[SESSION_COOKIE] = legacySessionId;

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };

    res.cookie(SESSION_COOKIE, legacySessionId, {
      ...cookieOptions,
      maxAge: SESSION_COOKIE_MAX_AGE_MS,
    });
    res.clearCookie(LEGACY_SESSION_COOKIE, cookieOptions);
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
