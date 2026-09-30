import { createHash, randomUUID } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { SHARED_WALLET_TABLE } from "../platform/wallet";
import { ticketMarketPersistence } from "./marketPersistence";
import { ticketMarketRuntime } from "./marketRuntimeDb";
import { buyStadiumSeats } from "./seatPurchase";
import { sellStadiumTickets } from "./ticketSale";
import { upgradeStadiumSpeed } from "./speedUpgrade";
import { upgradeStadiumStorage } from "./storageUpgrade";
import { upgradeStadiumLevel } from "./stadiumUpgrade";
import { getIdleStadiumState } from "./stadiumState";
import { ensureIdleRuntimeSchema } from "./runtimeSchema";

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
const LEGACY_SESSION_COOKIE = "roulette_session";
const AUTH_COOKIE = "fy_auth";
const SESSION_ID_PATTERN = /^[a-f0-9-]{20,80}$/;

function readRawCookieValues(req: Request, name: string) {
  const header = req.headers.cookie;
  if (!header) return [] as string[];

  const values: string[] = [];
  const seen = new Set<string>();

  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0) continue;
    if (trimmed.slice(0, equalsAt) !== name) continue;

    const raw = trimmed.slice(equalsAt + 1);
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // Keep raw value and validate below.
    }

    if (!SESSION_ID_PATTERN.test(value) || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }

  return values;
}

function readRawCookie(req: Request, name: string) {
  const direct = req.cookies?.[name];
  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  const header = req.headers.cookie;
  if (!header) return null;

  for (const segment of header.split(";")) {
    const trimmed = segment.trim();
    const equalsAt = trimmed.indexOf("=");
    if (equalsAt <= 0 || trimmed.slice(0, equalsAt) !== name) continue;

    const raw = trimmed.slice(equalsAt + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  return null;
}

async function resolveAuthenticatedWalletSessionId(req: Request) {
  if (String(SHARED_WALLET_TABLE) !== "shared_wallets") {
    return null;
  }

  const token = readRawCookie(req, AUTH_COOKIE);
  if (!token) return null;

  try {
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    const result = await pool.query<{
      wallet_session_id: string;
    }>(
      `SELECT u.wallet_session_id
         FROM auth_sessions s
         JOIN users u
           ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
        LIMIT 1`,
      [tokenHash],
    );

    const sessionId = result.rows[0]?.wallet_session_id;
    return sessionId && SESSION_ID_PATTERN.test(sessionId)
      ? sessionId
      : null;
  } catch {
    // feature/idle intentionally supports older shared snapshots where auth
    // tables may not exist yet. Fall back to cookie candidates there.
    return null;
  }
}

async function resolveCookieSessionId(req: Request) {
  const candidates = [
    ...readRawCookieValues(req, SESSION_COOKIE),
  ];

  if (SESSION_COOKIE !== LEGACY_SESSION_COOKIE) {
    for (const sessionId of readRawCookieValues(
      req,
      LEGACY_SESSION_COOKIE,
    )) {
      if (!candidates.includes(sessionId)) {
        candidates.push(sessionId);
      }
    }
  }

  const parsedCookie = req.cookies?.[SESSION_COOKIE];
  if (
    typeof parsedCookie === "string"
    && SESSION_ID_PATTERN.test(parsedCookie)
    && !candidates.includes(parsedCookie)
  ) {
    candidates.push(parsedCookie);
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!;

  try {
    const result = await pool.query<{
      session_id: string;
      balance_cents: number | string;
    }>(
      `SELECT session_id, balance_cents
         FROM ${SHARED_WALLET_TABLE}
        WHERE session_id = ANY($1::text[])`,
      [candidates],
    );

    const balances = new Map(
      result.rows.map((row) => [
        row.session_id,
        Number(row.balance_cents),
      ]),
    );

    let winner: string | null = null;
    let winnerBalance = Number.NEGATIVE_INFINITY;

    candidates.forEach((sessionId) => {
      const balance = balances.get(sessionId);
      if (balance === undefined) return;
      if (balance >= winnerBalance) {
        winner = sessionId;
        winnerBalance = balance;
      }
    });

    return winner ?? candidates.at(-1) ?? null;
  } catch {
    return candidates.at(-1) ?? null;
  }
}

function persistSessionCookie(res: Response, sessionId: string) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 365,
  });
}

async function getSessionId(req: Request, res: Response) {
  const sessionId =
    await resolveCookieSessionId(req)
    ?? await resolveAuthenticatedWalletSessionId(req)
    ?? randomUUID();

  persistSessionCookie(res, sessionId);
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

router.use(async (_req, res, next) => {
  try {
    await ensureIdleRuntimeSchema();
    next();
  } catch {
    res.status(503).json({
      error: "IDLE_RUNTIME_SCHEMA_UNAVAILABLE",
    });
  }
});

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
    const sessionId = await getSessionId(req, res);
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
      await getSessionId(req, res),
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
      await getSessionId(req, res),
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
      await getSessionId(req, res),
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
      await getSessionId(req, res),
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
      await getSessionId(req, res),
      quantity,
      idempotencyKey,
    );

    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
