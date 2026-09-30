import { randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { SHARED_WALLET_TABLE } from "../platform/wallet";
import { ticketMarketPersistence } from "./marketPersistence";
import { ticketMarketRuntime } from "./marketRuntimeDb";
import { buyStadiumSeats } from "./seatPurchase";
import { sellStadiumTickets } from "./ticketSale";
import { upgradeStadiumSpeed } from "./speedUpgrade";
import { upgradeStadiumStorage } from "./storageUpgrade";
import { upgradeStadiumLevel } from "./stadiumUpgrade";
import { getIdleStadiumState } from "./stadiumState";

const router: IRouter = Router();
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{12,100}$/;

/**
 * feature/idle intentionally carries an older shared-platform snapshot than
 * integration/replit-preview. Follow the wallet platform generation so the
 * owned Idle route remains compatible in both places without importing
 * another game's route module.
 */
const SESSION_COOKIE =
  String(SHARED_WALLET_TABLE) === "shared_wallets"
    ? "game_session"
    : "roulette_session";

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


function serializeMarketState(state: {
  priceMicrodollars: number;
  source: "binance-btcusdt" | "coinbase-btc-usd" | "none";
  feedStatus: "CONNECTING" | "REBASELINING" | "LIVE" | "STALE" | "FROZEN";
  tickAt: Date;
}) {
  return {
    priceMicrodollars: state.priceMicrodollars,
    source: state.source,
    feedStatus: state.feedStatus,
    tickAt: state.tickAt.toISOString(),
  };
}

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "IDLE_REQUEST_FAILED";
  const status = message === "IDEMPOTENCY_KEY_REUSED"
    || message === "IDLE_STADIUM_CAPACITY_EXCEEDED"
    || message === "IDLE_STADIUM_MAX_SEATS_REACHED"
    || message === "IDLE_STADIUM_MAX_SEATS_EXCEEDED"
    || message === "IDLE_STADIUM_MAX_LEVEL"
    || message === "IDLE_SPEED_MAX_LEVEL"
    || message === "IDLE_STORAGE_MAX_LEVEL"
    || message === "INSUFFICIENT_IDLE_TICKETS"
    ? 409
    : message === "INSUFFICIENT_IDLE_CREDITS" ? 402
      : message === "IDLE_MARKET_STATE_MISSING" ? 503
        : 400;
  res.status(status).json({ error: message });
}


router.get("/idle/market", async (_req, res) => {
  try {
    const serverNow = new Date();
    const state =
      await ticketMarketPersistence.getCurrentState()
      ?? await ticketMarketPersistence.ensureCurrentState(
        serverNow,
      );

    res.json({
      serverTime: serverNow.toISOString(),
      market: serializeMarketState(state),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/idle/market/history", async (_req, res) => {
  try {
    const serverNow = new Date();
    const points = await ticketMarketPersistence.getHistory(
      serverNow,
    );

    res.json({
      serverTime: serverNow.toISOString(),
      windowHours: 24,
      points: points.map((point) => ({
        tickAt: point.tickAt.toISOString(),
        priceMicrodollars: point.priceMicrodollars,
      })),
    });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/idle/market/live", async (req, res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  let closed = false;

  const writeMarket = (market: {
    priceMicrodollars: number;
    tickAt: string;
    source: "binance-btcusdt" | "coinbase-btc-usd" | "none";
    feedStatus: "CONNECTING" | "REBASELINING" | "LIVE" | "STALE" | "FROZEN";
  }) => {
    if (closed) return;
    res.write(
      `event: market\ndata: ${JSON.stringify(market)}\n\n`,
    );
  };

  const unsubscribe = ticketMarketRuntime.subscribe(
    writeMarket,
    false,
  );

  const heartbeat = setInterval(() => {
    if (!closed) res.write(": keepalive\n\n");
  }, 15_000);

  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.once("close", cleanup);
  res.once("close", cleanup);

  try {
    const state =
      await ticketMarketPersistence.getCurrentState()
      ?? await ticketMarketPersistence.ensureCurrentState(
        new Date(),
      );

    writeMarket(serializeMarketState(state));
  } catch (error) {
    cleanup();

    if (!res.writableEnded) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          error: error instanceof Error
            ? error.message
            : "IDLE_MARKET_STREAM_FAILED",
        })}\n\n`,
      );
      res.end();
    }
  }
});

router.get("/idle/state", async (req, res) => {
  try {
    const sessionId = getSessionId(req, res);
    const state = await getIdleStadiumState(sessionId);
    res.json(state);
  } catch (error) {
    sendError(res, error);
  }
});


router.post("/idle/stadium/tickets/sell", async (req, res) => {
  try {
    const {
      quantityTickets,
      idempotencyKey,
    } = req.body as {
      quantityTickets?: unknown;
      idempotencyKey?: unknown;
    };

    if (
      typeof quantityTickets !== "number"
      || !Number.isSafeInteger(quantityTickets)
      || quantityTickets <= 0
    ) {
      res.status(400).json({
        error: "INVALID_IDLE_TICKET_SALE_QUANTITY",
      });
      return;
    }

    if (
      typeof idempotencyKey !== "string"
      || !IDEMPOTENCY_PATTERN.test(idempotencyKey)
    ) {
      res.status(400).json({
        error: "VALID_IDEMPOTENCY_KEY_REQUIRED",
      });
      return;
    }

    const result = await sellStadiumTickets(
      getSessionId(req, res),
      quantityTickets,
      idempotencyKey,
    );

    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/idle/stadium/storage/upgrade", async (req, res) => {
  try {
    const { idempotencyKey } = req.body as {
      idempotencyKey?: unknown;
    };

    if (
      typeof idempotencyKey !== "string"
      || !IDEMPOTENCY_PATTERN.test(idempotencyKey)
    ) {
      res.status(400).json({
        error: "VALID_IDEMPOTENCY_KEY_REQUIRED",
      });
      return;
    }

    const result = await upgradeStadiumStorage(
      getSessionId(req, res),
      idempotencyKey,
    );

    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/idle/stadium/speed/upgrade", async (req, res) => {
  try {
    const { idempotencyKey } = req.body as {
      idempotencyKey?: unknown;
    };

    if (
      typeof idempotencyKey !== "string"
      || !IDEMPOTENCY_PATTERN.test(idempotencyKey)
    ) {
      res.status(400).json({
        error: "VALID_IDEMPOTENCY_KEY_REQUIRED",
      });
      return;
    }

    const result = await upgradeStadiumSpeed(
      getSessionId(req, res),
      idempotencyKey,
    );

    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/idle/stadium/upgrade", async (req, res) => {
  try {
    const { idempotencyKey } = req.body as {
      idempotencyKey?: unknown;
    };

    if (
      typeof idempotencyKey !== "string"
      || !IDEMPOTENCY_PATTERN.test(idempotencyKey)
    ) {
      res.status(400).json({
        error: "VALID_IDEMPOTENCY_KEY_REQUIRED",
      });
      return;
    }

    const result = await upgradeStadiumLevel(
      getSessionId(req, res),
      idempotencyKey,
    );

    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/idle/stadium/seats/buy", async (req, res) => {
  try {
    const {
      quantity,
      idempotencyKey,
    } = req.body as {
      quantity?: unknown;
      idempotencyKey?: unknown;
    };

    if (
      typeof quantity !== "number"
      || !Number.isSafeInteger(quantity)
      || quantity <= 0
    ) {
      res.status(400).json({
        error: "INVALID_IDLE_SEAT_PURCHASE_QUANTITY",
      });
      return;
    }

    if (
      typeof idempotencyKey !== "string"
      || !IDEMPOTENCY_PATTERN.test(idempotencyKey)
    ) {
      res.status(400).json({
        error: "VALID_IDEMPOTENCY_KEY_REQUIRED",
      });
      return;
    }

    const result = await buyStadiumSeats(
      getSessionId(req, res),
      quantity,
      idempotencyKey,
    );

    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
