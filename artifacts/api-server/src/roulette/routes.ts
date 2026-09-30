import { randomUUID } from "node:crypto";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import { SESSION_COOKIE } from "../platform/session";
import { rouletteRepository } from "./repository";
import { parseRouletteServerBets } from "./round";

const router: IRouter = Router();

function getSessionId(req: Request, res: Response) {
  const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;

  if (existing && /^[a-f0-9-]{20,80}$/.test(existing)) {
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

function sendError(res: Response, error: unknown) {
  const message =
    error instanceof Error ? error.message : "ROULETTE_REQUEST_FAILED";

  const status =
    message === "INSUFFICIENT_ROULETTE_CREDITS"
      ? 402
      : message === "ROULETTE_IDEMPOTENCY_KEY_REUSED"
        ? 409
        : 400;

  res.status(status).json({ error: message });
}

router.get("/roulette/state", async (req, res) => {
  try {
    res.json(
      await rouletteRepository.getState(
        getSessionId(req, res),
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/roulette/spins", async (req, res) => {
  try {
    const body = req.body as {
      bets?: unknown;
      idempotencyKey?: unknown;
    };

    if (typeof body.idempotencyKey !== "string") {
      res.status(400).json({
        error: "ROULETTE_SPIN_INPUT_REQUIRED",
      });
      return;
    }

    const bets = parseRouletteServerBets(body.bets);

    res.status(201).json(
      await rouletteRepository.spin(
        getSessionId(req, res),
        {
          bets,
          idempotencyKey: body.idempotencyKey,
        },
      ),
    );
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
