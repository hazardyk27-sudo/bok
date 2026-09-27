import type {
  BlackjackPlayerId,
  BlackjackPlayerStatus,
  BlackjackRound,
  BlackjackSessionId,
  BlackjackTable,
  BlackjackUserId,
} from "./domain";
import {
  advanceBlackjackTurnAfterHandResolution,
  applyBlackjackTurnTimeout,
} from "./turnEngine";

export const BLACKJACK_RECONNECT_GRACE_MS = 30_000 as const;

type BlackjackConnectedPlayerStatus = Exclude<
  BlackjackPlayerStatus,
  "DISCONNECTED"
>;

export type BlackjackReconnectRecord = Readonly<{
  playerId: BlackjackPlayerId;
  userId: BlackjackUserId;
  sessionId: BlackjackSessionId;
  previousStatus: BlackjackConnectedPlayerStatus;
  disconnectedAtMs: number;
  expiresAtMs: number;
}>;

export type BlackjackReconnectRegistry = Readonly<{
  records: readonly BlackjackReconnectRecord[];
}>;

export type BlackjackReconnectMutation = Readonly<{
  table: BlackjackTable;
  registry: BlackjackReconnectRegistry;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack reconnect nowMs must be a non-negative safe integer");
  }
}

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
}

function safeAddMs(startMs: number, durationMs: number): number {
  const value = startMs + durationMs;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Blackjack reconnect deadline exceeds safe integer range");
  }
  return value;
}

function nextStateVersion(table: BlackjackTable): number {
  if (
    !Number.isSafeInteger(table.stateVersion) ||
    table.stateVersion < 0 ||
    table.stateVersion >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("Blackjack stateVersion cannot advance safely");
  }
  return table.stateVersion + 1;
}

function freezeRegistry(
  records: readonly BlackjackReconnectRecord[],
): BlackjackReconnectRegistry {
  return Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze({ ...record }))),
  });
}

export function createBlackjackReconnectRegistry(): BlackjackReconnectRegistry {
  return freezeRegistry([]);
}

export function disconnectBlackjackPlayerForReconnect(
  table: BlackjackTable,
  registry: BlackjackReconnectRegistry,
  input: {
    playerId: BlackjackPlayerId;
    nowMs: number;
  },
): BlackjackReconnectMutation {
  assertNowMs(input.nowMs);
  assertNonEmptyId("playerId", input.playerId);

  const player = table.players.find(
    (candidate) => candidate.playerId === input.playerId,
  );
  if (!player) {
    throw new Error("Blackjack disconnect player is not seated");
  }
  if (!player.connected || player.status === "DISCONNECTED") {
    throw new Error("Blackjack player is already disconnected");
  }

  const existing = registry.records.find(
    (record) => record.playerId === input.playerId,
  );
  if (existing) {
    throw new Error("Blackjack reconnect record already exists for player");
  }

  const record: BlackjackReconnectRecord = Object.freeze({
    playerId: player.playerId,
    userId: player.userId,
    sessionId: player.sessionId,
    previousStatus: player.status,
    disconnectedAtMs: input.nowMs,
    expiresAtMs: safeAddMs(input.nowMs, BLACKJACK_RECONNECT_GRACE_MS),
  });

  const players = Object.freeze(
    table.players.map((candidate) =>
      candidate.playerId === player.playerId
        ? Object.freeze({
            ...candidate,
            status: "DISCONNECTED" as const,
            connected: false,
            disconnectedAtMs: input.nowMs,
          })
        : candidate,
    ),
  );

  return Object.freeze({
    table: Object.freeze({
      ...table,
      players,
      stateVersion: nextStateVersion(table),
    }),
    registry: freezeRegistry([...registry.records, record]),
  });
}

export function reconnectBlackjackPlayer(
  table: BlackjackTable,
  registry: BlackjackReconnectRegistry,
  input: {
    playerId: BlackjackPlayerId;
    userId: BlackjackUserId;
    sessionId: BlackjackSessionId;
    nowMs: number;
  },
): BlackjackReconnectMutation {
  assertNowMs(input.nowMs);
  assertNonEmptyId("playerId", input.playerId);
  assertNonEmptyId("userId", input.userId);
  assertNonEmptyId("sessionId", input.sessionId);

  const record = registry.records.find(
    (candidate) => candidate.playerId === input.playerId,
  );
  if (!record) {
    throw new Error("Blackjack reconnect record does not exist");
  }
  if (record.userId !== input.userId) {
    throw new Error("Blackjack reconnect userId does not match");
  }
  if (record.sessionId !== input.sessionId) {
    throw new Error("Blackjack reconnect sessionId does not match");
  }
  if (input.nowMs > record.expiresAtMs) {
    throw new Error("Blackjack reconnect grace has expired");
  }

  const player = table.players.find(
    (candidate) => candidate.playerId === input.playerId,
  );
  if (!player) {
    throw new Error("Blackjack reconnect player is no longer seated");
  }
  if (
    player.connected ||
    player.status !== "DISCONNECTED" ||
    player.disconnectedAtMs !== record.disconnectedAtMs
  ) {
    throw new Error("Blackjack reconnect table state does not match registry");
  }
  if (
    player.userId !== record.userId ||
    player.sessionId !== record.sessionId ||
    player.seatNumber !==
      table.seats.find((seat) => seat.playerId === player.playerId)?.seatNumber
  ) {
    throw new Error("Blackjack reconnect seat identity is inconsistent");
  }

  const players = Object.freeze(
    table.players.map((candidate) =>
      candidate.playerId === player.playerId
        ? Object.freeze({
            ...candidate,
            status: record.previousStatus,
            connected: true,
            disconnectedAtMs: null,
          })
        : candidate,
    ),
  );

  return Object.freeze({
    table: Object.freeze({
      ...table,
      players,
      stateVersion: nextStateVersion(table),
    }),
    registry: freezeRegistry(
      registry.records.filter(
        (candidate) => candidate.playerId !== player.playerId,
      ),
    ),
  });
}

function standDisconnectedCurrentHand(
  round: BlackjackRound,
  nowMs: number,
): BlackjackRound {
  if (round.currentTurn === null) {
    throw new Error("Blackjack disconnected Auto Stand requires currentTurn");
  }

  const handIndex = round.hands.findIndex(
    (hand) => hand.handId === round.currentTurn?.handId,
  );
  if (handIndex < 0) {
    throw new Error("Blackjack disconnected current hand does not exist");
  }

  const hand = round.hands[handIndex];
  if (hand.status !== "ACTIVE") {
    throw new Error("Blackjack disconnected Auto Stand requires ACTIVE hand");
  }

  const hands = Object.freeze(
    round.hands.map((candidate, index) =>
      index === handIndex
        ? Object.freeze({ ...candidate, status: "STOOD" as const })
        : candidate,
    ),
  );

  return advanceBlackjackTurnAfterHandResolution(
    Object.freeze({
      ...round,
      hands,
    }),
    nowMs,
  );
}

export type BlackjackDisconnectedTurnPolicyResult = Readonly<{
  table: BlackjackTable;
  registry: BlackjackReconnectRegistry;
  autoStood: boolean;
  reason: "NONE" | "TURN_TIMEOUT" | "RECONNECT_GRACE_EXPIRED";
}>;

export function applyBlackjackDisconnectedTurnPolicy(
  table: BlackjackTable,
  registry: BlackjackReconnectRegistry,
  nowMs: number,
): BlackjackDisconnectedTurnPolicyResult {
  assertNowMs(nowMs);

  const round = table.round;
  if (
    table.phase !== "PLAYER_TURNS" ||
    round === null ||
    round.phase !== "PLAYER_TURNS" ||
    round.currentTurn === null
  ) {
    return Object.freeze({
      table,
      registry,
      autoStood: false,
      reason: "NONE" as const,
    });
  }

  const hand = round.hands.find(
    (candidate) => candidate.handId === round.currentTurn?.handId,
  );
  if (!hand) {
    throw new Error("Blackjack disconnected turn hand is missing");
  }

  const player = table.players.find(
    (candidate) => candidate.playerId === hand.playerId,
  );
  if (!player) {
    throw new Error("Blackjack disconnected turn player is missing");
  }
  if (player.connected || player.status !== "DISCONNECTED") {
    return Object.freeze({
      table,
      registry,
      autoStood: false,
      reason: "NONE" as const,
    });
  }

  const record = registry.records.find(
    (candidate) => candidate.playerId === player.playerId,
  );
  if (!record) {
    throw new Error("Blackjack disconnected player has no reconnect record");
  }

  const turnTimedOut = nowMs >= round.currentTurn.endsAtMs;
  const graceExpired = nowMs >= record.expiresAtMs;

  if (!turnTimedOut && !graceExpired) {
    return Object.freeze({
      table,
      registry,
      autoStood: false,
      reason: "NONE" as const,
    });
  }

  const nextRound = turnTimedOut
    ? applyBlackjackTurnTimeout(round, nowMs)
    : standDisconnectedCurrentHand(round, nowMs);

  return Object.freeze({
    table: Object.freeze({
      ...table,
      phase: nextRound.phase,
      round: nextRound,
      stateVersion: nextStateVersion(table),
    }),
    registry: graceExpired
      ? freezeRegistry(
          registry.records.filter(
            (candidate) => candidate.playerId !== player.playerId,
          ),
        )
      : registry,
    autoStood: true,
    reason: turnTimedOut
      ? ("TURN_TIMEOUT" as const)
      : ("RECONNECT_GRACE_EXPIRED" as const),
  });
}
