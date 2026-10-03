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
  resolveBlackjackRealtimeSessionId,
} from "./realtimeIdentity";

const ROOT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEGACY = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BOUND = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function tableSnapshot(): BlackjackPublicSnapshot {
  return {
    serverTimeMs: 1,
    tableId: "identity-test-table",
    phase: "TABLE_IDLE",
    maxSeats: 5,
    seats: [1,2,3,4,5].map((seatNumber) => ({
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
        reject(new Error("identity integration server did not bind"));
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

function identityFromRequest(cookieHeader: string | undefined) {
  const sessionId = resolveBlackjackRealtimeSessionId(cookieHeader);
  return sessionId === null ? null : {
    userId: sessionId,
    playerId: `blackjack-player:${sessionId}`,
    sessionId,
  };
}

describe("blackjack realtime identity websocket integration", () => {
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

  it("accepts conflicting game_session cookies when dedicated binding is present", async () => {
    const snapshot = tableSnapshot();
    server = createServer();
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) => identityFromRequest(request.headers.cookie),
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

  it("fails closed when only ambiguous game_session cookies are present", async () => {
    const snapshot = tableSnapshot();
    server = createServer();
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) => identityFromRequest(request.headers.cookie),
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
