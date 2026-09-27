import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import {
  WebSocket,
  WebSocketServer,
} from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  claimBlackjackConnection,
  createBlackjackConnectionRegistry,
  releaseBlackjackConnection,
  type BlackjackConnectionRegistry,
} from "./connectionPolicy";
import {
  buildBlackjackInitialSyncResponse,
  evaluateBlackjackSyncRequest,
  parseBlackjackSyncRequest,
} from "./syncProtocol";

export const BLACKJACK_WS_PATH = "/api/blackjack/ws" as const;

export type BlackjackRealtimeSource = Readonly<{
  getSnapshot: () =>
    | BlackjackPublicSnapshot
    | Promise<BlackjackPublicSnapshot>;
  subscribe: (
    listener: (snapshot: BlackjackPublicSnapshot) => void,
  ) => () => void;
}>;

export type BlackjackRealtimeIdentity = Readonly<{
  userId: string;
  playerId: string;
  sessionId: string;
}>;

export type BlackjackRealtimeOptions = Readonly<{
  resolveIdentity?: (
    request: IncomingMessage,
  ) =>
    | BlackjackRealtimeIdentity
    | null
    | Promise<BlackjackRealtimeIdentity | null>;
  createConnectionId?: () => string;
  nowMs?: () => number;
}>;

export type BlackjackRealtimeRuntime = Readonly<{
  webSocketServer: WebSocketServer;
  connectionCount: () => number;
  authenticatedConnectionCount: () => number;
  close: () => void;
}>;

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function parseMessage(message: string): unknown {
  if (message === "sync") return "sync";
  try {
    return JSON.parse(message);
  } catch {
    return null;
  }
}

export function attachBlackjackWebSocket(
  server: Server,
  source: BlackjackRealtimeSource,
  options: BlackjackRealtimeOptions = {},
): BlackjackRealtimeRuntime {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const connections = new Set<WebSocket>();
  const connectionIdBySocket = new Map<WebSocket, string>();
  const socketByConnectionId = new Map<string, WebSocket>();
  let connectionRegistry: BlackjackConnectionRegistry =
    createBlackjackConnectionRegistry();
  const createConnectionId = options.createConnectionId ?? randomUUID;
  const nowMs = options.nowMs ?? Date.now;
  let closed = false;

  const broadcastSnapshot = (snapshot: BlackjackPublicSnapshot) => {
    if (closed) return;
    const payload = { type: "snapshot", snapshot };
    for (const socket of connections) send(socket, payload);
  };

  const unsubscribe = source.subscribe(broadcastSnapshot);

  const sendInitialSnapshot = async (socket: WebSocket) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    try {
      const snapshot = await source.getSnapshot();
      if (!closed) {
        send(socket, buildBlackjackInitialSyncResponse(snapshot));
      }
    } catch {
      send(socket, {
        type: "error",
        error: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
      });
    }
  };

  const handleSync = async (
    socket: WebSocket,
    rawMessage: unknown,
  ) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;

    try {
      const request = parseBlackjackSyncRequest(rawMessage);
      if (request === null) {
        send(socket, {
          type: "error",
          error: "BLACKJACK_ACTION_PROTOCOL_NOT_READY",
        });
        return;
      }

      const snapshot = await source.getSnapshot();
      if (!closed) {
        send(socket, evaluateBlackjackSyncRequest(snapshot, request));
      }
    } catch (error) {
      if (error instanceof RangeError) {
        send(socket, {
          type: "error",
          error: "BLACKJACK_INVALID_SYNC_REQUEST",
        });
        return;
      }

      send(socket, {
        type: "error",
        error: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
      });
    }
  };

  const onUpgrade = (
    request: IncomingMessage,
    socket: Socket,
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== BLACKJACK_WS_PATH) return;

    webSocketServer.handleUpgrade(
      request,
      socket,
      head,
      (client) => {
        webSocketServer.emit("connection", client, request);
      },
    );
  };

  server.on("upgrade", onUpgrade);

  const initializeConnection = async (
    socket: WebSocket,
    request: IncomingMessage,
  ) => {
    if (closed) {
      socket.close(1012, "BLACKJACK_REALTIME_CLOSED");
      return;
    }

    const connectionId = createConnectionId();
    if (!connectionId.trim()) {
      send(socket, {
        type: "error",
        error: "BLACKJACK_CONNECTION_ID_UNAVAILABLE",
      });
      socket.close(1011, "BLACKJACK_CONNECTION_ID_UNAVAILABLE");
      return;
    }

    connections.add(socket);
    connectionIdBySocket.set(socket, connectionId);
    socketByConnectionId.set(connectionId, socket);

    const cleanup = () => {
      connections.delete(socket);
      connectionIdBySocket.delete(socket);
      socketByConnectionId.delete(connectionId);
      connectionRegistry = releaseBlackjackConnection(
        connectionRegistry,
        connectionId,
      );
    };
    socket.once("close", cleanup);
    socket.once("error", cleanup);

    if (options.resolveIdentity) {
      try {
        const identity = await options.resolveIdentity(request);
        if (identity !== null) {
          const claim = claimBlackjackConnection(connectionRegistry, {
            connectionId,
            userId: identity.userId,
            playerId: identity.playerId,
            sessionId: identity.sessionId,
            connectedAtMs: nowMs(),
          });
          connectionRegistry = claim.registry;

          for (const replacedConnectionId of claim.replacedConnectionIds) {
            const replacedSocket = socketByConnectionId.get(
              replacedConnectionId,
            );
            if (
              replacedSocket &&
              replacedSocket !== socket &&
              replacedSocket.readyState === WebSocket.OPEN
            ) {
              send(replacedSocket, {
                type: "SESSION_REPLACED",
                replacementConnectionId: connectionId,
              });
              replacedSocket.close(4001, "SESSION_REPLACED");
            }
          }
        }
      } catch {
        send(socket, {
          type: "error",
          error: "BLACKJACK_IDENTITY_UNAVAILABLE",
        });
        socket.close(1008, "BLACKJACK_IDENTITY_UNAVAILABLE");
        return;
      }
    }

    socket.on("message", (raw) => {
      const message = parseMessage(raw.toString());

      if (
        message === "sync" ||
        (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          (message as { type?: unknown }).type === "sync"
        )
      ) {
        void handleSync(socket, message);
        return;
      }

      send(socket, {
        type: "error",
        error: "BLACKJACK_ACTION_PROTOCOL_NOT_READY",
      });
    });

    await sendInitialSnapshot(socket);
  };

  webSocketServer.on(
    "connection",
    (socket: WebSocket, request: IncomingMessage) => {
      void initializeConnection(socket, request);
    },
  );

  const runtime: BlackjackRealtimeRuntime = Object.freeze({
    webSocketServer,
    connectionCount: () => connections.size,
    authenticatedConnectionCount: () => connectionRegistry.active.length,
    close: () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      server.off("upgrade", onUpgrade);
      for (const socket of connections) socket.terminate();
      connections.clear();
      connectionIdBySocket.clear();
      socketByConnectionId.clear();
      connectionRegistry = createBlackjackConnectionRegistry();
      webSocketServer.close();
    },
  });

  return runtime;
}
