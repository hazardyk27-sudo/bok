import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { isRouletteRoundGenerationPaused } from "./config";
import { rouletteRepository } from "./repository";
import { SESSION_COOKIE } from "./routes";

function sessionFromRequest(request: IncomingMessage) {
  const cookieHeader = request.headers.cookie ?? "";
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? "ws-anonymous";
}

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

export function attachRouletteWebSocket(server: Server) {
  const webSocketServer = new WebSocketServer({ noServer: true });
  const connections = new Set<{ socket: WebSocket; sessionId: string; stop: () => void }>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/roulette/ws") return;
    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      webSocketServer.emit("connection", client, request);
    });
  });

  webSocketServer.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const sessionId = sessionFromRequest(request);
    let closed = false;
    const sendSnapshot = async () => {
      if (closed) return;
      try {
        send(socket, { type: "snapshot", snapshot: await rouletteRepository.getSnapshot(sessionId) });
      } catch {
        send(socket, { type: "error", error: "ROULETTE_SNAPSHOT_UNAVAILABLE" });
      }
    };
    const unsubscribe = rouletteRepository.subscribe((event) => {
      void rouletteRepository.getSnapshot(sessionId).then((snapshot) => {
        if (!closed) send(socket, { ...event, snapshot });
      });
    });
    const timer = isRouletteRoundGenerationPaused()
      ? undefined
      : setInterval(() => void sendSnapshot(), 1000);
    const connection = {
      socket,
      sessionId,
      stop: () => {
        closed = true;
        if (timer) clearInterval(timer);
        unsubscribe();
      },
    };
    connections.add(connection);
    socket.on("message", (message) => {
      if (message.toString() === "sync" || message.toString() === "{\"type\":\"sync\"}") void sendSnapshot();
    });
    socket.on("close", () => { connection.stop(); connections.delete(connection); });
    socket.on("error", () => { connection.stop(); connections.delete(connection); });
    void sendSnapshot();
  });

  return webSocketServer;
}