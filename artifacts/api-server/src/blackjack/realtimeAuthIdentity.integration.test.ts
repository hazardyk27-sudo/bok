import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, type RawData } from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeIdentity,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import {
  BLACKJACK_AUTH_COOKIE,
  BLACKJACK_REALTIME_SESSION_COOKIE,
  resolveBlackjackRealtimeSessionIdWithAuth,
  type BlackjackAuthWalletSessionLookup,
} from "./realtimeIdentity";

const ACCOUNT_SESSION = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEGACY_SESSION = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function identityFromSessionId(
  sessionId: string | null,
): BlackjackRealtimeIdentity | null {
  return sessionId === null ? null : {
    userId: sessionId,
    playerId: `blackjack-player:${sessionId}`,
    sessionId,
  };
}

async function resolveIdentity(
  cookieHeader: string | undefined,
  lookup: BlackjackAuthWalletSessionLookup,
): Promise<BlackjackRealtimeIdentity | null> {
  return identityFromSessionId(
    await resolveBlackjackRealtimeSessionIdWithAuth(cookieHeader, lookup),
  );
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

  it("does not authenticate websocket directly from fy_auth anymore", async () => {
    const lookup = vi.fn(async () => ACCOUNT_SESSION);
    const cookieHeader = [
      `${BLACKJACK_AUTH_COOKIE}=valid-auth`,
      `game_session=${ACCOUNT_SESSION}`,
    ].join("; ");

    await expect(resolveBlackjackRealtimeSessionIdWithAuth(
      cookieHeader,
      lookup,
    )).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("uses the dedicated binding and ignores duplicate auth/game cookies", async () => {
    const lookup = vi.fn(async () => LEGACY_SESSION);
    const cookieHeader = [
      `${BLACKJACK_AUTH_COOKIE}=old-auth`,
      `${BLACKJACK_AUTH_COOKIE}=new-auth`,
      `game_session=${LEGACY_SESSION}`,
      `game_session=${ACCOUNT_SESSION}`,
      `${BLACKJACK_REALTIME_SESSION_COOKIE}=${ACCOUNT_SESSION}`,
    ].join("; ");

    await expect(resolveBlackjackRealtimeSessionIdWithAuth(
      cookieHeader,
      lookup,
    )).resolves.toBe(ACCOUNT_SESSION);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("opens a real websocket from the dedicated account binding", async () => {
    const snapshot = tableSnapshot();
    server = createServer();
    const lookup = vi.fn(async () => LEGACY_SESSION);
    runtime = attachBlackjackWebSocket(
      server,
      {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
      },
      {
        resolveIdentity: (request) =>
          resolveIdentity(request.headers.cookie, lookup),
      },
    );
    const port = await listen(server);

    client = new WebSocket(`ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`, {
      headers: {
        Cookie: [
          `${BLACKJACK_AUTH_COOKIE}=old-auth`,
          `${BLACKJACK_AUTH_COOKIE}=new-auth`,
          `game_session=${LEGACY_SESSION}`,
          `${BLACKJACK_REALTIME_SESSION_COOKIE}=${ACCOUNT_SESSION}`,
        ].join("; "),
      },
    });

    await expect(nextMessage(client)).resolves.toMatchObject({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: { tableId: "auth-identity-test-table" },
    });
    expect(runtime.authenticatedConnectionCount()).toBe(1);
    expect(lookup).not.toHaveBeenCalled();
  });
});
