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

class MultiClientSource implements BlackjackRealtimeSource {
  private listeners = new Set<(snapshot: BlackjackPublicSnapshot) => void>();

  constructor(private current: BlackjackPublicSnapshot) {}

  getSnapshot() {
    return this.current;
  }

  subscribe(listener: (snapshot: BlackjackPublicSnapshot) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(snapshot: BlackjackPublicSnapshot) {
    this.current = snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }

  advanceWithoutBroadcast(snapshot: BlackjackPublicSnapshot) {
    this.current = snapshot;
  }
}

function snapshot(version: number): BlackjackPublicSnapshot {
  return {
    serverTimeMs: version * 100,
    tableId: "main-blackjack",
    phase: version % 2 === 0 ? "BETTING" : "TABLE_IDLE",
    maxSeats: 5,
    seats: [
      { seatNumber: 1, playerId: version >= 2 ? "player-1" : null },
      { seatNumber: 2, playerId: version >= 3 ? "player-2" : null },
      { seatNumber: 3, playerId: null },
      { seatNumber: 4, playerId: null },
      { seatNumber: 5, playerId: null },
    ],
    players: [
      ...(version >= 2
        ? [
            {
              playerId: "player-1",
              seatNumber: 1 as const,
              status: "BETTING" as const,
              connected: true,
            },
          ]
        : []),
      ...(version >= 3
        ? [
            {
              playerId: "player-2",
              seatNumber: 2 as const,
              status: "BETTING" as const,
              connected: true,
            },
          ]
        : []),
    ],
    shoe: {
      shoeId: "shared-shoe",
      cardsRemaining: 312 - version,
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
        reject(new Error("Blackjack sync test server did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("blackjack two-client authoritative synchronization proof", () => {
  let server: ReturnType<typeof createServer> | undefined;
  let runtime: BlackjackRealtimeRuntime | undefined;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    for (const client of clients) client.terminate();
    clients.length = 0;
    runtime?.close();
    if (server?.listening) await closeServer(server);
    runtime = undefined;
    server = undefined;
  });

  it("keeps two real WebSocket clients byte-equivalent across 50 broadcasts", async () => {
    const source = new MultiClientSource(snapshot(1));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    const first = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    const second = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    clients.push(first, second);

    const [firstInitial, secondInitial] = await Promise.all([
      nextMessage(first),
      nextMessage(second),
    ]);

    expect(firstInitial).toEqual(secondInitial);
    expect(firstInitial).toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: snapshot(1),
      resetEventSequenceTo: 1,
      resetStateVersionTo: 1,
    });

    for (let version = 2; version <= 51; version += 1) {
      const firstMessage = nextMessage(first);
      const secondMessage = nextMessage(second);
      const authoritative = snapshot(version);

      source.publish(authoritative);

      const [left, right] = await Promise.all([
        firstMessage,
        secondMessage,
      ]);

      expect(left).toEqual(right);
      expect(left).toEqual({
        type: "snapshot",
        snapshot: authoritative,
      });
    }

    expect(runtime.connectionCount()).toBe(2);
  });

  it("converges two stale clients to the exact same full snapshot after missed server events", async () => {
    const source = new MultiClientSource(snapshot(10));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    const first = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    const second = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    clients.push(first, second);

    await Promise.all([nextMessage(first), nextMessage(second)]);

    source.advanceWithoutBroadcast(snapshot(14));

    const firstSync = nextMessage(first);
    const secondSync = nextMessage(second);

    const staleRequest = JSON.stringify({
      type: "sync",
      lastEventSequence: 10,
      lastStateVersion: 10,
    });
    first.send(staleRequest);
    second.send(staleRequest);

    const [left, right] = await Promise.all([firstSync, secondSync]);

    expect(left).toEqual(right);
    expect(left).toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EVENT_GAP",
      snapshot: snapshot(14),
      resetEventSequenceTo: 14,
      resetStateVersionTo: 14,
    });

    const firstUpdate = nextMessage(first);
    const secondUpdate = nextMessage(second);
    source.publish(snapshot(15));

    await expect(firstUpdate).resolves.toEqual({
      type: "snapshot",
      snapshot: snapshot(15),
    });
    await expect(secondUpdate).resolves.toEqual({
      type: "snapshot",
      snapshot: snapshot(15),
    });
  });

  it("returns identical SYNC_OK cursors to both already-current clients", async () => {
    const source = new MultiClientSource(snapshot(20));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    const first = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    const second = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    clients.push(first, second);

    await Promise.all([nextMessage(first), nextMessage(second)]);

    const request = JSON.stringify({
      type: "sync",
      lastEventSequence: 20,
      lastStateVersion: 20,
    });

    const firstSync = nextMessage(first);
    const secondSync = nextMessage(second);
    first.send(request);
    second.send(request);

    const [left, right] = await Promise.all([firstSync, secondSync]);

    expect(left).toEqual(right);
    expect(left).toEqual({
      type: "SYNC_OK",
      eventSequence: 20,
      stateVersion: 20,
    });
  });
});
