import { Router, type IRouter, type Request, type Response } from "express";
import { sendVerificationEmail } from "./mailer";
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
      : message === "INVALID_EMAIL_OR_PASSWORD" || message === "AUTH_REQUIRED"
        ? 401
        : message === "EMAIL_VERIFICATION_RATE_LIMIT"
          ? 429
          : message === "EMAIL_DELIVERY_FAILED" || message === "EMAIL_DELIVERY_NOT_CONFIGURED"
            ? 503
            : 400;
  res.status(status).json({ error: message });
}

function getPublicBaseUrl(req: Request) {
  const configured = process.env.AUTH_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_PUBLIC_BASE_URL_REQUIRED");
  }
  const host = req.get("host");
  if (!host) throw new Error("AUTH_PUBLIC_BASE_URL_REQUIRED");
  return `${req.protocol}://${host}`;
}

async function dispatchVerificationEmail(
  userId: string,
  req: Request,
  suppressDeliveryFailure = false,
) {
  const verification = await authRepository.issueEmailVerification(userId);
  if (verification.alreadyVerified) {
    return { sent: false, alreadyVerified: true };
  }

  const verificationUrl =
    `${getPublicBaseUrl(req)}/api/auth/verify-email?token=${encodeURIComponent(verification.token)}`;

  try {
    await sendVerificationEmail({
      to: verification.user.email,
      verificationUrl,
      verificationId: verification.verificationId,
    });
    return { sent: true, alreadyVerified: false };
  } catch (error) {
    await authRepository.discardEmailVerification(verification.verificationId);
    if (suppressDeliveryFailure) {
      return { sent: false, alreadyVerified: false };
    }
    throw error;
  }
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
    const verification = await dispatchVerificationEmail(result.user.id, req, true);
    res.status(201).json({
      user: result.user,
      verificationEmailSent: verification.sent,
    });
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

router.post("/auth/resend-verification", async (req, res) => {
  const token = req.cookies?.[AUTH_COOKIE] as string | undefined;
  if (!token) {
    sendAuthError(res, new Error("AUTH_REQUIRED"));
    return;
  }

  try {
    const user = await authRepository.getUserBySessionToken(token);
    if (!user) {
      clearAuthCookie(res);
      sendAuthError(res, new Error("AUTH_REQUIRED"));
      return;
    }

    const verification = await dispatchVerificationEmail(user.id, req);
    res.status(202).json({
      user,
      verificationEmailSent: verification.sent,
      alreadyVerified: verification.alreadyVerified,
    });
  } catch (error) {
    sendAuthError(res, error);
  }
});

router.get("/auth/verify-email", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  try {
    await authRepository.verifyEmail(token);
    res.redirect(303, "/account?verification=success");
  } catch {
    res.redirect(303, "/account?verification=invalid");
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
