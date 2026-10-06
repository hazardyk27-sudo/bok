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
  BlackjackRuntimeLeaseConflictError,
  BlackjackSnapshotConflictError,
  releaseBlackjackRuntimeLeaseEpoch,
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
import {
  isBlackjackRuntimeAuthoritySuppressed,
  resolveBlackjackRuntimeTableId,
} from "./runtimeProcessRole";

export const BLACKJACK_RUNTIME_STANDBY_RETRY_MS = 1_000 as const;
export const BLACKJACK_RUNTIME_STANDBY_FAILURE_CODE =
  "BLACKJACK_RUNTIME_AUTHORITY_STANDBY" as const;

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

export type BlackjackRuntimeBootstrapStatus =
  | "STARTING"
  | "STANDBY"
  | "READY"
  | "DEGRADED"
  | "FAILED"
  | "STOPPED";

export type BlackjackRuntimeBootstrapState = Readonly<{
  ready: boolean;
  status: BlackjackRuntimeBootstrapStatus;
  attempt: number;
  failureCode: string | null;
  runtime: BlackjackServerRuntimeReadiness | null;
}>;

let blackjackRuntimeBootstrapStatus: BlackjackRuntimeBootstrapStatus =
  "STARTING";
let blackjackRuntimeBootstrapAttempt = 0;
let blackjackRuntimeBootstrapFailureCode: string | null = null;
let blackjackRuntimeReadinessSource: BlackjackAttachedServerRuntime | null =
  null;

function assertBlackjackRuntimeAttempt(attempt: number): void {
  if (!Number.isSafeInteger(attempt) || attempt < 0) {
    throw new RangeError(
      "Blackjack runtime bootstrap attempt must be a non-negative safe integer",
    );
  }
}

function assertStandbyRetryMs(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "Blackjack runtime standby retry must be a non-negative safe integer",
    );
  }
}

function isRuntimeAuthorityContention(
  error: unknown,
): error is BlackjackRuntimeLeaseConflictError | BlackjackSnapshotConflictError {
  return (
    error instanceof BlackjackRuntimeLeaseConflictError ||
    error instanceof BlackjackSnapshotConflictError
  );
}

function delayBlackjackRuntimeStandby(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle=setTimeout(resolve,ms);
    handle.unref?.();
  });
}

export function markBlackjackRuntimeStarting(attempt: number): void {
  assertBlackjackRuntimeAttempt(attempt);
  blackjackRuntimeBootstrapAttempt = attempt;
  blackjackRuntimeBootstrapStatus = "STARTING";
  blackjackRuntimeBootstrapFailureCode = null;
  blackjackRuntimeReadinessSource = null;
}

export function markBlackjackRuntimeStandby(): void {
  blackjackRuntimeBootstrapStatus = "STANDBY";
  blackjackRuntimeBootstrapFailureCode =
    BLACKJACK_RUNTIME_STANDBY_FAILURE_CODE;
  blackjackRuntimeReadinessSource = null;
}

export function markBlackjackRuntimeAttached(
  runtime: BlackjackAttachedServerRuntime,
  attempt: number,
): void {
  assertBlackjackRuntimeAttempt(attempt);
  blackjackRuntimeBootstrapAttempt = attempt;
  blackjackRuntimeBootstrapStatus = "READY";
  blackjackRuntimeBootstrapFailureCode = null;
  blackjackRuntimeReadinessSource = runtime;
}

export function markBlackjackRuntimeFailed(attempt: number): void {
  assertBlackjackRuntimeAttempt(attempt);
  blackjackRuntimeBootstrapAttempt = attempt;
  blackjackRuntimeBootstrapStatus = "FAILED";
  blackjackRuntimeBootstrapFailureCode =
    "BLACKJACK_RUNTIME_ATTACH_FAILED";
  blackjackRuntimeReadinessSource = null;
}

export function markBlackjackRuntimeStopped(): void {
  blackjackRuntimeBootstrapStatus = "STOPPED";
  blackjackRuntimeBootstrapFailureCode = null;
  blackjackRuntimeReadinessSource = null;
}

export function getBlackjackRuntimeBootstrapState():
  BlackjackRuntimeBootstrapState {
  const runtime = blackjackRuntimeReadinessSource?.getReadiness() ?? null;

  if (runtime !== null) {
    return Object.freeze({
      ready: runtime.ready,
      status: runtime.ready ? "READY" : "DEGRADED",
      attempt: blackjackRuntimeBootstrapAttempt,
      failureCode: runtime.ready ? null : runtime.status,
      runtime,
    });
  }

  return Object.freeze({
    ready: false,
    status: blackjackRuntimeBootstrapStatus,
    attempt: blackjackRuntimeBootstrapAttempt,
    failureCode: blackjackRuntimeBootstrapFailureCode,
    runtime: null,
  });
}

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
  loadAvailableBalanceCents?: (
    userId: string,
  ) => number | Promise<number>;
  onRuntimeUnavailable?: (error: unknown) => void;
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
    loadAvailableBalanceCents:input.loadAvailableBalanceCents,
    onFatalError:input.onRuntimeUnavailable,
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
  loadAvailableBalanceCents?: (
    userId: string,
  ) => number | Promise<number>;
  onRuntimeUnavailable?: (error: unknown) => void;
  standbyRetryMs?: number;
  standbyDelay?: (ms: number) => Promise<void>;
  authoritySuppressed?: () => boolean;
}): Promise<BlackjackAttachedServerRuntime> {
  const standbyRetryMs=
    input.standbyRetryMs ?? BLACKJACK_RUNTIME_STANDBY_RETRY_MS;
  assertStandbyRetryMs(standbyRetryMs);
  const standbyDelay=input.standbyDelay ?? delayBlackjackRuntimeStandby;
  const authoritySuppressed=
    input.authoritySuppressed ?? isBlackjackRuntimeAuthoritySuppressed;
  const runtimeTableId=resolveBlackjackRuntimeTableId(input.tableId);

  while(true){
    if(authoritySuppressed()){
      markBlackjackRuntimeStandby();
      await standbyDelay(standbyRetryMs);
      continue;
    }

    const recoveredAtMs=Math.max(input.recoveredAtMs,input.nowMs());

    try {
      const existing=await input.snapshotRepository.load(runtimeTableId);

      if(existing===null){
        const initial=createBlackjackDurableSnapshot(
          createBlackjackInitialServerRuntimeState({
            tableId:runtimeTableId,
            shoe:input.createInitialShoe(),
          }),
          recoveredAtMs,
        );

        try {
          await input.snapshotRepository.save(initial,null);
        } catch(error) {
          if(!isRuntimeAuthorityContention(error)){
            throw error;
          }
          releaseBlackjackRuntimeLeaseEpoch(runtimeTableId);
          markBlackjackRuntimeStandby();
          await standbyDelay(standbyRetryMs);
          continue;
        }
      }

      const attached=await recoverAndAttachBlackjackServerRuntime({
        server:input.server,
        tableId:runtimeTableId,
        snapshotRepository:input.snapshotRepository,
        journalRepository:input.journalRepository,
        recoveredAtMs,
        nowMs:input.nowMs,
        resolveIdentity:input.resolveIdentity,
        createFreshShoe:input.createFreshShoe,
        bettingWindowMs:input.bettingWindowMs,
        scheduler:input.scheduler,
        createConnectionId:input.createConnectionId,
        loadSeatAccount:input.loadSeatAccount,
        loadAvailableBalanceCents:input.loadAvailableBalanceCents,
        onRuntimeUnavailable:input.onRuntimeUnavailable,
      });

      if(attached===null){
        throw new Error(
          "Blackjack server runtime initialization did not produce durable state",
        );
      }
      return attached;
    } catch(error) {
      if(!isRuntimeAuthorityContention(error)){
        throw error;
      }

      releaseBlackjackRuntimeLeaseEpoch(runtimeTableId);
      markBlackjackRuntimeStandby();
      await standbyDelay(standbyRetryMs);
    }
  }
}
