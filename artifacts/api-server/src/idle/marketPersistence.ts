import { randomUUID } from "node:crypto";
import {
  pool,
  type PoolClient,
} from "@workspace/db";
import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";
import type {
  TicketMarketFeedStatus,
  TicketMarketSource,
} from "../../../cascade-8/src/idle/types";
import {
  MAX_MARKET_HISTORY_ROWS,
  type AuthoritativeMarketTickInput,
  getMarketHistoryRetentionCutoff,
  isSameAuthoritativeMarketTick,
  validateAuthoritativeMarketTick,
} from "./marketPersistencePolicy";

export const GLOBAL_TICKET_MARKET_STATE_ID = "global";

type MarketStateRow = {
  price_microdollars: number;
  source: string;
  feed_status: string;
  tick_at: Date;
};

type MarketTickRow = {
  price_microdollars: number;
  source: string;
  tick_at: Date;
};

export type PersistedTicketMarketState = {
  priceMicrodollars: number;
  source: TicketMarketSource;
  feedStatus: TicketMarketFeedStatus;
  tickAt: Date;
};

export type PersistedTicketMarketHistoryPoint = {
  priceMicrodollars: number;
  source: TicketMarketSource;
  tickAt: Date;
};

export type PersistAuthoritativeMarketTickResult = {
  state: PersistedTicketMarketState;
  replayedHistoryTick: boolean;
  deletedHistoryRows: number;
};

function parseSource(value: string) {
  if (
    value !== "binance-btcusdt"
    && value !== "coinbase-btc-usd"
    && value !== "none"
  ) {
    throw new Error("INVALID_IDLE_MARKET_SOURCE");
  }
  return value as TicketMarketSource;
}

function parseFeedStatus(value: string) {
  if (
    value !== "CONNECTING"
    && value !== "REBASELINING"
    && value !== "LIVE"
    && value !== "STALE"
    && value !== "FROZEN"
  ) {
    throw new Error("INVALID_IDLE_MARKET_FEED_STATUS");
  }
  return value as TicketMarketFeedStatus;
}

function stateRowToState(
  row: MarketStateRow,
): PersistedTicketMarketState {
  return validateAuthoritativeMarketTick({
    priceMicrodollars: Number(row.price_microdollars),
    source: parseSource(row.source),
    feedStatus: parseFeedStatus(row.feed_status),
    tickAt: new Date(row.tick_at),
  });
}

function tickRowToPoint(
  row: MarketTickRow,
): PersistedTicketMarketHistoryPoint {
  const source = parseSource(row.source);
  const priceMicrodollars = Number(row.price_microdollars);
  const tickAt = new Date(row.tick_at);

  if (
    !Number.isSafeInteger(priceMicrodollars)
    || priceMicrodollars
      < MARKET_CONFIG.minTicketPriceMicrodollars
    || priceMicrodollars
      > MARKET_CONFIG.maxTicketPriceMicrodollars
    || !Number.isFinite(tickAt.getTime())
  ) {
    throw new Error("INVALID_IDLE_MARKET_HISTORY_ROW");
  }

  return {
    priceMicrodollars,
    source,
    tickAt,
  };
}

async function loadStateForUpdate(
  client: PoolClient,
) {
  const result = await client.query<MarketStateRow>(
    `SELECT price_microdollars, source, feed_status, tick_at
       FROM idle_ticket_market_state
      WHERE id = $1
      FOR UPDATE`,
    [GLOBAL_TICKET_MARKET_STATE_ID],
  );

  return result.rows[0]
    ? stateRowToState(result.rows[0])
    : null;
}

async function loadHistoryTickAt(
  client: PoolClient,
  tickAt: Date,
) {
  const result = await client.query<MarketTickRow>(
    `SELECT price_microdollars, source, tick_at
       FROM idle_ticket_market_ticks
      WHERE tick_at = $1`,
    [tickAt],
  );

  return result.rows[0]
    ? tickRowToPoint(result.rows[0])
    : null;
}

export class TicketMarketPersistence {
  /**
   * Restores the persisted global state after restart. The $4 bootstrap is
   * inserted only when the singleton row has never existed; an existing market
   * price is never reset on process startup.
   */
  async ensureCurrentState(
    serverNow = new Date(),
  ): Promise<PersistedTicketMarketState> {
    const bootstrap = validateAuthoritativeMarketTick({
      priceMicrodollars:
        MARKET_CONFIG.initialTicketPriceMicrodollars,
      source: "none",
      feedStatus: "FROZEN",
      tickAt: serverNow,
    });

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO idle_ticket_market_state
           (id, price_microdollars, source, feed_status, tick_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [
          GLOBAL_TICKET_MARKET_STATE_ID,
          bootstrap.priceMicrodollars,
          bootstrap.source,
          bootstrap.feedStatus,
          bootstrap.tickAt,
        ],
      );

      const state = await loadStateForUpdate(client);
      if (!state) {
        throw new Error("IDLE_MARKET_STATE_MISSING");
      }

      await client.query("COMMIT");
      return state;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getCurrentState() {
    const result = await pool.query<MarketStateRow>(
      `SELECT price_microdollars, source, feed_status, tick_at
         FROM idle_ticket_market_state
        WHERE id = $1`,
      [GLOBAL_TICKET_MARKET_STATE_ID],
    );

    return result.rows[0]
      ? stateRowToState(result.rows[0])
      : null;
  }

  /**
   * Persists one authoritative 5-second market point atomically:
   * 1) lock current singleton state,
   * 2) enforce monotonic tick time / exact replay semantics,
   * 3) insert immutable raw history,
   * 4) replace the singleton current state,
   * 5) delete points at or before the strict 24-hour cutoff,
   * 6) commit.
   */
  async persistAuthoritativeTick(
    rawInput: AuthoritativeMarketTickInput,
  ): Promise<PersistAuthoritativeMarketTickResult> {
    const input = validateAuthoritativeMarketTick(rawInput);
    const retentionCutoff =
      getMarketHistoryRetentionCutoff(input.tickAt);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const current = await loadStateForUpdate(client);

      if (
        current
        && current.tickAt.getTime() > input.tickAt.getTime()
      ) {
        throw new Error("IDLE_MARKET_OUT_OF_ORDER_TICK");
      }

      if (
        current
        && current.tickAt.getTime() === input.tickAt.getTime()
        && !isSameAuthoritativeMarketTick(current, input)
      ) {
        throw new Error("IDLE_MARKET_TICK_CONFLICT");
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO idle_ticket_market_ticks
           (id, price_microdollars, source, tick_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tick_at) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          input.priceMicrodollars,
          input.source,
          input.tickAt,
        ],
      );

      const replayedHistoryTick = !inserted.rows[0];

      if (replayedHistoryTick) {
        const existingHistory = await loadHistoryTickAt(
          client,
          input.tickAt,
        );

        if (
          !existingHistory
          || existingHistory.priceMicrodollars
            !== input.priceMicrodollars
          || existingHistory.source !== input.source
        ) {
          throw new Error("IDLE_MARKET_TICK_CONFLICT");
        }
      }

      await client.query(
        `INSERT INTO idle_ticket_market_state
           (id, price_microdollars, source, feed_status, tick_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (id) DO UPDATE
         SET price_microdollars = EXCLUDED.price_microdollars,
             source = EXCLUDED.source,
             feed_status = EXCLUDED.feed_status,
             tick_at = EXCLUDED.tick_at,
             updated_at = now()`,
        [
          GLOBAL_TICKET_MARKET_STATE_ID,
          input.priceMicrodollars,
          input.source,
          input.feedStatus,
          input.tickAt,
        ],
      );

      const deleted = await client.query(
        `DELETE FROM idle_ticket_market_ticks
          WHERE tick_at <= $1`,
        [retentionCutoff],
      );

      await client.query("COMMIT");

      return {
        state: {
          ...input,
          tickAt: new Date(input.tickAt.getTime()),
        },
        replayedHistoryTick,
        deletedHistoryRows: deleted.rowCount ?? 0,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Returns only the strict trailing 24-hour raw window. At the canonical
   * 5-second cadence the LIMIT is exactly 17,280 rows.
   */
  async getHistory(
    asOf = new Date(),
  ): Promise<PersistedTicketMarketHistoryPoint[]> {
    const cutoff = getMarketHistoryRetentionCutoff(asOf);

    const result = await pool.query<MarketTickRow>(
      `SELECT price_microdollars, source, tick_at
         FROM idle_ticket_market_ticks
        WHERE tick_at > $1
          AND tick_at <= $2
        ORDER BY tick_at ASC
        LIMIT $3`,
      [
        cutoff,
        asOf,
        MAX_MARKET_HISTORY_ROWS,
      ],
    );

    return result.rows.map(tickRowToPoint);
  }
}

export const ticketMarketPersistence =
  new TicketMarketPersistence();
