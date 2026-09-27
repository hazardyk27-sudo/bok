import {
  type BlackjackPlayer,
  type BlackjackPlayerId,
  type BlackjackPlayerStatus,
  type BlackjackSeat,
  type BlackjackSeatNumber,
  type BlackjackTable,
} from "./domain";
import {
  assertCanonicalBlackjackSeats,
  getBlackjackSeat,
  isBlackjackSeatNumber,
} from "./seats";

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError(`Blackjack ${label} must be a non-empty string`);
  }
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

function freezeSeats(seats: readonly BlackjackSeat[]): readonly BlackjackSeat[] {
  const frozen = seats.map((seat) => Object.freeze({ ...seat }));
  assertCanonicalBlackjackSeats(frozen);
  return Object.freeze(frozen);
}

function freezePlayers(
  players: readonly BlackjackPlayer[],
): readonly BlackjackPlayer[] {
  return Object.freeze(
    players.map((player) =>
      Object.freeze({
        ...player,
        handIds: Object.freeze([...player.handIds]),
      }),
    ),
  );
}

function joinedStatus(table: BlackjackTable): BlackjackPlayerStatus {
  return table.phase === "BETTING" ? "BETTING" : "SEATED_WAITING";
}

export function seatBlackjackPlayer(
  table: BlackjackTable,
  input: {
    playerId: string;
    userId: string;
    sessionId: string;
    seatNumber: BlackjackSeatNumber;
  },
): BlackjackTable {
  if (table.phase === "RECOVERING") {
    throw new Error("Blackjack seating is locked while table is RECOVERING");
  }

  assertNonEmptyId("playerId", input.playerId);
  assertNonEmptyId("userId", input.userId);
  assertNonEmptyId("sessionId", input.sessionId);

  if (!isBlackjackSeatNumber(input.seatNumber)) {
    throw new RangeError("Blackjack seatNumber must be between 1 and 5");
  }

  assertCanonicalBlackjackSeats(table.seats);

  const seat = getBlackjackSeat(table.seats, input.seatNumber);
  if (seat.playerId !== null) {
    throw new Error(`Blackjack seat ${input.seatNumber} is already occupied`);
  }

  if (table.players.some((player) => player.playerId === input.playerId)) {
    throw new Error("Blackjack playerId is already seated");
  }
  if (table.players.some((player) => player.userId === input.userId)) {
    throw new Error("Blackjack user is already seated at this table");
  }
  if (table.players.some((player) => player.sessionId === input.sessionId)) {
    throw new Error("Blackjack session is already seated at this table");
  }

  const player: BlackjackPlayer = Object.freeze({
    playerId: input.playerId,
    userId: input.userId,
    sessionId: input.sessionId,
    seatNumber: input.seatNumber,
    status: joinedStatus(table),
    connected: true,
    disconnectedAtMs: null,
    handIds: Object.freeze([]),
  });

  const seats = freezeSeats(
    table.seats.map((candidate) =>
      candidate.seatNumber === input.seatNumber
        ? { ...candidate, playerId: input.playerId }
        : candidate,
    ),
  );

  return Object.freeze({
    ...table,
    seats,
    players: freezePlayers([...table.players, player]),
    stateVersion: nextStateVersion(table),
  });
}

function removePlayerFromTable(
  table: BlackjackTable,
  player: BlackjackPlayer,
): BlackjackTable {
  const seats = freezeSeats(
    table.seats.map((seat) =>
      seat.playerId === player.playerId
        ? { ...seat, playerId: null }
        : seat,
    ),
  );

  return Object.freeze({
    ...table,
    seats,
    players: freezePlayers(
      table.players.filter((candidate) => candidate.playerId !== player.playerId),
    ),
    stateVersion: nextStateVersion(table),
  });
}

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError("Blackjack nowMs must be a non-negative safe integer");
  }
}

export function leaveBlackjackSeat(
  table: BlackjackTable,
  input: {
    playerId: BlackjackPlayerId;
    nowMs: number;
  },
): BlackjackTable {
  assertNowMs(input.nowMs);

  const player = table.players.find(
    (candidate) => candidate.playerId === input.playerId,
  );
  if (!player) {
    throw new Error("Blackjack player is not seated at this table");
  }

  if (player.status === "SEATED_WAITING" && player.handIds.length === 0) {
    return removePlayerFromTable(table, player);
  }

  if (player.status === "DISCONNECTED") {
    return table;
  }

  const players = freezePlayers(
    table.players.map((candidate) =>
      candidate.playerId === player.playerId
        ? {
            ...candidate,
            status: "DISCONNECTED" as const,
            connected: false,
            disconnectedAtMs: input.nowMs,
          }
        : candidate,
    ),
  );

  return Object.freeze({
    ...table,
    players,
    stateVersion: nextStateVersion(table),
  });
}

export function cleanupBlackjackDisconnectedPlayerAfterRound(
  table: BlackjackTable,
  playerId: BlackjackPlayerId,
): BlackjackTable {
  if (table.phase !== "ROUND_END" && table.phase !== "TABLE_IDLE") {
    throw new Error(
      "Blackjack disconnected seat cleanup is allowed only after the round",
    );
  }

  const player = table.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player) {
    throw new Error("Blackjack player is not seated at this table");
  }
  if (player.status !== "DISCONNECTED") {
    throw new Error("Blackjack player is not disconnected");
  }

  return removePlayerFromTable(table, player);
}
