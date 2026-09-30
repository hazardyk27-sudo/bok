import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import { authRepository } from "./repository";
import {
  AUTH_SESSION_TTL_MS,
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
} from "./security";

export const AUTH_COOKIE = "fy_auth";
const GAME_SESSION_COOKIE = "game_session";
const GAME_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 365;
const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function cookieSecurity() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    ...cookieSecurity(),
    maxAge: AUTH_SESSION_TTL_MS,
  });
}

function setGameSessionCookie(res: Response, sessionId: string) {
  res.cookie(GAME_SESSION_COOKIE, sessionId, {
    ...cookieSecurity(),
    maxAge: GAME_SESSION_TTL_MS,
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, cookieSecurity());
}

function sendAuthError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "AUTH_REQUEST_FAILED";
  const status =
    message === "EMAIL_ALREADY_REGISTERED"
      || message === "USERNAME_ALREADY_REGISTERED"
      || message === "WALLET_ALREADY_LINKED"
      ? 409
      : message === "INVALID_EMAIL_OR_PASSWORD"
        || message === "CURRENT_PASSWORD_INVALID"
        || message === "AUTH_REQUIRED"
        ? 401
        : 400;
  res.status(status).json({ error: message });
}

function readRegisterCredentials(body: unknown) {
  const source =
    body && typeof body === "object"
      ? (body as {
          email?: unknown;
          username?: unknown;
          password?: unknown;
        })
      : {};

  const email = typeof source.email === "string"
    ? normalizeEmail(source.email)
    : "";
  const username = typeof source.username === "string"
    ? normalizeUsername(source.username)
    : "";
  const password = typeof source.password === "string"
    ? source.password
    : "";

  if (!isValidEmail(email)) throw new Error("INVALID_EMAIL");
  if (!isValidUsername(username)) throw new Error("INVALID_USERNAME");
  if (!isValidPassword(password)) throw new Error("INVALID_PASSWORD");

  return { email, username, password };
}

function readLoginCredentials(body: unknown) {
  const source =
    body && typeof body === "object"
      ? (body as {
          identifier?: unknown;
          email?: unknown;
          password?: unknown;
        })
      : {};

  const rawIdentifier =
    typeof source.identifier === "string"
      ? source.identifier
      : typeof source.email === "string"
        ? source.email
        : "";
  const identifier = rawIdentifier.trim().toLowerCase();
  const password = typeof source.password === "string"
    ? source.password
    : "";

  if (
    identifier.length < 3
    || identifier.length > 254
    || !isValidPassword(password)
  ) {
    throw new Error("INVALID_EMAIL_OR_PASSWORD");
  }

  return { identifier, password };
}

function readPasswordChange(body: unknown) {
  const source =
    body && typeof body === "object"
      ? (body as {
          currentPassword?: unknown;
          newPassword?: unknown;
        })
      : {};

  const currentPassword =
    typeof source.currentPassword === "string"
      ? source.currentPassword
      : "";
  const newPassword =
    typeof source.newPassword === "string"
      ? source.newPassword
      : "";

  if (!isValidPassword(newPassword)) {
    throw new Error("INVALID_PASSWORD");
  }
  if (!currentPassword) {
    throw new Error("CURRENT_PASSWORD_INVALID");
  }

  return { currentPassword, newPassword };
}

router.post("/auth/register", async (req, res) => {
  try {
    const { email, username, password } = readRegisterCredentials(req.body);
    // Registration always starts a brand-new account identity. Never bind a
    // newly created account to the browser's existing guest game_session.
    const walletSessionId = randomUUID();
    const result = await authRepository.register(
      email,
      username,
      password,
      walletSessionId,
    );

    setAuthCookie(res, result.token);
    setGameSessionCookie(res, result.walletSessionId);
    res.status(201).json({ user: result.user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { identifier, password } = readLoginCredentials(req.body);
    const result = await authRepository.login(identifier, password);

    setAuthCookie(res, result.token);
    setGameSessionCookie(res, result.walletSessionId);
    res.json({ user: result.user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/password", async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (!token) {
    sendAuthError(res, new Error("AUTH_REQUIRED"));
    return;
  }

  try {
    const { currentPassword, newPassword } = readPasswordChange(req.body);
    const result = await authRepository.changePassword(
      token,
      currentPassword,
      newPassword,
    );

    setGameSessionCookie(res, result.walletSessionId);
    res.json({ user: result.user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  const anonymousSessionId = randomUUID();

  try {
    if (token) await authRepository.revokeSession(token);
    await authRepository.ensureAnonymousWallet(anonymousSessionId);
  } catch {
    // Logout must still detach this browser from the account wallet.
  } finally {
    clearAuthCookie(res);
    setGameSessionCookie(res, anonymousSessionId);
  }

  res.status(204).end();
});

router.get("/auth/me", async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (!token) {
    res.json({ user: null });
    return;
  }

  try {
    const result = await authRepository.getUserBySessionToken(token);
    if (!result) {
      clearAuthCookie(res);
      res.json({ user: null });
      return;
    }

    setGameSessionCookie(res, result.walletSessionId);
    res.json({ user: result.user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

export default router;
