import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import {
  WebSocket,
  WebSocketServer,
} from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import type { BlackjackPrivatePlayerState } from "./privatePlayerState";
import {
  parseBlackjackSeatClaimRequest,
  parseBlackjackSeatLeaveRequest,
  type BlackjackSeatClaimAccepted,
  type BlackjackSeatClaimRequest,
  type BlackjackSeatLeaveAccepted,
  type BlackjackSeatLeaveRequest,
} from "./seatProtocol";
import {
  claimBlackjackConnection,
  createBlackjackConnectionRegistry,
  releaseBlackjackConnection,
  type BlackjackConnectionRegistry,
} from "./connectionPolicy";
import {
  buildBlackjackFullSnapshotMessage,
  buildBlackjackInitialSyncResponse,
  evaluateBlackjackSyncRequest,
  parseBlackjackSyncRequest,
} from "./syncProtocol";
import {
  parseBlackjackRealtimePlayerAction,
  type BlackjackRealtimePlayerActionHandler,
  type BlackjackRealtimePlayerActionHandlerResult,
  type BlackjackRealtimePlayerActionTransactionHandler,
} from "./realtimeActions";

export const BLACKJACK_WS_PATH = "/api/blackjack/ws" as const;
export const BLACKJACK_WS_CLOSE_SESSION_REPLACED = 4001 as const;
export const BLACKJACK_WS_CLOSE_SNAPSHOT_UNAVAILABLE = 1013 as const;
export const BLACKJACK_WS_CLOSE_IDENTITY_UNAVAILABLE = 1008 as const;

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
  handlePlayerAction?: BlackjackRealtimePlayerActionHandler;
  handlePlayerActionTransaction?: BlackjackRealtimePlayerActionTransactionHandler;
  createConnectionId?: () => string;
  nowMs?: () => number;
  onIdentityConnected?: (
    identity: BlackjackRealtimeIdentity,
    connectedAtMs: number,
  ) => void | Promise<void>;
  onIdentityDisconnected?: (
    identity: BlackjackRealtimeIdentity,
    disconnectedAtMs: number,
  ) => void | Promise<void>;
  getPrivatePlayerState?: (
    identity: BlackjackRealtimeIdentity,
    snapshot: BlackjackPublicSnapshot,
  ) => BlackjackPrivatePlayerState | null;
  handleSeatClaimTransaction?: (
    identity: BlackjackRealtimeIdentity,
    request: BlackjackSeatClaimRequest,
    acknowledge: (result: BlackjackSeatClaimAccepted)=>void,
  ) => void | Promise<void>;
  handleSeatLeaveTransaction?: (
    identity: BlackjackRealtimeIdentity,
    request: BlackjackSeatLeaveRequest,
    acknowledge: (result: BlackjackSeatLeaveAccepted)=>void,
  ) => void | Promise<void>;
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

function closeSnapshotUnavailable(socket: WebSocket): void {
  send(socket, {
    type: "error",
    error: "BLACKJACK_SNAPSHOT_UNAVAILABLE",
  });
  if (socket.readyState === WebSocket.OPEN) {
    socket.close(
      BLACKJACK_WS_CLOSE_SNAPSHOT_UNAVAILABLE,
      "BLACKJACK_SNAPSHOT_UNAVAILABLE",
    );
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
  const identityBySocket = new Map<WebSocket, BlackjackRealtimeIdentity>();
  let connectionRegistry: BlackjackConnectionRegistry =
    createBlackjackConnectionRegistry();
  const createConnectionId = options.createConnectionId ?? randomUUID;
  const nowMs = options.nowMs ?? Date.now;
  let closed = false;

  const sendPrivatePlayerState=(
    socket: WebSocket,
    snapshot: BlackjackPublicSnapshot,
  )=>{
    const identity=identityBySocket.get(socket);
    if(!identity || !options.getPrivatePlayerState) return;
    try {
      const privateState=options.getPrivatePlayerState(
        identity,
        snapshot,
      );
      if(privateState!==null){
        send(socket,privateState);
      }
    } catch {
      // Private state is optional enrichment. Never break public realtime.
    }
  };

  const broadcastSnapshot = (snapshot: BlackjackPublicSnapshot) => {
    if (closed) return;
    const payload = { type: "snapshot", snapshot };
    for (const socket of connections){
      send(socket, payload);
      sendPrivatePlayerState(socket,snapshot);
    }
  };

  const unsubscribe = source.subscribe(broadcastSnapshot);

  const sendInitialSnapshot = async (socket: WebSocket) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;
    try {
      const snapshot = await source.getSnapshot();
      if (!closed) {
        send(socket, buildBlackjackInitialSyncResponse(snapshot));
        sendPrivatePlayerState(socket,snapshot);
      }
    } catch {
      closeSnapshotUnavailable(socket);
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
        sendPrivatePlayerState(socket,snapshot);
      }
    } catch (error) {
      if (error instanceof RangeError) {
        send(socket, {
          type: "error",
          error: "BLACKJACK_INVALID_SYNC_REQUEST",
        });
        return;
      }

      closeSnapshotUnavailable(socket);
    }
  };

  const handleSeatClaimMessage=async(
    socket: WebSocket,
    rawMessage: unknown,
  )=>{
    if(closed || socket.readyState!==WebSocket.OPEN) return;
    const identity=identityBySocket.get(socket);
    if(!identity){
      send(socket,{type:"SEAT_CLAIM_REJECTED",error:"AUTH_REQUIRED"});
      return;
    }
    if(!options.handleSeatClaimTransaction){
      send(socket,{type:"SEAT_CLAIM_REJECTED",error:"SEATING_NOT_READY"});
      return;
    }

    let request: BlackjackSeatClaimRequest;
    try {
      const parsed=parseBlackjackSeatClaimRequest(rawMessage);
      if(parsed===null) return;
      request=parsed;
    } catch {
      send(socket,{type:"SEAT_CLAIM_REJECTED",error:"INVALID_SEAT_CLAIM"});
      return;
    }

    try {
      await options.handleSeatClaimTransaction(
        identity,
        request,
        (result)=>send(socket,result),
      );
    } catch {
      try {
        await source.getSnapshot();
      } catch {
        closeSnapshotUnavailable(socket);
        return;
      }
      send(socket,{
        type:"SEAT_CLAIM_REJECTED",
        requestId:request.requestId,
        error:"SEAT_UNAVAILABLE",
      });
    }
  };

  const handleSeatLeaveMessage=async(
    socket: WebSocket,
    rawMessage: unknown,
  )=>{
    if(closed || socket.readyState!==WebSocket.OPEN) return;
    const identity=identityBySocket.get(socket);
    if(!identity){
      send(socket,{type:"SEAT_LEAVE_REJECTED",error:"AUTH_REQUIRED"});
      return;
    }
    if(!options.handleSeatLeaveTransaction){
      send(socket,{type:"SEAT_LEAVE_REJECTED",error:"SEATING_NOT_READY"});
      return;
    }

    let request: BlackjackSeatLeaveRequest;
    try {
      const parsed=parseBlackjackSeatLeaveRequest(rawMessage);
      if(parsed===null) return;
      request=parsed;
    } catch {
      send(socket,{type:"SEAT_LEAVE_REJECTED",error:"INVALID_SEAT_LEAVE"});
      return;
    }

    try {
      await options.handleSeatLeaveTransaction(
        identity,
        request,
        (result)=>send(socket,result),
      );
    } catch {
      try {
        await source.getSnapshot();
      } catch {
        closeSnapshotUnavailable(socket);
        return;
      }
      send(socket,{
        type:"SEAT_LEAVE_REJECTED",
        requestId:request.requestId,
        error:"SEAT_LEAVE_NOT_AVAILABLE",
      });
    }
  };

  const handlePlayerActionMessage = async (
    socket: WebSocket,
    rawMessage: unknown,
  ) => {
    if (closed || socket.readyState !== WebSocket.OPEN) return;

    if (
      !options.handlePlayerAction &&
      !options.handlePlayerActionTransaction
    ) {
      send(socket, {
        type: "error",
        error: "BLACKJACK_ACTION_PROTOCOL_NOT_READY",
      });
      return;
    }

    const identity = identityBySocket.get(socket);
    if (!identity) {
      send(socket, {
        type: "error",
        error: "BLACKJACK_AUTH_REQUIRED",
      });
      return;
    }

    const actionId =
      typeof rawMessage === "object" &&
      rawMessage !== null &&
      "actionId" in rawMessage &&
      typeof (rawMessage as { actionId?: unknown }).actionId === "string"
        ? (rawMessage as { actionId: string }).actionId
        : null;

    let current: BlackjackPublicSnapshot;
    try {
      current = await source.getSnapshot();
    } catch {
      closeSnapshotUnavailable(socket);
      return;
    }

    try {
      const action = parseBlackjackRealtimePlayerAction(rawMessage, {
        playerId: identity.playerId,
        tableId: current.tableId,
        nowMs: nowMs(),
      });

      const acknowledge = (
        result: BlackjackRealtimePlayerActionHandlerResult,
      ) => {
        send(socket, {
          type: "ACTION_ACCEPTED",
          actionId: result.actionId,
          replayed: result.replayed,
          stateVersion: result.snapshot.stateVersion,
          eventSequence: result.snapshot.eventSequence,
          ...(result.betting === null ? {} : { betting: result.betting }),
        });
      };

      if (options.handlePlayerActionTransaction) {
        await options.handlePlayerActionTransaction(action, acknowledge);
      } else {
        const result = await options.handlePlayerAction!(action);
        acknowledge(result);

        if (!result.replayed) {
          broadcastSnapshot(result.snapshot);
        }
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "STALE_ACTION"
      ) {
        try {
          const snapshot = await source.getSnapshot();
          send(socket, {
            type: "ACTION_REJECTED",
            actionId,
            error: "STALE_ACTION",
            resync: buildBlackjackFullSnapshotMessage(
              snapshot,
              "STATE_MISMATCH",
            ),
          });
        } catch {
          closeSnapshotUnavailable(socket);
        }
        return;
      }

      try {
        await source.getSnapshot();
      } catch {
        closeSnapshotUnavailable(socket);
        return;
      }

      send(socket, {
        type: "ACTION_REJECTED",
        actionId,
        error: "INVALID_ACTION",
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

    connectionIdBySocket.set(socket, connectionId);
    socketByConnectionId.set(connectionId, socket);

    let cleaned=false;
    const cleanup = () => {
      if(cleaned) return;
      cleaned=true;
      const identity=identityBySocket.get(socket);
      connections.delete(socket);
      connectionIdBySocket.delete(socket);
      socketByConnectionId.delete(connectionId);
      identityBySocket.delete(socket);
      connectionRegistry = releaseBlackjackConnection(
        connectionRegistry,
        connectionId,
      );

      if(
        !closed &&
        identity &&
        !connectionRegistry.active.some(
          (candidate)=>candidate.playerId===identity.playerId,
        )
      ){
        try {
          const pending=options.onIdentityDisconnected?.(
            identity,
            nowMs(),
          );
          if(pending){
            void Promise.resolve(pending).catch(()=>undefined);
          }
        } catch {
          // Socket cleanup must never surface an unhandled lifecycle error.
        }
      }
    };
    socket.once("close", cleanup);
    socket.once("error", cleanup);

    if (options.resolveIdentity) {
      let identity: BlackjackRealtimeIdentity | null;
      try {
        identity = await options.resolveIdentity(request);
      } catch {
        send(socket, {
          type: "error",
          error: "BLACKJACK_IDENTITY_UNAVAILABLE",
        });
        socket.close(
          BLACKJACK_WS_CLOSE_IDENTITY_UNAVAILABLE,
          "BLACKJACK_IDENTITY_UNAVAILABLE",
        );
        return;
      }

      if (identity !== null) {
        try {
          const claim = claimBlackjackConnection(connectionRegistry, {
            connectionId,
            userId: identity.userId,
            playerId: identity.playerId,
            sessionId: identity.sessionId,
            connectedAtMs: nowMs(),
          });
          connectionRegistry = claim.registry;
          identityBySocket.set(socket, identity);

          await options.onIdentityConnected?.(
            identity,
            claim.active.connectedAtMs,
          );

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
              replacedSocket.close(
                BLACKJACK_WS_CLOSE_SESSION_REPLACED,
                "SESSION_REPLACED",
              );
            }
          }
        } catch {
          try {
            await source.getSnapshot();
          } catch {
            closeSnapshotUnavailable(socket);
            return;
          }
          send(socket, {
            type: "error",
            error: "BLACKJACK_CONNECTION_UNAVAILABLE",
          });
          socket.close(1011, "BLACKJACK_CONNECTION_UNAVAILABLE");
          return;
        }
      }
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

      if(
        typeof message==="object" &&
        message!==null &&
        "type" in message &&
        (message as {type?:unknown}).type==="CLAIM_SEAT"
      ){
        void handleSeatClaimMessage(socket,message);
        return;
      }
      if(
        typeof message==="object" &&
        message!==null &&
        "type" in message &&
        (message as {type?:unknown}).type==="LEAVE_SEAT"
      ){
        void handleSeatLeaveMessage(socket,message);
        return;
      }

      void handlePlayerActionMessage(socket, message);
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
      identityBySocket.clear();
      connectionRegistry = createBlackjackConnectionRegistry();
      webSocketServer.close();
    },
  });

  return runtime;
}
