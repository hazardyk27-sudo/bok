import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
  type BlackjackRealtimeSource,
} from "./realtime";

class TestSource implements BlackjackRealtimeSource {
  private listeners = new Set<(snapshot: BlackjackPublicSnapshot) => void>();

  constructor(public snapshot: BlackjackPublicSnapshot) {}

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: BlackjackPublicSnapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(snapshot: BlackjackPublicSnapshot) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}

function snapshot(version: number): BlackjackPublicSnapshot {
  return {
    serverTimeMs: version,
    tableId: "main-blackjack",
    phase: "TABLE_IDLE",
    maxSeats: 5,
    seats: [
      { seatNumber: 1, playerId: null },
      { seatNumber: 2, playerId: null },
      { seatNumber: 3, playerId: null },
      { seatNumber: 4, playerId: null },
      { seatNumber: 5, playerId: null },
    ],
    players: [],
    shoe: {
      shoeId: "shoe-live",
      cardsRemaining: 312,
      reshufflePending: false,
    },
    round: null,
    stateVersion: version,
    eventSequence: version,
  };
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMessage = (raw: RawData) => {
      cleanup();
      try {
        resolve(JSON.parse(raw.toString()));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Blackjack test server did not bind a TCP port"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("blackjack WebSocket room foundation", () => {
  let runtime: BlackjackRealtimeRuntime | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  let client: WebSocket | undefined;

  afterEach(async () => {
    client?.terminate();
    runtime?.close();
    if (server?.listening) await closeServer(server);
    client = undefined;
    runtime = undefined;
    server = undefined;
  });

  it("sends an immediate authoritative snapshot on connection", async () => {
    const source = new TestSource(snapshot(1));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    const message = await nextMessage(client);

    expect(message).toEqual({
      type: "snapshot",
      snapshot: snapshot(1),
    });
    expect(runtime.connectionCount()).toBe(1);
  });

  it("broadcasts one-table snapshot updates to every connected client", async () => {
    const source = new TestSource(snapshot(1));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    const first = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    const second = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    client = first;

    await Promise.all([nextMessage(first), nextMessage(second)]);

    const firstUpdate = nextMessage(first);
    const secondUpdate = nextMessage(second);
    source.publish(snapshot(2));

    await expect(firstUpdate).resolves.toEqual({
      type: "snapshot",
      snapshot: snapshot(2),
    });
    await expect(secondUpdate).resolves.toEqual({
      type: "snapshot",
      snapshot: snapshot(2),
    });

    second.terminate();
  });

  it("supports explicit sync without permitting state mutation", async () => {
    const source = new TestSource(snapshot(3));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    await nextMessage(client);

    const synced = nextMessage(client);
    client.send(JSON.stringify({ type: "sync" }));
    await expect(synced).resolves.toEqual({
      type: "snapshot",
      snapshot: snapshot(3),
    });

    const rejected = nextMessage(client);
    client.send(JSON.stringify({ type: "HIT", handId: "h1" }));
    await expect(rejected).resolves.toEqual({
      type: "error",
      error: "BLACKJACK_ACTION_PROTOCOL_NOT_READY",
    });
  });

  it("returns a stable error if snapshot generation fails", async () => {
    const source: BlackjackRealtimeSource = {
      getSnapshot: () => {
        throw new Error("boom");
      },
      subscribe: () => () => undefined,
    };
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    const message = await nextMessage(client);

    expect(message).toEqual({
      type: "error",
      error: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
    });
  });
});
