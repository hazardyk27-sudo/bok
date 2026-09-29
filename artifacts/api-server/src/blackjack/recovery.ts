import type {
  BlackjackPlayer,
  BlackjackTablePhase,
} from "./domain";
import type { BlackjackJournalRecord } from "./journal";
import { verifyBlackjackJournalRecord } from "./journal";
import type { BlackjackJournalRepository } from "./journalRepository";
import {
  BLACKJACK_RECONNECT_GRACE_MS,
  inferBlackjackReconnectStatus,
  type BlackjackReconnectRecord,
  type BlackjackReconnectRegistry,
} from "./reconnect";
import type { BlackjackSnapshotRepository } from "./snapshotRepository";
import {
  verifyBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";

export type BlackjackRecoveryResult = Readonly<{
  runtime: BlackjackDurableRuntimeState;
  resumePhase: BlackjackTablePhase;
  snapshotEventSequence: number;
  snapshotStateVersion: number;
  journalEventsApplied: number;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Blackjack recovery nowMs must be a non-negative safe integer",
    );
  }
}

function safeAddMs(startMs: number, durationMs: number): number {
  const result = startMs + durationMs;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Blackjack recovery reconnect deadline overflow");
  }
  return result;
}

function nextStateVersion(stateVersion: number): number {
  if (
    !Number.isSafeInteger(stateVersion) ||
    stateVersion < 0 ||
    stateVersion >= Number.MAX_SAFE_INTEGER
  ) {
    throw new RangeError("Blackjack recovery stateVersion cannot advance safely");
  }
  return stateVersion + 1;
}

function applyJournalTail(
  initial: BlackjackDurableRuntimeState,
  records: readonly BlackjackJournalRecord[],
): BlackjackDurableRuntimeState {
  let runtime = initial;
  let expectedEventSequence = initial.table.eventSequence + 1;
  let previousStateVersion = initial.table.stateVersion;

  for (const record of records) {
    if (
      record.tableId !== runtime.table.tableId ||
      record.eventSequence !== expectedEventSequence
    ) {
      throw new Error(
        "Blackjack recovery journal is not contiguous with recovered state",
      );
    }

    const runtimeAfter = verifyBlackjackJournalRecord(record);
    if (runtimeAfter.table.stateVersion < previousStateVersion) {
      throw new Error("Blackjack recovery journal stateVersion moved backwards");
    }

    runtime = runtimeAfter;
    previousStateVersion = runtime.table.stateVersion;
    expectedEventSequence += 1;

    if (!Number.isSafeInteger(expectedEventSequence)) {
      throw new RangeError("Blackjack recovery eventSequence overflow");
    }
  }

  return runtime;
}

function makeRestartDisconnectedState(
  runtime: BlackjackDurableRuntimeState,
  recoveredAtMs: number,
): BlackjackDurableRuntimeState {
  const existingRecords = new Map(
    runtime.reconnectRegistry.records.map((record) => [
      record.playerId,
      record,
    ]),
  );

  const records: BlackjackReconnectRecord[] = [
    ...runtime.reconnectRegistry.records,
  ];

  const players: BlackjackPlayer[] = runtime.table.players.map((player) => {
    if (player.status === "DISCONNECTED") {
      const record = existingRecords.get(player.playerId);
      if(!record){
        if(player.disconnectedAtMs===null){
          throw new Error(
            "Blackjack recovery found disconnected player without disconnectedAtMs",
          );
        }
        const healed: BlackjackReconnectRecord=Object.freeze({
          playerId:player.playerId,
          userId:player.userId,
          sessionId:player.sessionId,
          previousStatus:inferBlackjackReconnectStatus(
            runtime.table,
            player.playerId,
          ),
          disconnectedAtMs:player.disconnectedAtMs,
          expiresAtMs:safeAddMs(
            player.disconnectedAtMs,
            BLACKJACK_RECONNECT_GRACE_MS,
          ),
          roundId:runtime.table.round?.roundId ?? null,
        });
        records.push(healed);
        existingRecords.set(player.playerId,healed);
      }
      return player;
    }

    if (!player.connected) {
      throw new Error(
        "Blackjack recovery found non-disconnected player marked offline",
      );
    }

    const record: BlackjackReconnectRecord = Object.freeze({
      playerId: player.playerId,
      userId: player.userId,
      sessionId: player.sessionId,
      previousStatus: player.status,
      disconnectedAtMs: recoveredAtMs,
      expiresAtMs: safeAddMs(
        recoveredAtMs,
        BLACKJACK_RECONNECT_GRACE_MS,
      ),
      roundId:runtime.table.round?.roundId ?? null,
    });
    records.push(record);

    return Object.freeze({
      ...player,
      status: "DISCONNECTED" as const,
      connected: false,
      disconnectedAtMs: recoveredAtMs,
    });
  });

  const reconnectRegistry: BlackjackReconnectRegistry = Object.freeze({
    records: Object.freeze(records.map((record) => Object.freeze({ ...record }))),
  });

  return Object.freeze({
    ...runtime,
    table: Object.freeze({
      ...runtime.table,
      phase: "RECOVERING" as const,
      players: Object.freeze(players),
      stateVersion: nextStateVersion(runtime.table.stateVersion),
    }),
    reconnectRegistry,
  });
}

export async function recoverBlackjackRuntime(
  tableId: string,
  snapshotRepository: Pick<BlackjackSnapshotRepository, "load">,
  journalRepository: Pick<BlackjackJournalRepository, "loadAfter">,
  recoveredAtMs: number,
): Promise<BlackjackRecoveryResult | null> {
  if (!tableId.trim()) {
    throw new RangeError("Blackjack recovery tableId must be non-empty");
  }
  assertNowMs(recoveredAtMs);

  const snapshot = await snapshotRepository.load(tableId);
  if (!snapshot) return null;

  const snapshotRuntime = verifyBlackjackDurableSnapshot(snapshot);
  if (snapshotRuntime.table.tableId !== tableId) {
    throw new Error("Blackjack recovery snapshot belongs to another table");
  }

  const records = await journalRepository.loadAfter(
    tableId,
    snapshot.eventSequence,
  );
  const current = applyJournalTail(snapshotRuntime, records);
  const resumePhase = current.table.phase;

  return Object.freeze({
    runtime: makeRestartDisconnectedState(current, recoveredAtMs),
    resumePhase,
    snapshotEventSequence: snapshot.eventSequence,
    snapshotStateVersion: snapshot.stateVersion,
    journalEventsApplied: records.length,
  });
}

export function resumeBlackjackRecoveredRuntime(
  recovery: BlackjackRecoveryResult,
): BlackjackDurableRuntimeState {
  if (recovery.runtime.table.phase !== "RECOVERING") {
    throw new Error("Blackjack recovery can resume only from RECOVERING");
  }

  const round = recovery.runtime.table.round;
  if (
    round !== null &&
    recovery.resumePhase !== round.phase &&
    recovery.resumePhase !== "RECOVERING"
  ) {
    throw new Error("Blackjack recovery resume phase does not match round");
  }

  return Object.freeze({
    ...recovery.runtime,
    table: Object.freeze({
      ...recovery.runtime.table,
      phase: recovery.resumePhase,
      stateVersion: nextStateVersion(recovery.runtime.table.stateVersion),
    }),
  });
}
