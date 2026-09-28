import type { IncomingMessage, Server } from "node:http";
import {
  attachBlackjackWebSocket,
  type BlackjackRealtimeIdentity,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import {
  recoverAndStartBlackjackRoundRuntime,
  type BlackjackRecoveredScheduledRuntime,
} from "./runtimeRecovery";
import type { BlackjackShoe, BlackjackTable } from "./domain";
import type { BlackjackCoordinatorAccount } from "./actionCoordinator";
import type { BlackjackJournalRepository } from "./journalRepository";
import {
  BlackjackSnapshotConflictError,
  type BlackjackSnapshotRepository,
} from "./snapshotRepository";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackTableFoundation } from "./seats";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";
import type { BlackjackRoundSchedulerOptions } from "./roundScheduler";

export type BlackjackServerRuntimeReadiness = Readonly<{
  ready: boolean;
  status:
    | "READY"
    | "RUNTIME_CLOSED"
    | "SCHEDULER_STOPPED"
    | "AUTHORITY_FAILED";
  tableId: string;
  phase: BlackjackTable["phase"];
  stateVersion: number;
  eventSequence: number;
  schedulerRunning: boolean;
  authorityHealthy: boolean;
}>;

export type BlackjackAttachedServerRuntime = Readonly<{
  scheduled: BlackjackRecoveredScheduledRuntime;
  realtime: BlackjackRealtimeRuntime;
  getReadiness: () => BlackjackServerRuntimeReadiness;
  close: () => void;
}>;

export type BlackjackIdentityResolver = (
  request: IncomingMessage,
) =>
  | BlackjackRealtimeIdentity
  | null
  | Promise<BlackjackRealtimeIdentity | null>;

export function attachBlackjackScheduledServerRuntime(
  server: Server,
  scheduled: BlackjackRecoveredScheduledRuntime,
  input: {
    resolveIdentity: BlackjackIdentityResolver;
    nowMs?: () => number;
    createConnectionId?: () => string;
  },
): BlackjackAttachedServerRuntime {
  let closed=false;

  const realtime=attachBlackjackWebSocket(
    server,
    scheduled.authority.source,
    {
      ...scheduled.realtimeOptions,
      resolveIdentity:input.resolveIdentity,
      nowMs:input.nowMs,
      createConnectionId:input.createConnectionId,
    },
  );

  const getReadiness=(): BlackjackServerRuntimeReadiness => {
    const table=scheduled.coordinator.getTable();
    const schedulerRunning=scheduled.scheduler.isRunning();
    const authorityHealthy=scheduled.authority.fatalError()===null;
    const status=
      closed
        ? "RUNTIME_CLOSED" as const
        : !authorityHealthy
          ? "AUTHORITY_FAILED" as const
          : !schedulerRunning
            ? "SCHEDULER_STOPPED" as const
            : "READY" as const;

    return Object.freeze({
      ready:status==="READY",
      status,
      tableId:table.tableId,
      phase:table.phase,
      stateVersion:table.stateVersion,
      eventSequence:table.eventSequence,
      schedulerRunning,
      authorityHealthy,
    });
  };

  return Object.freeze({
    scheduled,
    realtime,
    getReadiness,
    close:()=>{
      if(closed) return;
      closed=true;
      // Close WebSocket transport first. Its intentional shutdown path
      // suppresses disconnect lifecycle mutations, then stop the scheduler.
      realtime.close();
      scheduled.stop();
    },
  });
}

export async function recoverAndAttachBlackjackServerRuntime(input: {
  server: Server;
  tableId: string;
  snapshotRepository: Pick<
    BlackjackSnapshotRepository,
    "load" | "save"
  >;
  journalRepository: Pick<BlackjackJournalRepository,"loadAfter">;
  recoveredAtMs: number;
  nowMs: () => number;
  resolveIdentity: BlackjackIdentityResolver;
  createFreshShoe?: () => BlackjackShoe;
  bettingWindowMs?: number;
  scheduler?: BlackjackRoundSchedulerOptions;
  createConnectionId?: () => string;
  loadSeatAccount?: (
    identity: BlackjackRealtimeIdentity,
  ) =>
    | BlackjackCoordinatorAccount
    | Promise<BlackjackCoordinatorAccount>;
}): Promise<BlackjackAttachedServerRuntime | null> {
  const scheduled=await recoverAndStartBlackjackRoundRuntime({
    tableId:input.tableId,
    snapshotRepository:input.snapshotRepository,
    journalRepository:input.journalRepository,
    recoveredAtMs:input.recoveredAtMs,
    nowMs:input.nowMs,
    createFreshShoe:input.createFreshShoe,
    bettingWindowMs:input.bettingWindowMs,
    scheduler:input.scheduler,
    loadSeatAccount:input.loadSeatAccount,
  });
  if(scheduled===null) return null;

  return attachBlackjackScheduledServerRuntime(
    input.server,
    scheduled,
    {
      resolveIdentity:input.resolveIdentity,
      nowMs:input.nowMs,
      createConnectionId:input.createConnectionId,
    },
  );
}


export function createBlackjackInitialServerRuntimeState(input: {
  tableId: string;
  shoe: BlackjackShoe;
}): BlackjackDurableRuntimeState {
  return Object.freeze({
    table:createBlackjackTableFoundation({
      tableId:input.tableId,
      shoe:input.shoe,
    }),
    actionProtocol:createBlackjackActionProtocolState(),
    reconnectRegistry:createBlackjackReconnectRegistry(),
    wallets:Object.freeze([]),
    reservationBooks:Object.freeze([]),
    bettingPositions:Object.freeze([]),
  });
}

export async function initializeAndAttachBlackjackServerRuntime(input: {
  server: Server;
  tableId: string;
  snapshotRepository: Pick<
    BlackjackSnapshotRepository,
    "load" | "save"
  >;
  journalRepository: Pick<BlackjackJournalRepository,"loadAfter">;
  recoveredAtMs: number;
  nowMs: () => number;
  resolveIdentity: BlackjackIdentityResolver;
  createInitialShoe: () => BlackjackShoe;
  createFreshShoe?: () => BlackjackShoe;
  bettingWindowMs?: number;
  scheduler?: BlackjackRoundSchedulerOptions;
  createConnectionId?: () => string;
  loadSeatAccount?: (
    identity: BlackjackRealtimeIdentity,
  ) =>
    | BlackjackCoordinatorAccount
    | Promise<BlackjackCoordinatorAccount>;
}): Promise<BlackjackAttachedServerRuntime> {
  const existing=await input.snapshotRepository.load(input.tableId);

  if(existing===null){
    const initial=createBlackjackDurableSnapshot(
      createBlackjackInitialServerRuntimeState({
        tableId:input.tableId,
        shoe:input.createInitialShoe(),
      }),
      input.recoveredAtMs,
    );

    try {
      await input.snapshotRepository.save(initial,null);
    } catch(error) {
      if(!(error instanceof BlackjackSnapshotConflictError)){
        throw error;
      }
      // Another server won first-start initialization. Recovery below
      // reloads the CAS winner instead of creating a second authority.
    }
  }

  const attached=await recoverAndAttachBlackjackServerRuntime({
    server:input.server,
    tableId:input.tableId,
    snapshotRepository:input.snapshotRepository,
    journalRepository:input.journalRepository,
    recoveredAtMs:input.recoveredAtMs,
    nowMs:input.nowMs,
    resolveIdentity:input.resolveIdentity,
    createFreshShoe:input.createFreshShoe,
    bettingWindowMs:input.bettingWindowMs,
    scheduler:input.scheduler,
    createConnectionId:input.createConnectionId,
    loadSeatAccount:input.loadSeatAccount,
  });

  if(attached===null){
    throw new Error(
      "Blackjack server runtime initialization did not produce durable state",
    );
  }
  return attached;
}
