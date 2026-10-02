import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
  BLACKJACK_WS_CLOSE_SNAPSHOT_UNAVAILABLE,
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

function nextClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once("close", (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });
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
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: snapshot(1),
      resetEventSequenceTo: 1,
      resetStateVersionTo: 1,
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
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EXPLICIT_SYNC",
      snapshot: snapshot(3),
      resetEventSequenceTo: 3,
      resetStateVersionTo: 3,
    });

    const rejected = nextMessage(client);
    client.send(JSON.stringify({ type: "HIT", handId: "h1" }));
    await expect(rejected).resolves.toEqual({
      type: "error",
      error: "BLACKJACK_ACTION_PROTOCOL_NOT_READY",
    });
  });

  it("returns SYNC_OK when client cursors exactly match the authoritative snapshot", async () => {
    const source = new TestSource(snapshot(4));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    await nextMessage(client);

    const synced = nextMessage(client);
    client.send(
      JSON.stringify({
        type: "sync",
        lastEventSequence: 4,
        lastStateVersion: 4,
      }),
    );

    await expect(synced).resolves.toEqual({
      type: "SYNC_OK",
      eventSequence: 4,
      stateVersion: 4,
    });
  });

  it("returns a full snapshot when client cursors reveal an event gap or state mismatch", async () => {
    const source = new TestSource(snapshot(8));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    await nextMessage(client);

    const gap = nextMessage(client);
    client.send(
      JSON.stringify({
        type: "sync",
        lastEventSequence: 5,
        lastStateVersion: 8,
      }),
    );

    await expect(gap).resolves.toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EVENT_GAP",
      snapshot: snapshot(8),
      resetEventSequenceTo: 8,
      resetStateVersionTo: 8,
    });

    const mismatch = nextMessage(client);
    client.send(
      JSON.stringify({
        type: "sync",
        lastEventSequence: 8,
        lastStateVersion: 7,
      }),
    );

    await expect(mismatch).resolves.toEqual({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "STATE_MISMATCH",
      snapshot: snapshot(8),
      resetEventSequenceTo: 8,
      resetStateVersionTo: 8,
    });
  });

  it("rejects invalid sync cursors without treating them as game actions", async () => {
    const source = new TestSource(snapshot(2));
    server = createServer();
    runtime = attachBlackjackWebSocket(server, source);
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`);
    await nextMessage(client);

    const rejected = nextMessage(client);
    client.send(
      JSON.stringify({
        type: "sync",
        lastEventSequence: -1,
      }),
    );

    await expect(rejected).resolves.toEqual({
      type: "error",
      error: "BLACKJACK_INVALID_SYNC_REQUEST",
    });
  });

  it("closes unresolved identities with auth-required policy semantics",async()=>{
    const source=new TestSource(snapshot(1));
    server=createServer();
    runtime=attachBlackjackWebSocket(server,source,{
      resolveIdentity:()=>null,
    });
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    const errorMessage=nextMessage(client);
    const closed=nextClose(client);

    await expect(errorMessage).resolves.toEqual({
      type:"error",
      error:"BLACKJACK_AUTH_REQUIRED",
    });
    await expect(closed).resolves.toEqual({
      code:BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
      reason:"BLACKJACK_AUTH_REQUIRED",
    });
    expect(runtime.authenticatedConnectionCount()).toBe(0);
    expect(runtime.connectionCount()).toBe(0);
  });

  it("replaces an older authenticated device connection for the same account", async () => {
    const source = new TestSource(snapshot(5));
    server = createServer();

    const ids = ["conn-desktop", "conn-mobile"];
    let idIndex = 0;

    runtime = attachBlackjackWebSocket(server, source, {
      createConnectionId: () => ids[idIndex++] ?? `conn-extra-${idIndex}`,
      nowMs: () => 1_000 + idIndex,
      resolveIdentity: (request) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const sessionId = url.searchParams.get("session") ?? "unknown";
        return {
          userId: "user-1",
          playerId: "player-1",
          sessionId,
        };
      },
    });
    const port = await listen(server);

    const desktop = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?session=desktop`,
    );
    client = desktop;
    await nextMessage(desktop);
    expect(runtime.authenticatedConnectionCount()).toBe(1);

    const replacedMessage = nextMessage(desktop);
    const desktopClosed = nextClose(desktop);

    const mobile = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?session=mobile`,
    );
    await nextMessage(mobile);

    await expect(replacedMessage).resolves.toEqual({
      type: "SESSION_REPLACED",
      replacementConnectionId: "conn-mobile",
    });
    await expect(desktopClosed).resolves.toEqual({
      code: 4001,
      reason: "SESSION_REPLACED",
    });

    expect(runtime.authenticatedConnectionCount()).toBe(1);

    mobile.terminate();
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
    const message = nextMessage(client);
    const closed = nextClose(client);

    await expect(message).resolves.toEqual({
      type: "error",
      error: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
    });
    await expect(closed).resolves.toEqual({
      code: BLACKJACK_WS_CLOSE_SNAPSHOT_UNAVAILABLE,
      reason: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
    });
  });
  it("closes repeated malformed or unknown messages as a policy violation",async()=>{
    const source=new TestSource(snapshot(1));
    server=createServer();
    runtime=attachBlackjackWebSocket(server,source,{
      invalidMessageStrikeLimit:3,
    });
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    await nextMessage(client);

    for(let strike=1;strike<=2;strike+=1){
      const rejected=nextMessage(client);
      client.send(strike===1 ? "{" : JSON.stringify({type:"NOPE"}));
      await expect(rejected).resolves.toEqual({
        type:"error",
        error:"BLACKJACK_INVALID_MESSAGE",
      });
      expect(client.readyState).toBe(WebSocket.OPEN);
    }

    const finalError=nextMessage(client);
    const closed=nextClose(client);
    client.send(JSON.stringify({type:"STILL_NOT_VALID"}));

    await expect(finalError).resolves.toEqual({
      type:"error",
      error:"BLACKJACK_INVALID_MESSAGE",
    });
    await expect(closed).resolves.toEqual({
      code:BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
      reason:"BLACKJACK_INVALID_MESSAGE",
    });
  });

  it("rate limits total websocket messages without affecting the initial snapshot",async()=>{
    const source=new TestSource(snapshot(2));
    server=createServer();
    runtime=attachBlackjackWebSocket(server,source,{
      messageRateLimit:2,
      messageRateWindowMs:10_000,
    });
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    await nextMessage(client);

    for(let index=0;index<2;index+=1){
      const synced=nextMessage(client);
      client.send(JSON.stringify({type:"sync"}));
      await expect(synced).resolves.toMatchObject({
        type:"FULL_TABLE_SNAPSHOT",
        reason:"EXPLICIT_SYNC",
      });
    }

    const limited=nextMessage(client);
    const closed=nextClose(client);
    client.send(JSON.stringify({type:"sync"}));
    await expect(limited).resolves.toEqual({
      type:"error",
      error:"BLACKJACK_RATE_LIMITED",
    });
    await expect(closed).resolves.toEqual({
      code:BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
      reason:"BLACKJACK_RATE_LIMITED",
    });
  });

  it("applies a stricter mutation rate limit than heartbeat sync traffic",async()=>{
    const source=new TestSource(snapshot(2));
    server=createServer();
    runtime=attachBlackjackWebSocket(server,source,{
      mutationRateLimit:1,
      mutationRateWindowMs:10_000,
    });
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    await nextMessage(client);

    const first=nextMessage(client);
    client.send(JSON.stringify({
      type:"CLAIM_SEAT",
      requestId:"claim-rate-1",
      seatNumber:1,
    }));
    await expect(first).resolves.toEqual({
      type:"SEAT_CLAIM_REJECTED",
      error:"AUTH_REQUIRED",
    });

    const sync=nextMessage(client);
    client.send(JSON.stringify({type:"sync"}));
    await expect(sync).resolves.toMatchObject({
      type:"FULL_TABLE_SNAPSHOT",
      reason:"EXPLICIT_SYNC",
    });

    const limited=nextMessage(client);
    const closed=nextClose(client);
    client.send(JSON.stringify({
      type:"CLAIM_SEAT",
      requestId:"claim-rate-2",
      seatNumber:1,
    }));
    await expect(limited).resolves.toEqual({
      type:"error",
      error:"BLACKJACK_ACTION_RATE_LIMITED",
    });
    await expect(closed).resolves.toEqual({
      code:BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
      reason:"BLACKJACK_ACTION_RATE_LIMITED",
    });
  });

  it("uses websocket close 1009 for oversized inbound payloads",async()=>{
    const source=new TestSource(snapshot(1));
    server=createServer();
    runtime=attachBlackjackWebSocket(server,source,{
      maxPayloadBytes:256,
    });
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    await nextMessage(client);

    const closed=nextClose(client);
    client.send(JSON.stringify({
      type:"sync",
      padding:"x".repeat(1_024),
    }));

    await expect(closed).resolves.toMatchObject({
      code:1009,
    });
  });

});
