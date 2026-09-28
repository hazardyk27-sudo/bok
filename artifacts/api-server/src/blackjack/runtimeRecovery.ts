import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatorAccount,
} from "./actionCoordinator";
import type { BlackjackReconnectRegistry } from "./reconnect";
import type { BlackjackRealtimeOptions } from "./realtime";
import {
  recoverBlackjackRuntime,
  resumeBlackjackRecoveredRuntime,
  type BlackjackRecoveryResult,
} from "./recovery";
import type {
  BlackjackRoundRealtimeDriver,
} from "./roundRealtime";
import {
  createBlackjackRuntimeAuthority,
  type BlackjackRuntimeAuthority,
} from "./runtimeAuthority";
import {
  startBlackjackRoundScheduler,
  type BlackjackRoundScheduler,
  type BlackjackRoundSchedulerOptions,
} from "./roundScheduler";
import type { BlackjackShoe } from "./domain";
import type { BlackjackJournalRepository } from "./journalRepository";
import type { BlackjackSnapshotRepository } from "./snapshotRepository";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";

export type BlackjackRecoveredScheduledRuntime = Readonly<{
  recovery: BlackjackRecoveryResult;
  coordinator: BlackjackPlayerActionCoordinator;
  authority: BlackjackRuntimeAuthority;
  driver: BlackjackRoundRealtimeDriver;
  scheduler: BlackjackRoundScheduler;
  reconnectRegistry: BlackjackReconnectRegistry;
  realtimeOptions: Pick<
    BlackjackRealtimeOptions,
    | "handlePlayerActionTransaction"
    | "onIdentityConnected"
    | "onIdentityDisconnected"
    | "getPrivatePlayerState"
  >;
  getDurableRuntime: () => BlackjackDurableRuntimeState;
  stop: () => void;
}>;

function buildCoordinatorAccounts(
  runtime: BlackjackDurableRuntimeState,
): readonly BlackjackCoordinatorAccount[] {
  const wallets=new Map(
    runtime.wallets.map((wallet)=>[wallet.userId,wallet] as const),
  );
  const books=new Map(
    runtime.reservationBooks.map((book)=>[book.userId,book] as const),
  );

  return Object.freeze(
    runtime.table.players.map((player)=>{
      const wallet=wallets.get(player.userId);
      const book=books.get(player.userId);
      if(!wallet || !book){
        throw new Error(
          "Blackjack recovered player is missing wallet/reservation state",
        );
      }
      return Object.freeze({
        playerId:player.playerId,
        userId:player.userId,
        wallet,
        book,
      });
    }),
  );
}

function durableRuntimeFromCoordinator(
  coordinator: BlackjackPlayerActionCoordinator,
  reconnectRegistry: BlackjackReconnectRegistry,
): BlackjackDurableRuntimeState {
  const accounts=coordinator.getAccounts();
  return Object.freeze({
    table:coordinator.getTable(),
    actionProtocol:coordinator.getProtocol(),
    reconnectRegistry,
    wallets:Object.freeze(accounts.map((account)=>account.wallet)),
    reservationBooks:Object.freeze(accounts.map((account)=>account.book)),
    bettingPositions:coordinator.getBettingPositions(),
  });
}

export async function recoverAndStartBlackjackRoundRuntime(input: {
  tableId: string;
  snapshotRepository: Pick<
    BlackjackSnapshotRepository,
    "load" | "save"
  >;
  journalRepository: Pick<BlackjackJournalRepository,"loadAfter">;
  recoveredAtMs: number;
  nowMs: () => number;
  createFreshShoe?: () => BlackjackShoe;
  bettingWindowMs?: number;
  scheduler?: BlackjackRoundSchedulerOptions;
}): Promise<BlackjackRecoveredScheduledRuntime | null> {
  const recovery=await recoverBlackjackRuntime(
    input.tableId,
    input.snapshotRepository,
    input.journalRepository,
    input.recoveredAtMs,
  );
  if(recovery===null) return null;

  const resumed=resumeBlackjackRecoveredRuntime(recovery);
  const coordinator=new BlackjackPlayerActionCoordinator({
    table:resumed.table,
    accounts:buildCoordinatorAccounts(resumed),
    protocol:resumed.actionProtocol,
    bettingPositions:resumed.bettingPositions,
    reconnectRegistry:resumed.reconnectRegistry,
  });

  const getDurableRuntime=()=>durableRuntimeFromCoordinator(
    coordinator,
    coordinator.getReconnectRegistry(),
  );

  let persistedStateVersion=recovery.snapshotStateVersion;

  const persist=async(savedAtMs: number)=>{
    const snapshot=createBlackjackDurableSnapshot(
      getDurableRuntime(),
      savedAtMs,
    );
    const saved=await input.snapshotRepository.save(
      snapshot,
      persistedStateVersion,
    );
    persistedStateVersion=saved.stateVersion;
  };

  // Persist RECOVERING -> resumed phase before any timer-driven state can
  // become visible to realtime clients.
  await persist(input.recoveredAtMs);

  let scheduler: BlackjackRoundScheduler | null=null;
  const callerOnError=input.scheduler?.onError;

  const authority=createBlackjackRuntimeAuthority(
    coordinator,
    {
      nowMs:input.nowMs,
      createFreshShoe:input.createFreshShoe,
      bettingWindowMs:input.bettingWindowMs,
      persist,
      onFatalError:(error)=>{
        scheduler?.stop();
        callerOnError?.(error);
      },
    },
  );
  const driver=authority.driver;

  scheduler=startBlackjackRoundScheduler(
    driver,
    {
      ...input.scheduler,
      onError:(error)=>{
        scheduler?.stop();
        callerOnError?.(error);
      },
    },
  );

  // Catch up an already-expired betting/turn deadline immediately after
  // restart instead of waiting for the first interval. Persistence errors
  // are fail-closed: do not return a live recovered runtime that is ahead
  // of durable storage.
  await scheduler.tickNow();
  const catchUpError=scheduler.lastError();
  if(catchUpError!==null){
    scheduler.stop();
    throw catchUpError;
  }

  const activeScheduler=scheduler;
  return Object.freeze({
    recovery,
    coordinator,
    authority,
    driver,
    scheduler:activeScheduler,
    get reconnectRegistry(){
      return coordinator.getReconnectRegistry();
    },
    realtimeOptions:Object.freeze({
      handlePlayerActionTransaction:
        authority.handlePlayerActionTransaction,
      onIdentityConnected:authority.onIdentityConnected,
      onIdentityDisconnected:authority.onIdentityDisconnected,
      getPrivatePlayerState:authority.getPrivatePlayerState,
    }),
    getDurableRuntime,
    stop:()=>activeScheduler.stop(),
  });
}
