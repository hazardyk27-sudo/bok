import { randomUUID } from "node:crypto";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { SESSION_COOKIE } from "../platform/session";
import {
  type BlackjackServerActionName,
  type BlackjackServerActionRequest,
} from "../../../cascade-8/src/blackjack/serverContract";
import { blackjackRepository } from "./repository";

const router: IRouter = Router();

const ACTIONS = new Set<BlackjackServerActionName>([
  "deal",
  "hit",
  "stand",
  "double",
  "split",
  "insurance",
  "declineInsurance",
  "next",
]);

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function getSessionId(req: Request, res: Response): string {
  const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (existing && /^[a-f0-9-]{20,80}$/i.test(existing)) {
    return existing;
  }

  const sessionId = randomUUID();
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  return sessionId;
}

function statusForError(message: string): number {
  if (message === "INSUFFICIENT_BLACKJACK_CREDITS") return 402;
  if (
    message === "BLACKJACK_STALE_REVISION" ||
    message === "BLACKJACK_ROUND_ALREADY_ACTIVE" ||
    message === "BLACKJACK_ACTION_NOT_ALLOWED" ||
    message === "BLACKJACK_IDEMPOTENCY_KEY_REUSED"
  ) {
    return 409;
  }
  return 400;
}

function parseActionRequest(body: unknown): BlackjackServerActionRequest {
  const input = body as {
    expectedRevision?: unknown;
    idempotencyKey?: unknown;
    action?: unknown;
    seats?: unknown;
  };

  if (
    !input ||
    !Number.isSafeInteger(input.expectedRevision) ||
    Number(input.expectedRevision) < 0 ||
    typeof input.idempotencyKey !== "string" ||
    typeof input.action !== "string" ||
    !ACTIONS.has(input.action as BlackjackServerActionName)
  ) {
    throw new Error("BLACKJACK_ACTION_INPUT_REQUIRED");
  }

  if (input.action === "deal") {
    if (!Array.isArray(input.seats)) {
      throw new Error("BLACKJACK_DEAL_SEATS_REQUIRED");
    }
  } else if (input.seats !== undefined) {
    throw new Error("BLACKJACK_ACTION_SEATS_NOT_ALLOWED");
  }

  return {
    expectedRevision: Number(input.expectedRevision),
    idempotencyKey: input.idempotencyKey,
    action: input.action as BlackjackServerActionName,
    seats: Array.isArray(input.seats)
      ? input.seats as BlackjackServerActionRequest["seats"]
      : undefined,
  };
}

router.get("/blackjack/state", async (req, res) => {
  const sessionId = getSessionId(req, res);
  try {
    res.json(await blackjackRepository.getState(sessionId));
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "BLACKJACK_REQUEST_FAILED";
    res.status(statusForError(message)).json({ error: message });
  }
});

router.post("/blackjack/action", async (req, res) => {
  const sessionId = getSessionId(req, res);

  try {
    const request = parseActionRequest(req.body);
    res.json(await blackjackRepository.applyAction(sessionId, request));
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "BLACKJACK_REQUEST_FAILED";
    const status = statusForError(message);

    if (message === "BLACKJACK_STALE_REVISION") {
      try {
        res.status(status).json({
          error: message,
          snapshot: await blackjackRepository.getState(sessionId),
        });
        return;
      } catch {
        // Fall through to the original stale error if recovery snapshot lookup fails.
      }
    }

    res.status(status).json({ error: message });
  }
});

export default router;
