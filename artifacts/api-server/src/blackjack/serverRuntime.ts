import type { Server } from "node:http";
import {
  attachBlackjackWebSocket,
  type BlackjackRealtimeIdentity,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import {
  recoverAndStartBlackjackRoundRuntime,
  type BlackjackRecoveredScheduledRuntime,
} from "./runtimeRecovery";
import type { BlackjackShoe } from "./domain";
import type { BlackjackJournalRepository } from "./journalRepository";
import type { BlackjackSnapshotRepository } from "./snapshotRepository";
import type { BlackjackRoundSchedulerOptions } from "./roundScheduler";

export type BlackjackAttachedServerRuntime = Readonly<{
  scheduled: BlackjackRecoveredScheduledRuntime;
  realtime: BlackjackRealtimeRuntime;
  close: () => void;
}>;

export type BlackjackIdentityResolver = (
  request: Parameters<
    NonNullable<
      Parameters<typeof attachBlackjackWebSocket>[2]["resolveIdentity"]
    >
  >[0],
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

  return Object.freeze({
    scheduled,
    realtime,
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
