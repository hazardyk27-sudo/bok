import type { PoolClient } from "@workspace/db";

/**
 * Stable two-int PostgreSQL advisory-lock key for the single global Idle
 * ticket-market writer.
 *
 * Session advisory locks are intentional: the elected writer keeps one
 * dedicated pool client checked out for the duration of leadership. PostgreSQL
 * releases the lock automatically if that DB session disappears.
 */
export const IDLE_MARKET_ADVISORY_LOCK_NAMESPACE = 1_229_212_741;
export const IDLE_MARKET_ADVISORY_LOCK_KEY = 1_296_782_385;

export type MarketLeadershipClient = Pick<
  PoolClient,
  "query" | "release"
> & {
  on?: (
    event: "error",
    listener: (error: Error) => void,
  ) => unknown;
};

export type MarketLeadershipSnapshot = {
  isLeader: boolean;
  acquiredAt: string | null;
};

export type MarketLeadershipOptions = {
  connect: () => Promise<MarketLeadershipClient>;
  now?: () => Date;
};

type TryLockRow = {
  acquired: boolean;
};

type UnlockRow = {
  released: boolean;
};

/**
 * Owns the DB session that holds the global market-writer advisory lock.
 *
 * Followers do not retain a DB connection after a failed try-lock. The leader
 * keeps exactly one checked-out client until explicit release or a connection
 * error. A DB/session failure therefore cannot leave a durable orphan lock.
 */
export class GlobalMarketWriterLeadership {
  private readonly connect:
    () => Promise<MarketLeadershipClient>;
  private readonly now: () => Date;

  private leaderClient: MarketLeadershipClient | null = null;
  private acquiredAt: Date | null = null;
  private acquireInFlight:
    Promise<boolean> | null = null;

  constructor(options: MarketLeadershipOptions = {}) {
    this.connect = options.connect;
    this.now = options.now ?? (() => new Date());
  }

  getSnapshot(): MarketLeadershipSnapshot {
    return {
      isLeader: this.leaderClient !== null,
      acquiredAt:
        this.acquiredAt?.toISOString() ?? null,
    };
  }

  isLeader() {
    return this.leaderClient !== null;
  }

  /**
   * Non-blocking election attempt.
   *
   * pg_try_advisory_lock(...) returns immediately. Exactly one PostgreSQL
   * session can hold this key; a follower releases its temporary pool client
   * as soon as it learns that another instance already owns leadership.
   */
  async tryAcquire() {
    if (this.leaderClient) return true;
    if (this.acquireInFlight) return this.acquireInFlight;

    const attempt = this.tryAcquireInternal();
    this.acquireInFlight = attempt;

    try {
      return await attempt;
    } finally {
      if (this.acquireInFlight === attempt) {
        this.acquireInFlight = null;
      }
    }
  }

  private async tryAcquireInternal() {
    const client = await this.connect();

    try {
      const result = await client.query<TryLockRow>(
        `SELECT pg_try_advisory_lock(
           $1::integer,
           $2::integer
         ) AS acquired`,
        [
          IDLE_MARKET_ADVISORY_LOCK_NAMESPACE,
          IDLE_MARKET_ADVISORY_LOCK_KEY,
        ],
      );

      const acquired =
        result.rows[0]?.acquired === true;

      if (!acquired) {
        client.release();
        return false;
      }

      this.leaderClient = client;
      this.acquiredAt = this.now();

      client.on?.("error", (error) => {
        if (this.leaderClient !== client) return;

        // The PostgreSQL session is no longer trustworthy. Server-side session
        // termination releases its advisory locks automatically.
        this.leaderClient = null;
        this.acquiredAt = null;

        try {
          client.release(error);
        } catch {
          // The broken client may already have been removed from the pool.
        }
      });

      return true;
    } catch (error) {
      try {
        client.release(
          error instanceof Error
            ? error
            : new Error("IDLE_MARKET_LEADER_ACQUIRE_FAILED"),
        );
      } catch {
        // Preserve the original acquisition error.
      }
      throw error;
    }
  }

  /**
   * Releases leadership on the SAME DB session that acquired it.
   *
   * A false pg_advisory_unlock result means the local process believed it was
   * leader but PostgreSQL no longer associated the key with this session; the
   * local leadership state is still cleared before returning.
   */
  async release() {
    const client = this.leaderClient;
    if (!client) return false;

    this.leaderClient = null;
    this.acquiredAt = null;

    try {
      const result = await client.query<UnlockRow>(
        `SELECT pg_advisory_unlock(
           $1::integer,
           $2::integer
         ) AS released`,
        [
          IDLE_MARKET_ADVISORY_LOCK_NAMESPACE,
          IDLE_MARKET_ADVISORY_LOCK_KEY,
        ],
      );

      return result.rows[0]?.released === true;
    } finally {
      client.release();
    }
  }

  /**
   * Convenience guard for a single market-writer iteration.
   *
   * The callback is never executed by followers. Leadership remains held after
   * the callback so subsequent 5-second ticks reuse the same elected DB session
   * rather than creating a race at every tick.
   */
  async runIfLeader<T>(
    write: () => Promise<T>,
  ): Promise<
    | { executed: false; value: null }
    | { executed: true; value: T }
  > {
    const acquired = await this.tryAcquire();
    if (!acquired) {
      return {
        executed: false,
        value: null,
      };
    }

    return {
      executed: true,
      value: await write(),
    };
  }
}
