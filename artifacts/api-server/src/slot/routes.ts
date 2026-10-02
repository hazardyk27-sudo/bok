import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { SESSION_COOKIE } from "../platform/session";
import { slotRepository } from "./repository";

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
  const message = error instanceof Error ? error.message : "SLOT_REQUEST_FAILED";
  const status = message === "INSUFFICIENT_SLOT_CREDITS" ? 402
    : message === "IDEMPOTENCY_KEY_REUSED" ? 409
      : 400;
  res.status(status).json({ error: message });
}

function writeSpinEvent(res: Response, event: "result" | "settled" | "error", payload: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

router.get("/slot/state", async (req, res) => {
  try {
    res.json(await slotRepository.getState(getSessionId(req, res)));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/slot/migrate", async (req, res) => {
  try {
    const legacyBalanceCents = Number((req.body as { legacyBalanceCents?: unknown }).legacyBalanceCents);
    res.json(await slotRepository.migrateLegacyBalance(getSessionId(req, res), legacyBalanceCents));
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/slot/spins", async (req, res) => {
  const body = req.body as { stakeCents?: unknown; idempotencyKey?: unknown };
  if (typeof body.idempotencyKey !== "string") {
    res.status(400).json({ error: "stakeCents and idempotencyKey are required" });
    return;
  }

  const input = {
    stakeCents: Number(body.stakeCents),
    idempotencyKey: body.idempotencyKey,
  };
  const sessionId = getSessionId(req, res);
  const wantsStream = req.get("accept")?.includes("text/event-stream") ?? false;

  if (!wantsStream) {
    try {
      res.status(201).json(await slotRepository.spin(sessionId, input));
    } catch (error) {
      sendError(res, error);
    }
    return;
  }

  let prepared: ReturnType<typeof slotRepository.prepareSpin>;
  try {
    prepared = slotRepository.prepareSpin(input);
  } catch (error) {
    sendError(res, error);
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  writeSpinEvent(res, "result", {
    roundId: prepared.roundId,
    result: prepared.wireResult,
  });

  try {
    const settled = await slotRepository.settlePreparedSpin(sessionId, prepared);
    writeSpinEvent(res, "settled", {
      roundId: settled.roundId,
      wallet: settled.wallet,
      ...(settled.roundId === prepared.roundId ? {} : { result: settled.result }),
    });
  } catch (error) {
    writeSpinEvent(res, "error", {
      error: error instanceof Error ? error.message : "SLOT_REQUEST_FAILED",
    });
  } finally {
    res.end();
  }
});

export default router;