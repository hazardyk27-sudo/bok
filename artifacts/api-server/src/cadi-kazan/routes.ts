import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { SESSION_COOKIE } from "../platform/session";
import { retireOfficePoolsWithJackpotLeak } from "./officePoolIntegrity";
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
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
  return sessionId;
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "CADI_KAZAN_REQUEST_FAILED";
  const status = message === "INSUFFICIENT_CADI_KAZAN_CREDITS" ? 402
    : message === "CADI_KAZAN_ROUND_NOT_FOUND" ? 404
      : message === "ACTIVE_CADI_KAZAN_ROUND_EXISTS" || message === "CADI_KAZAN_ROUND_NOT_ACTIVE" || message === "CASH_OUT_REQUIRES_SAFE_REVEAL" || message === "OFFICE_MATCH_NO_CASH_OUT" || message === "IDEMPOTENCY_KEY_REUSED" ? 409
        : 400;
  res.status(status).json({ error: message });
}

router.get("/cadi-kazan/office-pool", async (_req, res) => {
  try {
    res.json(await cadiKazanRepository.getOfficePoolStatus());
  } catch (error) {
    sendError(res, error);
  }
});

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
    const normalizedMode = String(mode).toUpperCase() as CadiKazanMode;
    if (!CADI_KAZAN_MODES.includes(normalizedMode) || typeof idempotencyKey !== "string") {
      res.status(400).json({ error: "mode, stakeCents, alarmCount and idempotencyKey are required" });
      return;
    }

    // Pools prepared by the old generator can have MICHAEL on filler/loss
    // cards even though only one ticket is the 100x outcome. Retire those
    // ACTIVE/READY pools before the next Office purchase so the visible jackpot
    // symbol itself is truly exclusive to the single 1/200 jackpot ticket.
    if (normalizedMode === "OFFICE_MATCH_6") {
      await retireOfficePoolsWithJackpotLeak(sessionId);
    }

    res.status(201).json(await cadiKazanRepository.createRound(sessionId, {
      mode: normalizedMode,
      alarmCount: Number(alarmCount),
      stakeCents: Number(stakeCents),
      idempotencyKey,
    }));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/cadi-kazan/rounds/:roundId/prepare-reveal", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const roundId = req.params.roundId;
    const { cellIndex: rawCellIndex } = req.body as { cellIndex?: unknown };
    const cellIndex = Number(rawCellIndex);
    let prepared: Awaited<ReturnType<typeof cadiKazanRepository.prepareReveal>>;

    try {
      prepared = await cadiKazanRepository.prepareReveal(sessionId, roundId, cellIndex);
    } catch (error) {
      // A prepare request may be retried after the first request already settled
      // the bomb but its HTTP response was lost. Return the same authoritative
      // terminal state instead of leaking a 409 back into the scratch surface.
      if (!(error instanceof Error) || error.message !== "CADI_KAZAN_ROUND_NOT_ACTIVE") throw error;
      const state = await cadiKazanRepository.getState(sessionId);
      const round = state.round;
      if (
        !round ||
        round.id !== roundId ||
        round.status !== "BUST" ||
        round.mode === "OFFICE_MATCH_6" ||
        !round.revealedBombCells.includes(cellIndex)
      ) throw error;

      res.json({
        roundId,
        cellIndex,
        mode: round.mode,
        kind: "BOMB",
        settlement: { outcome: "NOOP", state },
      });
      return;
    }

    // Security boundary: never disclose a bomb to the browser while the round
    // is still cash-out eligible. Settle the exact bomb server-side first, then
    // return both the prepared visual result and authoritative terminal state.
    if (prepared.kind === "BOMB") {
      const settlement = await cadiKazanRepository.revealCell(
        sessionId,
        roundId,
        cellIndex,
        `prepare-bust-${roundId}-${cellIndex}`,
      );
      res.json({ ...prepared, settlement });
      return;
    }

    res.json(prepared);
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