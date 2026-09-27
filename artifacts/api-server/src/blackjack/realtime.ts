import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import {
  WebSocket,
  WebSocketServer,
} from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
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

export type BlackjackRealtimeRuntime = Readonly<{
  webSocketServer: WebSocketServer;
  connectionCount: () => number;
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
): BlackjackRealtimeRuntime {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const connections = new Set<WebSocket>();
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

  webSocketServer.on(
    "connection",
    (socket: WebSocket) => {
      if (closed) {
        socket.close(1012, "BLACKJACK_REALTIME_CLOSED");
        return;
      }

      connections.add(socket);

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

      const cleanup = () => {
        connections.delete(socket);
      };
      socket.once("close", cleanup);
      socket.once("error", cleanup);

      void sendInitialSnapshot(socket);
    },
  );

  const runtime: BlackjackRealtimeRuntime = Object.freeze({
    webSocketServer,
    connectionCount: () => connections.size,
    close: () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      server.off("upgrade", onUpgrade);
      for (const socket of connections) socket.terminate();
      connections.clear();
      webSocketServer.close();
    },
  });

  return runtime;
}
