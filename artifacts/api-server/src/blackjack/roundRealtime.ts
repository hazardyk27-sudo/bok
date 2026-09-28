import type {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type { BlackjackShoe, BlackjackTable } from "./domain";
import {
  buildBlackjackPublicSnapshot,
  type BlackjackPublicSnapshot,
} from "./publicSnapshot";
import type { BlackjackRealtimeSource } from "./realtime";
import {
  runBlackjackRoundRuntimeTick,
  type BlackjackRoundRuntimeTickResult,
} from "./roundRuntime";

export type BlackjackCoordinatorRealtimeSource =
  BlackjackRealtimeSource &
  Readonly<{
    publishTable: (
      table: BlackjackTable,
      serverTimeMs: number,
    ) => BlackjackPublicSnapshot;
  }>;

export type BlackjackRoundRealtimeDriver = Readonly<{
  source: BlackjackCoordinatorRealtimeSource;
  tick: () => Promise<BlackjackRoundRuntimeTickResult>;
}>;

function assertNowMs(nowMs: number): void {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Blackjack realtime round driver nowMs must be non-negative",
    );
  }
}

export function createBlackjackCoordinatorRealtimeSource(
  coordinator: BlackjackPlayerActionCoordinator,
  input: {
    nowMs: () => number;
  },
): BlackjackCoordinatorRealtimeSource {
  const listeners = new Set<
    (snapshot: BlackjackPublicSnapshot) => void
  >();

  const currentSnapshot = (): BlackjackPublicSnapshot => {
    const nowMs=input.nowMs();
    assertNowMs(nowMs);
    return buildBlackjackPublicSnapshot(
      coordinator.getTable(),
      nowMs,
    );
  };

  return Object.freeze({
    getSnapshot: currentSnapshot,
    subscribe:(listener)=>{
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    },
    publishTable:(table,serverTimeMs)=>{
      assertNowMs(serverTimeMs);
      const snapshot=buildBlackjackPublicSnapshot(
        table,
        serverTimeMs,
      );
      for(const listener of listeners){
        listener(snapshot);
      }
      return snapshot;
    },
  });
}

export function createBlackjackRoundRealtimeDriver(
  coordinator: BlackjackPlayerActionCoordinator,
  input: {
    nowMs: () => number;
    createFreshShoe?: () => BlackjackShoe;
    bettingWindowMs?: number;
    source?: BlackjackCoordinatorRealtimeSource;
    beforePublish?: (
      result: BlackjackRoundRuntimeTickResult,
      serverTimeMs: number,
    ) => void | Promise<void>;
  },
): BlackjackRoundRealtimeDriver {
  const source =
    input.source ??
    createBlackjackCoordinatorRealtimeSource(
      coordinator,
      { nowMs: input.nowMs },
    );

  return Object.freeze({
    source,
    tick:async()=>{
      const nowMs=input.nowMs();
      assertNowMs(nowMs);

      const result=await runBlackjackRoundRuntimeTick(
        coordinator,
        {
          nowMs,
          createFreshShoe:input.createFreshShoe,
          bettingWindowMs:input.bettingWindowMs,
        },
      );

      if(result.transitions.length>0){
        await input.beforePublish?.(result,nowMs);
      }

      for(const transition of result.transitions){
        source.publishTable(transition.table,nowMs);
      }

      return result;
    },
  });
}
