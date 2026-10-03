import { createServer, type IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import {
  BLACKJACK_AUTH_COOKIE,
  resolveBlackjackRealtimeIdentityWithAuth,
} from "../platform/blackjack";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import { BLACKJACK_REALTIME_SESSION_COOKIE } from "./realtimeIdentity";

const AUTH_SESSION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEGACY_SESSION = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STALE_BOUND_SESSION = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTHER_AUTH_SESSION = "dddddddd-dddd-dddd-dddd-dddddddddddd";

function requestWithCookie(cookie: string): IncomingMessage {
  return { headers: { cookie } } as IncomingMessage;
}

function tableSnapshot(): BlackjackPublicSnapshot {
  return {
    serverTimeMs: 1,
    tableId: "auth-identity-test-table",
    phase: "TABLE_IDLE",
    maxSeats: 5,
    seats: [1,2,3,4,5].map((seatNumber) => ({
      seatNumber: seatNumber as 1|2|3|4|5,
      playerId: null,
    })),
    players: [],
    shoe: {
      shoeId: "auth-identity-test-shoe",
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
        reject(new Error("auth identity integration server did not bind"));
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

describe("blackjack authenticated websocket identity", () => {
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

  it("prefers the authenticated wallet over conflicting legacy game_session cookies", async () => {
    const request = requestWithCookie([
      `${BLACKJACK_AUTH_COOKIE}=valid-auth`,
      `game_session=${LEGACY_SESSION}`,
      `game_session=${STALE_BOUND_SESSION}`,
    ].join("; "));

    await expect(resolveBlackjackRealtimeIdentityWithAuth(
      request,
      async (token) => token === "valid-auth" ? AUTH_SESSION : null,
    )).resolves.toMatchObject({
      userId: AUTH_SESSION,
      playerId: `blackjack-player:${AUTH_SESSION}`,
      sessionId: AUTH_SESSION,
    });
  });

  it("prefers the authenticated wallet over a stale dedicated websocket binding", async () => {
    const request = requestWithCookie([
      `${BLACKJACK_AUTH_COOKIE}=valid-auth`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${STALE_BOUND_SESSION}`,
      `game_session=${LEGACY_SESSION}`,
    ].join("; "));

    await expect(resolveBlackjackRealtimeIdentityWithAuth(
      request,
      async () => AUTH_SESSION,
    )).resolves.toMatchObject({
      sessionId: AUTH_SESSION,
    });
  });

  it("fails closed when duplicate auth cookies resolve to different wallets", async () => {
    const request = requestWithCookie([
      `${BLACKJACK_AUTH_COOKIE}=auth-one`,
      `${BLACKJACK_AUTH_COOKIE}=auth-two`,
      `game_session=${LEGACY_SESSION}`,
    ].join("; "));

    await expect(resolveBlackjackRealtimeIdentityWithAuth(
      request,
      async (token) => token === "auth-one"
        ? AUTH_SESSION
        : OTHER_AUTH_SESSION,
    )).resolves.toBeNull();
  });

  it("falls back to the dedicated websocket binding when auth is expired", async () => {
    const request = requestWithCookie([
      `${BLACKJACK_AUTH_COOKIE}=expired-auth`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${STALE_BOUND_SESSION}`,
    ].join("; "));

    await expect(resolveBlackjackRealtimeIdentityWithAuth(
      request,
      async () => null,
    )).resolves.toMatchObject({
      sessionId: STALE_BOUND_SESSION,
    });
  });

  it("opens a real websocket from auth even when game_session cookies are ambiguous", async () => {
    const snapshot = tableSnapshot();
    server = createServer();
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) =>
          resolveBlackjackRealtimeIdentityWithAuth(
            request,
            async (token) => token === "valid-auth" ? AUTH_SESSION : null,
          ),
      },
    );
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`, {
      headers: {
        Cookie: [
          `${BLACKJACK_AUTH_COOKIE}=valid-auth`,
          `game_session=${LEGACY_SESSION}`,
          `game_session=${STALE_BOUND_SESSION}`,
        ].join("; "),
      },
    });

    await expect(nextMessage(client)).resolves.toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: { tableId: "auth-identity-test-table" },
    });
    expect(runtime.authenticatedConnectionCount()).toBe(1);
  });
});
