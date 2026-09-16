import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { rouletteRepository } from "./repository";
import { MAX_STAKE_CENTS, MIN_STAKE_CENTS } from "./types";

const router: IRouter = Router();
const SESSION_COOKIE = "roulette_session";

function getSessionId(req: Request, res: Response) {
  const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (existing && /^[a-f0-9-]{20,80}$/.test(existing)) return existing;
  const sessionId = randomUUID();
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  return sessionId;
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "ROULETTE_REQUEST_FAILED";
  const status = message === "BETTING_CLOSED" ? 409
    : message === "INSUFFICIENT_ROULETTE_CREDITS" ? 402
      : message === "ROULETTE_COORDINATOR_UNAVAILABLE" ? 503
        : 400;
  res.status(status).json({ error: message });
}

router.get("/roulette/session", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const snapshot = await rouletteRepository.getSnapshot(sessionId);
    res.json({ sessionId, snapshot });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/roulette/snapshot", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    res.json(await rouletteRepository.getSnapshot(sessionId));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/roulette/wallet", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    res.json(await rouletteRepository.getWallet(sessionId));
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/roulette/history", async (req, res) => {
  try {
    res.json({ results: await rouletteRepository.getRecentResults(Number(req.query.limit ?? 12)) });
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/roulette/bets", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const { number, stakeCents, idempotencyKey } = req.body as {
      number?: unknown;
      stakeCents?: unknown;
      idempotencyKey?: unknown;
    };
    if (typeof number !== "number" || typeof stakeCents !== "number" || typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "number, stakeCents and idempotencyKey are required" });
      return;
    }
    if (stakeCents < MIN_STAKE_CENTS || stakeCents > MAX_STAKE_CENTS) {
      res.status(400).json({ error: `Stake must be between ${MIN_STAKE_CENTS} and ${MAX_STAKE_CENTS} cents` });
      return;
    }
    res.status(201).json(await rouletteRepository.placeBet(sessionId, { number, stakeCents, idempotencyKey }));
  } catch (error) {
    sendError(res, error);
  }
});

export { SESSION_COOKIE };
export default router;