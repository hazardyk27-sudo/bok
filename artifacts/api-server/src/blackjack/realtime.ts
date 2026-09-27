import type { IncomingMessage, Server } from "node:http";
import {
  WebSocket,
  WebSocketServer,
} from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";

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
  if (message === "sync") return { type: "sync" };
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

  const sendSnapshot = async (socket: WebSocket) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    try {
      const snapshot = await source.getSnapshot();
      if (!closed) send(socket, { type: "snapshot", snapshot });
    } catch {
      send(socket, {
        type: "error",
        error: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
      });
    }
  };

  const onUpgrade = (
    request: IncomingMessage,
    socket: Parameters<Server["emit"]>[1] & {
      destroy?: () => void;
    },
    head: Buffer,
  ) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== BLACKJACK_WS_PATH) return;

    webSocketServer.handleUpgrade(
      request,
      socket as never,
      head,
      (client) => {
        webSocketServer.emit("connection", client, request);
      },
    );
  };

  server.on("upgrade", onUpgrade as never);

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
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          (message as { type?: unknown }).type === "sync"
        ) {
          void sendSnapshot(socket);
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

      void sendSnapshot(socket);
    },
  );

  const runtime: BlackjackRealtimeRuntime = Object.freeze({
    webSocketServer,
    connectionCount: () => connections.size,
    close: () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      server.off("upgrade", onUpgrade as never);
      for (const socket of connections) socket.terminate();
      connections.clear();
      webSocketServer.close();
    },
  });

  return runtime;
}
