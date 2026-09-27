import { createHash } from "node:crypto";
import type { BlackjackActionProtocolState } from "./actionProtocol";
import type { BlackjackBettingPosition } from "./betting";
import type { BlackjackTable } from "./domain";
import type { BlackjackReconnectRegistry } from "./reconnect";
import {
  assertBlackjackReservationWalletConsistency,
  type BlackjackReservationBook,
} from "./reservations";
import { assertCanonicalBlackjackSeats } from "./seats";
import { validateBlackjackShoeComposition } from "./shoe";
import type { BlackjackWalletLedgerState } from "./walletLedger";

export const BLACKJACK_DURABLE_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type BlackjackDurableRuntimeState = Readonly<{
  table: BlackjackTable;
  actionProtocol: BlackjackActionProtocolState;
  reconnectRegistry: BlackjackReconnectRegistry;
  wallets: readonly BlackjackWalletLedgerState[];
  reservationBooks: readonly BlackjackReservationBook[];
  bettingPositions: readonly BlackjackBettingPosition[];
}>;

export type BlackjackDurableSnapshot = Readonly<{
  schemaVersion: typeof BLACKJACK_DURABLE_SNAPSHOT_SCHEMA_VERSION;
  tableId: string;
  stateVersion: number;
  eventSequence: number;
  savedAtMs: number;
  checksum: string;
  payload: BlackjackDurableRuntimeState;
}>;

function assertNonEmptyId(label: string, value: string): void {
  if (!value.trim()) {
    throw new RangeError("Blackjack " + label + " must be a non-empty string");
  }
}

function assertSafeNonNegative(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack " + label + " must be a non-negative safe integer",
    );
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    "{" +
    keys
      .map((key) => JSON.stringify(key) + ":" + canonicalJson(record[key]))
      .join(",") +
    "}"
  );
}

function snapshotChecksum(input: {
  schemaVersion: number;
  tableId: string;
  stateVersion: number;
  eventSequence: number;
  savedAtMs: number;
  payload: BlackjackDurableRuntimeState;
}): string {
  return createHash("sha256")
    .update(canonicalJson(input))
    .digest("hex");
}

function assertUniqueStrings(label: string, values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error("Blackjack snapshot contains duplicate " + label);
  }
}

export function assertBlackjackDurableRuntimeState(
  runtime: BlackjackDurableRuntimeState,
): void {
  const table = runtime.table;

  assertNonEmptyId("tableId", table.tableId);
  assertSafeNonNegative("stateVersion", table.stateVersion);
  assertSafeNonNegative("eventSequence", table.eventSequence);
  assertCanonicalBlackjackSeats(table.seats);

  if (!validateBlackjackShoeComposition(table.shoe.cards)) {
    throw new Error("Blackjack snapshot shoe composition is invalid");
  }
  if (
    !Number.isSafeInteger(table.shoe.nextIndex) ||
    table.shoe.nextIndex < 0 ||
    table.shoe.nextIndex > table.shoe.cards.length
  ) {
    throw new Error("Blackjack snapshot shoe cursor is invalid");
  }

  assertUniqueStrings(
    "playerId values",
    table.players.map((player) => player.playerId),
  );
  assertUniqueStrings(
    "userId values",
    table.players.map((player) => player.userId),
  );
  assertUniqueStrings(
    "sessionId values",
    table.players.map((player) => player.sessionId),
  );

  for (const player of table.players) {
    const seat = table.seats.find(
      (candidate) => candidate.seatNumber === player.seatNumber,
    );
    if (!seat || seat.playerId !== player.playerId) {
      throw new Error("Blackjack snapshot player/seat mapping is inconsistent");
    }
  }

  for (const seat of table.seats) {
    if (
      seat.playerId !== null &&
      !table.players.some((player) => player.playerId === seat.playerId)
    ) {
      throw new Error("Blackjack snapshot seat references a missing player");
    }
  }

  if (table.round === null) {
    if (
      table.phase === "BETTING" ||
      table.phase === "BETTING_LOCKED" ||
      table.phase === "INITIAL_DEAL" ||
      table.phase === "PLAYER_TURNS" ||
      table.phase === "DEALER_TURN" ||
      table.phase === "SETTLEMENT" ||
      table.phase === "ROUND_END"
    ) {
      throw new Error("Blackjack snapshot round phase requires a round");
    }
  } else {
    if (table.phase !== table.round.phase && table.phase !== "RECOVERING") {
      throw new Error("Blackjack snapshot table/round phase mismatch");
    }

    assertUniqueStrings(
      "handId values",
      table.round.hands.map((hand) => hand.handId),
    );

    for (const hand of table.round.hands) {
      const player = table.players.find(
        (candidate) => candidate.playerId === hand.playerId,
      );
      if (!player || player.seatNumber !== hand.seatNumber) {
        throw new Error("Blackjack snapshot hand owner is inconsistent");
      }
    }

    if (table.round.currentTurn !== null) {
      const hand = table.round.hands.find(
        (candidate) =>
          candidate.handId === table.round?.currentTurn?.handId,
      );
      if (
        !hand ||
        hand.seatNumber !== table.round.currentTurn.seatNumber ||
        hand.status !== "ACTIVE"
      ) {
        throw new Error("Blackjack snapshot currentTurn is inconsistent");
      }
    }
  }

  assertUniqueStrings(
    "action receipt IDs",
    runtime.actionProtocol.receipts.map((receipt) => receipt.actionId),
  );
  for (const receipt of runtime.actionProtocol.receipts) {
    if (
      !Number.isSafeInteger(receipt.resultingStateVersion) ||
      receipt.resultingStateVersion < 0 ||
      receipt.resultingStateVersion > table.stateVersion
    ) {
      throw new Error("Blackjack snapshot action receipt stateVersion is invalid");
    }
  }

  assertUniqueStrings(
    "reconnect player IDs",
    runtime.reconnectRegistry.records.map((record) => record.playerId),
  );
  for (const record of runtime.reconnectRegistry.records) {
    const player = table.players.find(
      (candidate) => candidate.playerId === record.playerId,
    );
    if (
      !player ||
      player.userId !== record.userId ||
      player.sessionId !== record.sessionId ||
      player.status !== "DISCONNECTED" ||
      player.connected ||
      player.disconnectedAtMs !== record.disconnectedAtMs ||
      record.expiresAtMs < record.disconnectedAtMs
    ) {
      throw new Error("Blackjack snapshot reconnect record is inconsistent");
    }
  }

  assertUniqueStrings(
    "wallet user IDs",
    runtime.wallets.map((wallet) => wallet.userId),
  );
  assertUniqueStrings(
    "reservation book user IDs",
    runtime.reservationBooks.map((book) => book.userId),
  );

  const wallets = new Map(runtime.wallets.map((wallet) => [wallet.userId, wallet]));
  const books = new Map(
    runtime.reservationBooks.map((book) => [book.userId, book]),
  );

  if (wallets.size !== books.size) {
    throw new Error("Blackjack snapshot wallet/book count mismatch");
  }

  for (const [userId, wallet] of wallets) {
    const book = books.get(userId);
    if (!book) {
      throw new Error("Blackjack snapshot wallet is missing reservation book");
    }
    assertBlackjackReservationWalletConsistency(wallet, book);
  }

  assertUniqueStrings(
    "betting player IDs",
    runtime.bettingPositions.map((position) => position.playerId),
  );
  for (const position of runtime.bettingPositions) {
    const player = table.players.find(
      (candidate) => candidate.playerId === position.playerId,
    );
    if (
      !player ||
      player.userId !== position.userId ||
      player.seatNumber !== position.seatNumber
    ) {
      throw new Error("Blackjack snapshot betting position owner mismatch");
    }
    if (table.round === null || table.round.roundId !== position.roundId) {
      throw new Error("Blackjack snapshot betting position round mismatch");
    }
  }
}

function cloneRuntime(
  runtime: BlackjackDurableRuntimeState,
): BlackjackDurableRuntimeState {
  return JSON.parse(JSON.stringify(runtime)) as BlackjackDurableRuntimeState;
}

export function createBlackjackDurableSnapshot(
  runtime: BlackjackDurableRuntimeState,
  savedAtMs: number,
): BlackjackDurableSnapshot {
  assertSafeNonNegative("savedAtMs", savedAtMs);
  assertBlackjackDurableRuntimeState(runtime);

  const payload = cloneRuntime(runtime);
  const base = {
    schemaVersion: BLACKJACK_DURABLE_SNAPSHOT_SCHEMA_VERSION,
    tableId: payload.table.tableId,
    stateVersion: payload.table.stateVersion,
    eventSequence: payload.table.eventSequence,
    savedAtMs,
    payload,
  };

  return Object.freeze({
    ...base,
    checksum: snapshotChecksum(base),
  });
}

export function verifyBlackjackDurableSnapshot(
  snapshot: BlackjackDurableSnapshot,
): BlackjackDurableRuntimeState {
  if (snapshot.schemaVersion !== BLACKJACK_DURABLE_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error("Blackjack snapshot schema version is unsupported");
  }

  assertNonEmptyId("snapshot tableId", snapshot.tableId);
  assertSafeNonNegative("snapshot stateVersion", snapshot.stateVersion);
  assertSafeNonNegative("snapshot eventSequence", snapshot.eventSequence);
  assertSafeNonNegative("snapshot savedAtMs", snapshot.savedAtMs);

  if (
    snapshot.tableId !== snapshot.payload.table.tableId ||
    snapshot.stateVersion !== snapshot.payload.table.stateVersion ||
    snapshot.eventSequence !== snapshot.payload.table.eventSequence
  ) {
    throw new Error("Blackjack snapshot metadata does not match payload");
  }

  const expected = snapshotChecksum({
    schemaVersion: snapshot.schemaVersion,
    tableId: snapshot.tableId,
    stateVersion: snapshot.stateVersion,
    eventSequence: snapshot.eventSequence,
    savedAtMs: snapshot.savedAtMs,
    payload: snapshot.payload,
  });

  if (snapshot.checksum !== expected) {
    throw new Error("Blackjack snapshot checksum mismatch");
  }

  assertBlackjackDurableRuntimeState(snapshot.payload);
  return cloneRuntime(snapshot.payload);
}

export function parseBlackjackDurableSnapshot(
  value: unknown,
): BlackjackDurableSnapshot {
  if (typeof value !== "object" || value === null) {
    throw new Error("Blackjack snapshot payload is not an object");
  }

  const candidate = value as Partial<BlackjackDurableSnapshot>;
  if (
    candidate.schemaVersion !== BLACKJACK_DURABLE_SNAPSHOT_SCHEMA_VERSION ||
    typeof candidate.tableId !== "string" ||
    typeof candidate.stateVersion !== "number" ||
    typeof candidate.eventSequence !== "number" ||
    typeof candidate.savedAtMs !== "number" ||
    typeof candidate.checksum !== "string" ||
    typeof candidate.payload !== "object" ||
    candidate.payload === null
  ) {
    throw new Error("Blackjack snapshot payload shape is invalid");
  }

  const snapshot = candidate as BlackjackDurableSnapshot;
  verifyBlackjackDurableSnapshot(snapshot);
  return snapshot;
}
