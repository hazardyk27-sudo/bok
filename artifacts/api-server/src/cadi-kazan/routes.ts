import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { SESSION_COOKIE } from "../roulette/routes";
import { cadiKazanRepository } from "./repository";
import { CADI_KAZAN_MODES, type CadiKazanMode } from "./types";

const router: IRouter = Router();

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
  const message = error instanceof Error ? error.message : "CADI_KAZAN_REQUEST_FAILED";
  const status = message === "INSUFFICIENT_CADI_KAZAN_CREDITS" ? 402
    : message === "CADI_KAZAN_ROUND_NOT_FOUND" ? 404
      : message === "ACTIVE_CADI_KAZAN_ROUND_EXISTS" || message === "CASH_OUT_REQUIRES_SAFE_REVEAL" || message === "IDEMPOTENCY_KEY_REUSED" ? 409
        : 400;
  res.status(status).json({ error: message });
}

router.get("/cadi-kazan/state", async (req, res) => {
  try {
    res.json(await cadiKazanRepository.getState(getSessionId(req, res)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/cadi-kazan/rounds", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const { mode, alarmCount, stakeCents, idempotencyKey } = req.body as {
      mode?: unknown;
      alarmCount?: unknown;
      stakeCents?: unknown;
      idempotencyKey?: unknown;
    };
    if (!CADI_KAZAN_MODES.includes(String(mode).toUpperCase() as CadiKazanMode) || typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "mode, stakeCents, alarmCount and idempotencyKey are required" });
      return;
    }
    res.status(201).json(await cadiKazanRepository.createRound(sessionId, {
      mode: String(mode).toUpperCase() as CadiKazanMode,
      alarmCount: Number(alarmCount),
      stakeCents: Number(stakeCents),
      idempotencyKey,
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/cadi-kazan/rounds/:roundId/reveal", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const { cellIndex, idempotencyKey } = req.body as { cellIndex?: unknown; idempotencyKey?: unknown };
    if (typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "cellIndex and idempotencyKey are required" });
      return;
    }
    res.json(await cadiKazanRepository.revealCell(sessionId, req.params.roundId, Number(cellIndex), idempotencyKey));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/cadi-kazan/rounds/:roundId/cash-out", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const { idempotencyKey } = req.body as { idempotencyKey?: unknown };
    if (typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "idempotencyKey is required" });
      return;
    }
    res.json(await cadiKazanRepository.cashOut(sessionId, req.params.roundId, idempotencyKey));
  } catch (error) {
    sendError(res, error);
  }
});

export default router;