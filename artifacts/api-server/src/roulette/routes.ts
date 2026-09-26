import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { rouletteRepository } from "./repository";
import { MAX_STAKE_CENTS, MIN_STAKE_CENTS, type RouletteBetInput } from "./types";

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
        : message === "ROULETTE_ROUND_GENERATION_PAUSED" ? 503
        : message === "ROULETTE_PHYSICS_ROUND_INVALID" ? 503
          : message === "ROULETTE_PHYSICS_REPLAY_INVALID" ? 503
            : message === "ROULETTE_PHYSICS_RESULT_MISMATCH" ? 503
              : message === "ROULETTE_REPLAY_NOT_AVAILABLE" ? 409
                : message === "ROULETTE_ROUND_NOT_FOUND" ? 404
                  : message === "ROULETTE_PHYSICS_ROUND_MISSING" ? 503
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

router.get("/roulette/rounds/:roundId/replay", async (req, res) => {
  try {
    res.json(await rouletteRepository.getReplayForRound(req.params.roundId));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/roulette/bets", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const { number, stakeCents, bets, idempotencyKey } = req.body as {
      number?: unknown;
      stakeCents?: unknown;
      bets?: unknown;
      idempotencyKey?: unknown;
    };
    if (typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "bets and idempotencyKey are required" });
      return;
    }
    const normalizedBets: RouletteBetInput[] = Array.isArray(bets)
      ? bets as RouletteBetInput[]
      : typeof number === "number" && typeof stakeCents === "number"
        ? [{ type: "STRAIGHT", numbers: [number], stakeCents }]
        : [];
    if (!normalizedBets.length) {
      res.status(400).json({ error: "At least one bet is required" });
      return;
    }
    if (normalizedBets.some((bet) => typeof bet.stakeCents !== "number" || bet.stakeCents < MIN_STAKE_CENTS || bet.stakeCents > MAX_STAKE_CENTS)) {
      res.status(400).json({ error: `Each bet must be between ${MIN_STAKE_CENTS} and ${MAX_STAKE_CENTS} cents` });
      return;
    }
    res.status(201).json(await rouletteRepository.placeBets(sessionId, { bets: normalizedBets, idempotencyKey }));
  } catch (error) {
    sendError(res, error);
  }
});

export { SESSION_COOKIE };
export default router;