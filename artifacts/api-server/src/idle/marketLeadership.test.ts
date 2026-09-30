import { describe, expect, it } from "vitest";
import {
  GlobalMarketWriterLeadership,
  IDLE_MARKET_ADVISORY_LOCK_KEY,
  IDLE_MARKET_ADVISORY_LOCK_NAMESPACE,
  type MarketLeadershipClient,
} from "./marketLeadership";

type SharedLock = {
  ownerId: string | null;
};

class FakeLeadershipClient {
  released = false;
  poisoned = false;
  failUnlock = false;
  private errorListener: ((error: Error) => void) | null = null;

  constructor(
    readonly id: string,
    private readonly sharedLock: SharedLock,
  ) {}

  async query(sql: string) {
    if (sql.includes("pg_try_advisory_lock")) {
      if (
        this.sharedLock.ownerId === null
        || this.sharedLock.ownerId === this.id
      ) {
        this.sharedLock.ownerId = this.id;
        return { rows: [{ acquired: true }] };
      }
      return { rows: [{ acquired: false }] };
    }

    if (sql.includes("pg_advisory_unlock")) {
      if (this.failUnlock) {
        throw new Error("unlock query failed");
      }

      const released = this.sharedLock.ownerId === this.id;
      if (released) this.sharedLock.ownerId = null;
      return { rows: [{ released }] };
    }

    throw new Error("UNEXPECTED_FAKE_SQL");
  }

  release(error?: Error | boolean) {
    this.released = true;
    this.poisoned = Boolean(error);
  }

  on(event: "error", listener: (error: Error) => void) {
    if (event === "error") this.errorListener = listener;
  }

  emitConnectionError(error = new Error("connection lost")) {
    if (this.sharedLock.ownerId === this.id) {
      this.sharedLock.ownerId = null;
    }
    this.errorListener?.(error);
  }
}

function asLeadershipClient(
  client: FakeLeadershipClient,
) {
  return client as unknown as MarketLeadershipClient;
}

describe("global market writer advisory leadership", () => {
  it("allows exactly one backend instance to own the global writer lock", async () => {
    const lock: SharedLock = { ownerId: null };
    const clientA = new FakeLeadershipClient("a", lock);
    const clientB = new FakeLeadershipClient("b", lock);

    const leaderA = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(clientA),
      now: () => new Date("2026-09-29T20:00:00.000Z"),
    });
    const leaderB = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(clientB),
    });

    await expect(leaderA.tryAcquire()).resolves.toBe(true);
    await expect(leaderB.tryAcquire()).resolves.toBe(false);

    expect(lock.ownerId).toBe("a");
    expect(leaderA.getSnapshot()).toEqual({
      isLeader: true,
      acquiredAt: "2026-09-29T20:00:00.000Z",
    });
    expect(leaderB.isLeader()).toBe(false);
    expect(clientB.released).toBe(true);
  });

  it("releases the exact advisory key and lets a follower take over", async () => {
    const lock: SharedLock = { ownerId: null };
    const clientA = new FakeLeadershipClient("a", lock);
    const clientB = new FakeLeadershipClient("b", lock);

    const leaderA = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(clientA),
    });
    const leaderB = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(clientB),
    });

    expect(IDLE_MARKET_ADVISORY_LOCK_NAMESPACE)
      .toBe(1_229_212_741);
    expect(IDLE_MARKET_ADVISORY_LOCK_KEY)
      .toBe(1_296_782_385);

    await leaderA.tryAcquire();
    await expect(leaderA.release()).resolves.toBe(true);

    expect(clientA.released).toBe(true);
    expect(lock.ownerId).toBeNull();

    await expect(leaderB.tryAcquire()).resolves.toBe(true);
    expect(lock.ownerId).toBe("b");
  });

  it("runs market writes only on the elected leader", async () => {
    const lock: SharedLock = { ownerId: null };
    const clientA = new FakeLeadershipClient("a", lock);
    const clientB = new FakeLeadershipClient("b", lock);
    let writes = 0;

    const leaderA = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(clientA),
    });
    const leaderB = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(clientB),
    });

    expect(await leaderA.runIfLeader(async () => {
      writes += 1;
      return "tick-a";
    })).toEqual({
      executed: true,
      value: "tick-a",
    });

    expect(await leaderB.runIfLeader(async () => {
      writes += 1;
      return "tick-b";
    })).toEqual({
      executed: false,
      value: null,
    });

    expect(writes).toBe(1);
  });

  it("keeps leadership across repeated 5-second iterations instead of racing for every tick", async () => {
    const lock: SharedLock = { ownerId: null };
    let connectCalls = 0;
    const client = new FakeLeadershipClient("a", lock);

    const leadership = new GlobalMarketWriterLeadership({
      connect: async () => {
        connectCalls += 1;
        return asLeadershipClient(client);
      },
    });

    await leadership.runIfLeader(async () => 1);
    await leadership.runIfLeader(async () => 2);
    await leadership.runIfLeader(async () => 3);

    expect(connectCalls).toBe(1);
    expect(leadership.isLeader()).toBe(true);
    expect(client.released).toBe(false);
  });

  it("serializes concurrent acquisition attempts inside one backend instance", async () => {
    const lock: SharedLock = { ownerId: null };
    let connectCalls = 0;
    const client = new FakeLeadershipClient("a", lock);

    const leadership = new GlobalMarketWriterLeadership({
      connect: async () => {
        connectCalls += 1;
        await Promise.resolve();
        return asLeadershipClient(client);
      },
    });

    const [first, second] = await Promise.all([
      leadership.tryAcquire(),
      leadership.tryAcquire(),
    ]);

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(connectCalls).toBe(1);
  });


  it("destroys the DB client if advisory unlock becomes uncertain", async () => {
    const lock: SharedLock = { ownerId: null };
    const client = new FakeLeadershipClient("a", lock);

    const leadership = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(client),
    });

    await leadership.tryAcquire();
    client.failUnlock = true;

    await expect(leadership.release())
      .rejects.toThrow("unlock query failed");

    expect(leadership.isLeader()).toBe(false);
    expect(client.released).toBe(true);
    expect(client.poisoned).toBe(true);
  });

  it("drops local leadership when the PostgreSQL session fails", async () => {
    const lock: SharedLock = { ownerId: null };
    const client = new FakeLeadershipClient("a", lock);

    const leadership = new GlobalMarketWriterLeadership({
      connect: async () => asLeadershipClient(client),
    });

    await leadership.tryAcquire();
    expect(leadership.isLeader()).toBe(true);

    client.emitConnectionError();

    expect(leadership.isLeader()).toBe(false);
    expect(lock.ownerId).toBeNull();
    expect(client.released).toBe(true);
    expect(client.poisoned).toBe(true);
  });
});
