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

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error
    ? error.message
    : "BLACKJACK_REQUEST_FAILED";

  const status =
    message === "INSUFFICIENT_BLACKJACK_CREDITS"
      ? 402
      : message === "BLACKJACK_STALE_REVISION" ||
          message === "BLACKJACK_ROUND_ALREADY_ACTIVE" ||
          message === "BLACKJACK_ACTION_NOT_ALLOWED" ||
          message === "BLACKJACK_IDEMPOTENCY_KEY_REUSED"
        ? 409
        : 400;

  res.status(status).json({ error: message });
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

  if (input.action === "deal" && !Array.isArray(input.seats)) {
    throw new Error("BLACKJACK_DEAL_SEATS_REQUIRED");
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
  try {
    res.json(await blackjackRepository.getState(getSessionId(req, res)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/blackjack/action", async (req, res) => {
  try {
    const request = parseActionRequest(req.body);
    res.json(
      await blackjackRepository.applyAction(
        getSessionId(req, res),
        request,
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
