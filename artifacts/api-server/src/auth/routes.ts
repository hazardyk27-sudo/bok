import { Router, type IRouter, type Response } from "express";
import { authRepository } from "./repository";
import {
  AUTH_SESSION_TTL_MS,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
} from "./security";

export const AUTH_COOKIE = "fy_auth";

const router: IRouter = Router();

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: AUTH_SESSION_TTL_MS,
    path: "/",
  });
}

function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

function sendAuthError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "AUTH_REQUEST_FAILED";
  const status =
    message === "EMAIL_ALREADY_REGISTERED"
      ? 409
      : message === "INVALID_EMAIL_OR_PASSWORD"
        ? 401
        : 400;
  res.status(status).json({ error: message });
}

function readRawCredentials(body: unknown) {
  const source =
    body && typeof body === "object"
      ? (body as { email?: unknown; password?: unknown })
      : {};
  return {
    email: typeof source.email === "string" ? normalizeEmail(source.email) : "",
    password: typeof source.password === "string" ? source.password : "",
  };
}

function readRegisterCredentials(body: unknown) {
  const credentials = readRawCredentials(body);
  if (!isValidEmail(credentials.email)) throw new Error("INVALID_EMAIL");
  if (!isValidPassword(credentials.password)) throw new Error("INVALID_PASSWORD");
  return credentials;
}

function readLoginCredentials(body: unknown) {
  const credentials = readRawCredentials(body);
  if (!isValidEmail(credentials.email) || !isValidPassword(credentials.password)) {
    throw new Error("INVALID_EMAIL_OR_PASSWORD");
  }
  return credentials;
}

router.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = readRegisterCredentials(req.body);
    const result = await authRepository.register(email, password);
    setAuthCookie(res, result.token);
    res.status(201).json({ user: result.user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = readLoginCredentials(req.body);
    const result = await authRepository.login(email, password);
    setAuthCookie(res, result.token);
    res.json({ user: result.user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.post("/auth/logout", async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  try {
    if (token) await authRepository.revokeSession(token);
  } finally {
    clearAuthCookie(res);
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
    const user = await authRepository.getUserBySessionToken(token);
    if (!user) clearAuthCookie(res);
    res.json({ user });
  } catch (error) {
    sendAuthError(res, error);
  }
});

export default router;
