import {
  MARKET_CONFIG,
} from "../../../cascade-8/src/idle/config";
import type {
  TicketMarketSnapshot,
} from "../../../cascade-8/src/idle/types";
import {
  calculateNextTicketPriceFromBtcMove,
} from "./marketMath";
import type {
  MarketFeedSelection,
} from "./marketFeedCoordinator";
import type {
  MarketFeedSnapshotLike,
} from "./marketFeedHealth";
import type {
  AuthoritativeMarketTickInput,
} from "./marketPersistencePolicy";
import type {
  MarketLeadershipClient,
} from "./marketLeadership";

export type RuntimePersistedMarketState = {
  priceMicrodollars: number;
  source: "binance-btcusdt" | "coinbase-btc-usd" | "none";
  feedStatus:
    | "CONNECTING"
    | "REBASELINING"
    | "LIVE"
    | "STALE"
    | "FROZEN";
  tickAt: Date;
};

export type RuntimeMarketHistoryPoint = {
  priceMicrodollars: number;
  source: "binance-btcusdt" | "coinbase-btc-usd" | "none";
  tickAt: Date;
};

export type RuntimeMarketFeed = {
  start(): void;
  stop(): void;
  getSnapshot(): MarketFeedSnapshotLike;
};

export type RuntimeMarketFeedCoordinator = {
  select(input: {
    binance: MarketFeedSnapshotLike;
    coinbase: MarketFeedSnapshotLike;
    nowMs: number;
  }): MarketFeedSelection;
  reset(): void;
};

export type RuntimeMarketLeadershipClient =
  MarketLeadershipClient;

export type RuntimeMarketPersistenceClient = Pick<
  RuntimeMarketLeadershipClient,
  "query"
>;

export type RuntimeMarketPersistence = {
  ensureCurrentState(
    serverNow?: Date,
  ): Promise<RuntimePersistedMarketState>;
  getCurrentState(): Promise<RuntimePersistedMarketState | null>;
  getCurrentStateOnClient(
    client: RuntimeMarketPersistenceClient,
  ): Promise<RuntimePersistedMarketState | null>;
  getHistory(
    asOf?: Date,
  ): Promise<RuntimeMarketHistoryPoint[]>;
  persistAuthoritativeTickOnClient(
    client: RuntimeMarketPersistenceClient,
    tick: AuthoritativeMarketTickInput,
  ): Promise<{
    state: RuntimePersistedMarketState;
  }>;
};

export type RuntimeMarketLeadership = {
  runIfLeader<T>(
    write: (
      client: RuntimeMarketLeadershipClient,
    ) => Promise<T>,
  ): Promise<
    | { executed: false; value: null }
    | { executed: true; value: T }
  >;
  release(): Promise<boolean>;
};

export type TicketMarketRuntimeOptions = {
  binance: RuntimeMarketFeed;
  coinbase: RuntimeMarketFeed;
  coordinator: RuntimeMarketFeedCoordinator;
  persistence: RuntimeMarketPersistence;
  leadership: RuntimeMarketLeadership;
  now?: () => Date;
  tickMs?: number;
  setTimeoutFn?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (
    handle: ReturnType<typeof setTimeout>,
  ) => void;
  onError?: (error: unknown) => void;
};

export type TicketMarketSnapshotListener = (
  snapshot: TicketMarketSnapshot,
) => void;

export function alignMarketTickTime(
  value: Date,
  tickMs = MARKET_CONFIG.tickMs,
) {
  const time = value.getTime();

  if (
    !Number.isFinite(time)
    || !Number.isSafeInteger(tickMs)
    || tickMs <= 0
  ) {
    throw new Error("INVALID_IDLE_MARKET_RUNTIME_CLOCK");
  }

  return new Date(
    Math.floor(time / tickMs) * tickMs,
  );
}

export function getDelayUntilNextMarketTick(
  value: Date,
  tickMs = MARKET_CONFIG.tickMs,
) {
  const time = value.getTime();

  if (
    !Number.isFinite(time)
    || !Number.isSafeInteger(tickMs)
    || tickMs <= 0
  ) {
    throw new Error("INVALID_IDLE_MARKET_RUNTIME_CLOCK");
  }

  const remainder = ((time % tickMs) + tickMs) % tickMs;
  return remainder === 0
    ? tickMs
    : tickMs - remainder;
}

function toSnapshot(
  state: RuntimePersistedMarketState,
): TicketMarketSnapshot {
  return {
    priceMicrodollars: state.priceMicrodollars,
    tickAt: state.tickAt.toISOString(),
    source: state.source,
    feedStatus: state.feedStatus,
  };
}

function snapshotsEqual(
  left: TicketMarketSnapshot | null,
  right: TicketMarketSnapshot,
) {
  return (
    left !== null
    && left.priceMicrodollars === right.priceMicrodollars
    && left.tickAt === right.tickAt
    && left.source === right.source
    && left.feedStatus === right.feedStatus
  );
}

/**
 * Coordinates the global 5-second ticket market on every backend instance.
 *
 * All instances keep both BTC feeds warm so a follower can take over quickly,
 * but only the Part 18 advisory-lock leader computes/persists a market tick.
 * Followers poll the persisted singleton each local 5-second cycle and publish
 * changes to their own connected SSE clients.
 *
 * A restart, leadership takeover, provider switch, reconnect epoch, or full
 * outage always clears the process-local BTC baseline. The first healthy quote
 * after that boundary is persisted as REBASELINING without changing the ticket
 * price; BTC-linked price movement resumes on the following authoritative tick.
 */
export class TicketMarketRuntime {
  private readonly binance: RuntimeMarketFeed;
  private readonly coinbase: RuntimeMarketFeed;
  private readonly coordinator: RuntimeMarketFeedCoordinator;
  private readonly persistence: RuntimeMarketPersistence;
  private readonly leadership: RuntimeMarketLeadership;
  private readonly now: () => Date;
  private readonly tickMs: number;
  private readonly setTimeoutFn:
    NonNullable<TicketMarketRuntimeOptions["setTimeoutFn"]>;
  private readonly clearTimeoutFn:
    NonNullable<TicketMarketRuntimeOptions["clearTimeoutFn"]>;
  private readonly onError?: (error: unknown) => void;

  private running = false;
  private startInFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private previousBtcQuoteMicrodollars: number | null = null;
  private currentSnapshot: TicketMarketSnapshot | null = null;
  private readonly listeners =
    new Set<TicketMarketSnapshotListener>();

  constructor(options: TicketMarketRuntimeOptions) {
    this.binance = options.binance;
    this.coinbase = options.coinbase;
    this.coordinator = options.coordinator;
    this.persistence = options.persistence;
    this.leadership = options.leadership;
    this.now = options.now ?? (() => new Date());
    this.tickMs = options.tickMs ?? MARKET_CONFIG.tickMs;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
    this.onError = options.onError;

    if (!Number.isSafeInteger(this.tickMs) || this.tickMs <= 0) {
      throw new Error("INVALID_IDLE_MARKET_RUNTIME_TICK_MS");
    }
  }

  isRunning() {
    return this.running;
  }

  getCurrentSnapshot() {
    return this.currentSnapshot
      ? { ...this.currentSnapshot }
      : null;
  }

  subscribe(
    listener: TicketMarketSnapshotListener,
    emitCurrent = true,
  ) {
    this.listeners.add(listener);

    if (emitCurrent && this.currentSnapshot) {
      listener({ ...this.currentSnapshot });
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  async start() {
    if (this.running) return;
    if (this.startInFlight) return this.startInFlight;

    const startPromise = this.startInternal();
    this.startInFlight = startPromise;

    try {
      await startPromise;
    } finally {
      if (this.startInFlight === startPromise) {
        this.startInFlight = null;
      }
    }
  }

  private async startInternal() {
    const bootstrapAt = alignMarketTickTime(
      this.now(),
      this.tickMs,
    );
    const restored =
      await this.persistence.ensureCurrentState(
        bootstrapAt,
      );

    this.running = true;
    this.previousBtcQuoteMicrodollars = null;
    this.coordinator.reset();
    this.publishState(restored);

    this.binance.start();
    this.coinbase.start();
    this.scheduleNextTick();
  }

  async stop() {
    if (!this.running && !this.startInFlight) return;

    this.running = false;

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.binance.stop();
    this.coinbase.stop();
    this.previousBtcQuoteMicrodollars = null;
    this.coordinator.reset();

    await this.leadership.release();
  }

  async runOneTick(
    tickAt = alignMarketTickTime(
      this.now(),
      this.tickMs,
    ),
  ) {
    const safeTickAt = alignMarketTickTime(
      tickAt,
      this.tickMs,
    );

    try {
      const result = await this.leadership.runIfLeader(
        async (client) => {
          const persistedCurrent =
            await this.persistence.getCurrentStateOnClient(
              client,
            );

          if (!persistedCurrent) {
            throw new Error("IDLE_MARKET_STATE_MISSING");
          }

          if (
            persistedCurrent.tickAt.getTime()
            >= safeTickAt.getTime()
          ) {
            this.publishState(persistedCurrent);
            return persistedCurrent;
          }

          const selection = this.coordinator.select({
            binance: this.binance.getSnapshot(),
            coinbase: this.coinbase.getSnapshot(),
            nowMs: safeTickAt.getTime(),
          });

          let nextPriceMicrodollars =
            persistedCurrent.priceMicrodollars;
          let nextSource = selection.source;
          let nextFeedStatus = selection.feedStatus;

          if (
            selection.priceMicrodollars === null
            || selection.source === "none"
          ) {
            this.previousBtcQuoteMicrodollars = null;
            nextSource = "none";
            nextFeedStatus = "FROZEN";
          } else if (
            selection.shouldRebaselineBtc
            || this.previousBtcQuoteMicrodollars === null
          ) {
            this.previousBtcQuoteMicrodollars =
              selection.priceMicrodollars;
            nextFeedStatus = "REBASELINING";
          } else {
            const move =
              calculateNextTicketPriceFromBtcMove({
                previousTicketPriceMicrodollars:
                  persistedCurrent.priceMicrodollars,
                previousBtcQuoteUnits:
                  this.previousBtcQuoteMicrodollars,
                currentBtcQuoteUnits:
                  selection.priceMicrodollars,
              });

            nextPriceMicrodollars =
              move.ticketPriceMicrodollars;
            this.previousBtcQuoteMicrodollars =
              selection.priceMicrodollars;
            nextFeedStatus = "LIVE";
          }

          const persisted =
            await this.persistence.persistAuthoritativeTickOnClient(
              client,
              {
                priceMicrodollars:
                  nextPriceMicrodollars,
                source: nextSource,
                feedStatus: nextFeedStatus,
                tickAt: safeTickAt,
              },
            );

          this.publishState(persisted.state);
          return persisted.state;
        },
      );

      if (!result.executed) {
        this.previousBtcQuoteMicrodollars = null;
        this.coordinator.reset();
        await this.syncFromPersistence();
      }

      return result;
    } catch (error) {
      this.previousBtcQuoteMicrodollars = null;
      this.coordinator.reset();

      try {
        await this.syncFromPersistence();
      } catch {
        // Preserve the original tick failure.
      }

      throw error;
    }
  }

  async syncFromPersistence() {
    const state =
      await this.persistence.getCurrentState();

    if (state) {
      this.publishState(state);
    }

    return state;
  }

  async getHistory(asOf = this.now()) {
    return this.persistence.getHistory(asOf);
  }

  private publishState(
    state: RuntimePersistedMarketState,
  ) {
    const snapshot = toSnapshot(state);

    if (
      snapshotsEqual(
        this.currentSnapshot,
        snapshot,
      )
    ) {
      return;
    }

    this.currentSnapshot = snapshot;

    for (const listener of this.listeners) {
      listener({ ...snapshot });
    }
  }

  private scheduleNextTick() {
    if (!this.running || this.timer !== null) return;

    const delayMs = getDelayUntilNextMarketTick(
      this.now(),
      this.tickMs,
    );

    this.timer = this.setTimeoutFn(() => {
      this.timer = null;

      if (!this.running) return;

      void this.runOneTick().catch((error) => {
        this.onError?.(error);
      }).finally(() => {
        this.scheduleNextTick();
      });
    }, delayMs);
  }
}
