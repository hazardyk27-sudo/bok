import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import {
  BLACKJACK_REALTIME_SESSION_COOKIE,
  BLACKJACK_REALTIME_SESSION_COOKIE_PATH,
  getCookieCandidatesByName,
  resolveBlackjackRealtimeSessionId,
} from "./realtimeIdentity";

const ROOT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEGACY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BOUND = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function snapshot(): BlackjackPublicSnapshot {
  return {
    serverTimeMs: 1,
    tableId: "identity-test-table",
    phase: "TABLE_IDLE",
    maxSeats: 5,
    seats: [1,2,3,4,5].map((seatNumber)=>({
      seatNumber: seatNumber as 1|2|3|4|5,
      playerId: null,
    })),
    players: [],
    shoe: {
      shoeId: "identity-test-shoe",
      cardsRemaining: 312,
      reshufflePending: false,
    },
    round: null,
    stateVersion: 1,
    eventSequence: 1,
  };
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("identity test server did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
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

function nextClose(socket: WebSocket): Promise<{code:number;reason:string}> {
  return new Promise((resolve) => {
    socket.once("close", (code, reason) => {
      resolve({ code, reason: reason.toString() });
    });
  });
}

describe("blackjack realtime identity binding", () => {
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

  it("uses a dedicated websocket-path cookie instead of game_session ordering", () => {
    const header = [
      `game_session=${LEGACY}`,
      `game_session=${ROOT}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
    ].join("; ");

    expect(resolveBlackjackRealtimeSessionId(header)).toBe(BOUND);
  });

  it("falls back to one unambiguous canonical game_session", () => {
    expect(
      resolveBlackjackRealtimeSessionId(`game_session=${ROOT}`),
    ).toBe(ROOT);
  });

  it("deduplicates identical canonical game_session values before fallback", () => {
    const header = [
      `game_session=${ROOT}`,
      `game_session=${ROOT}`,
    ].join("; ");

    expect(resolveBlackjackRealtimeSessionId(header)).toBe(ROOT);
  });

  it("does not silently fall back to ambiguous game_session candidates", () => {
    const header = [
      `game_session=${LEGACY}`,
      `game_session=${ROOT}`,
    ].join("; ");

    expect(resolveBlackjackRealtimeSessionId(header)).toBeNull();
  });

  it("keeps the dedicated binding scoped to the blackjack websocket path", () => {
    expect(BLACKJACK_REALTIME_SESSION_COOKIE_PATH).toBe("/api/blackjack/ws");
  });

  it("deduplicates repeated realtime binding values and uses the latest valid binding", () => {
    const newer = "dddddddd-dddd-dddd-dddd-dddddddddddd";
    const header = [
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${newer}`,
    ].join("; ");

    expect(getCookieCandidatesByName(
      header,
      BLACKJACK_REALTIME_SESSION_COOKIE,
    )).toEqual([BOUND, newer]);
    expect(resolveBlackjackRealtimeSessionId(header)).toBe(newer);
  });

  it("rejects malformed binding values", () => {
    const header = `${BLACKJACK_REALTIME_SESSION_COOKIE}=not-a-session`;
    expect(resolveBlackjackRealtimeSessionId(header)).toBeNull();
  });

  it("accepts conflicting game_session cookies when the dedicated binding is present", async () => {
    const tableSnapshot = snapshot();
    server = createServer();
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => tableSnapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) => {
          const sessionId = resolveBlackjackRealtimeSessionId(
            request.headers.cookie,
          );
          return sessionId === null ? null : {
            userId: sessionId,
            playerId: `blackjack-player:${sessionId}`,
            sessionId,
          };
        },
      },
    );
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`, {
      headers: {
        Cookie: [
          `game_session=${LEGACY}`,
          `game_session=${ROOT}`,
          `${BLACKJACK_REALTIME_SESSION_COOKIE}=${BOUND}`,
        ].join("; "),
      },
    });

    await expect(nextMessage(client)).resolves.toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: { tableId: "identity-test-table" },
    });
    expect(runtime.authenticatedConnectionCount()).toBe(1);
  });

  it("accepts a real websocket with one canonical game_session when the dedicated binding is missing", async () => {
    const tableSnapshot = snapshot();
    server = createServer();
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => tableSnapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) => {
          const sessionId = resolveBlackjackRealtimeSessionId(
            request.headers.cookie,
          );
          return sessionId === null ? null : {
            userId: sessionId,
            playerId: `blackjack-player:${sessionId}`,
            sessionId,
          };
        },
      },
    );
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`, {
      headers: {
        Cookie: `game_session=${ROOT}`,
      },
    });

    await expect(nextMessage(client)).resolves.toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: { tableId: "identity-test-table" },
    });
    expect(runtime.authenticatedConnectionCount()).toBe(1);
  });

  it("fails closed over a real websocket when only ambiguous game_session cookies exist", async () => {
    const tableSnapshot = snapshot();
    server = createServer();
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => tableSnapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) => {
          const sessionId = resolveBlackjackRealtimeSessionId(
            request.headers.cookie,
          );
          return sessionId === null ? null : {
            userId: sessionId,
            playerId: `blackjack-player:${sessionId}`,
            sessionId,
          };
        },
      },
    );
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`, {
      headers: {
        Cookie: [
          `game_session=${LEGACY}`,
          `game_session=${ROOT}`,
        ].join("; "),
      },
    });

    const first = nextMessage(client);
    const closed = nextClose(client);
    await expect(first).resolves.toEqual({
      type: "error",
      error: "BLACKJACK_AUTH_REQUIRED",
    });
    await expect(closed).resolves.toEqual({
      code: BLACKJACK_WS_CLOSE_POLICY_VIOLATION,
      reason: "BLACKJACK_AUTH_REQUIRED",
    });
    expect(runtime.authenticatedConnectionCount()).toBe(0);
  });
});
