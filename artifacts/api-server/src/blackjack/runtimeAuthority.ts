import {
  createBlackjackActionQueue,
  type BlackjackActionQueue,
} from "./actionQueue";
import type {
  BlackjackPlayerActionCoordinator,
  BlackjackCoordinatorAccount,
} from "./actionCoordinator";
import type { BlackjackShoe } from "./domain";
import {
  buildBlackjackPublicSnapshot,
  type BlackjackPublicSnapshot,
} from "./publicSnapshot";
import {
  buildBlackjackPrivatePlayerState,
  type BlackjackPrivatePlayerState,
} from "./privatePlayerState";
import type { BlackjackRealtimeIdentity } from "./realtime";
import type {
  BlackjackSeatClaimAccepted,
  BlackjackSeatClaimRequest,
  BlackjackSeatLeaveAccepted,
  BlackjackSeatLeaveRequest,
} from "./seatProtocol";
import type {
  BlackjackRealtimePlayerActionHandlerResult,
  BlackjackRealtimePlayerActionTransactionHandler,
} from "./realtimeActions";
import {
  createBlackjackCoordinatorRealtimeSource,
  type BlackjackCoordinatorRealtimeSource,
  type BlackjackRoundRealtimeDriver,
} from "./roundRealtime";
import {
  runBlackjackRoundRuntimeTick,
  type BlackjackRoundRuntimeTickResult,
} from "./roundRuntime";

export type BlackjackRuntimeAuthority = Readonly<{
  source: BlackjackCoordinatorRealtimeSource;
  driver: BlackjackRoundRealtimeDriver;
  handlePlayerActionTransaction:
    BlackjackRealtimePlayerActionTransactionHandler;
  onIdentityConnected: (
    identity: BlackjackRealtimeIdentity,
    connectedAtMs: number,
  ) => Promise<void>;
  onIdentityDisconnected: (
    identity: BlackjackRealtimeIdentity,
    disconnectedAtMs: number,
  ) => Promise<void>;
  handleSeatClaimTransaction: (
    identity: BlackjackRealtimeIdentity,
    request: BlackjackSeatClaimRequest,
    acknowledge: (result: BlackjackSeatClaimAccepted)=>void,
  ) => Promise<void>;
  handleSeatLeaveTransaction: (
    identity: BlackjackRealtimeIdentity,
    request: BlackjackSeatLeaveRequest,
    acknowledge: (result: BlackjackSeatLeaveAccepted)=>void,
  ) => Promise<void>;
  getPrivatePlayerState: (
    identity: BlackjackRealtimeIdentity,
    snapshot: BlackjackPublicSnapshot,
  ) => BlackjackPrivatePlayerState | null;
  pendingCount: () => number;
  activeCount: () => number;
  fatalError: () => unknown | null;
}>;

function assertNowMs(nowMs: number): void {
  if(!Number.isSafeInteger(nowMs) || nowMs<0){
    throw new RangeError(
      "Blackjack runtime authority time must be non-negative",
    );
  }
}

export function createBlackjackRuntimeAuthority(
  coordinator: BlackjackPlayerActionCoordinator,
  input: {
    nowMs: () => number;
    createFreshShoe?: () => BlackjackShoe;
    bettingWindowMs?: number;
    persist?: (serverTimeMs: number) => void | Promise<void>;
    onFatalError?: (error: unknown) => void;
    queue?: BlackjackActionQueue;
    loadSeatAccount?: (
      identity: BlackjackRealtimeIdentity,
    ) =>
      | BlackjackCoordinatorAccount
      | Promise<BlackjackCoordinatorAccount>;
  },
): BlackjackRuntimeAuthority {
  const queue=input.queue ?? createBlackjackActionQueue();
  const rawSource=createBlackjackCoordinatorRealtimeSource(
    coordinator,
    {nowMs:input.nowMs},
  );
  let fatal: unknown | null=null;

  const fail=(error: unknown): never=>{
    if(fatal===null){
      fatal=error;
      input.onFatalError?.(error);
    }
    throw error;
  };

  const assertHealthy=()=>{
    if(fatal!==null){
      throw new Error(
        "Blackjack runtime authority is fail-closed after a fatal error",
      );
    }
  };

  const persist=async(serverTimeMs: number)=>{
    if(!input.persist) return;
    try {
      await input.persist(serverTimeMs);
    } catch(error) {
      fail(error);
    }
  };

  const source: BlackjackCoordinatorRealtimeSource=Object.freeze({
    getSnapshot:()=>queue.enqueue(async()=>{
      assertHealthy();
      return rawSource.getSnapshot();
    }),
    subscribe:rawSource.subscribe,
    publishTable:rawSource.publishTable,
  });

  const tick=(): Promise<BlackjackRoundRuntimeTickResult> =>
    queue.enqueue(async()=>{
      assertHealthy();
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
        await persist(nowMs);
        for(const transition of result.transitions){
          rawSource.publishTable(transition.table,nowMs);
        }
      }

      return result;
    });

  const handlePlayerActionTransaction:
    BlackjackRealtimePlayerActionTransactionHandler =
    (action,acknowledge)=>queue.enqueue(async()=>{
      assertHealthy();
      const result=await coordinator.submit(action);
      const response: BlackjackRealtimePlayerActionHandlerResult=
        Object.freeze({
          actionId:action.envelope.actionId,
          replayed:result.replayed,
          snapshot:buildBlackjackPublicSnapshot(
            result.table,
            action.nowMs,
          ),
          betting:result.betting,
        });

      if(!result.replayed){
        await persist(action.nowMs);
      }

      acknowledge(response);

      if(!result.replayed){
        rawSource.publishTable(result.table,action.nowMs);
      }
    });

  const onIdentityConnected=(
    identity: BlackjackRealtimeIdentity,
    connectedAtMs: number,
  ): Promise<void>=>queue.enqueue(async()=>{
    assertHealthy();
    assertNowMs(connectedAtMs);

    const player=coordinator.getTable().players.find(
      (candidate)=>candidate.playerId===identity.playerId,
    );
    if(!player || player.connected) return;

    const result=await coordinator.reconnectPlayerSession({
      playerId:identity.playerId,
      userId:identity.userId,
      sessionId:identity.sessionId,
      nowMs:connectedAtMs,
    });
    if(result.replayed) return;

    await persist(connectedAtMs);
    rawSource.publishTable(result.table,connectedAtMs);
  });

  const onIdentityDisconnected=(
    identity: BlackjackRealtimeIdentity,
    disconnectedAtMs: number,
  ): Promise<void>=>queue.enqueue(async()=>{
    assertHealthy();
    assertNowMs(disconnectedAtMs);

    const player=coordinator.getTable().players.find(
      (candidate)=>candidate.playerId===identity.playerId,
    );
    if(!player || !player.connected) return;

    const result=await coordinator.disconnectPlayerForReconnect(
      identity.playerId,
      disconnectedAtMs,
    );
    if(result.replayed) return;

    await persist(disconnectedAtMs);
    rawSource.publishTable(result.table,disconnectedAtMs);
  });

  const handleSeatClaimTransaction=(
    identity: BlackjackRealtimeIdentity,
    request: BlackjackSeatClaimRequest,
    acknowledge: (result: BlackjackSeatClaimAccepted)=>void,
  ): Promise<void>=>queue.enqueue(async()=>{
    assertHealthy();
    const nowMs=input.nowMs();
    assertNowMs(nowMs);

    if(!input.loadSeatAccount){
      throw new Error(
        "Blackjack seat account provider is not configured",
      );
    }
    const account=await input.loadSeatAccount(identity);
    if(
      account.playerId!==identity.playerId ||
      account.userId!==identity.userId
    ){
      throw new Error(
        "Blackjack seat account does not match authenticated identity",
      );
    }

    const result=await coordinator.claimSeat({
      account,
      sessionId:identity.sessionId,
      seatNumber:request.seatNumber,
      nowMs,
      bettingWindowMs:input.bettingWindowMs,
    });

    if(!result.replayed){
      await persist(nowMs);
    }

    acknowledge(Object.freeze({
      type:"SEAT_CLAIM_ACCEPTED",
      requestId:request.requestId,
      seatNumber:request.seatNumber,
      replayed:result.replayed,
      stateVersion:result.table.stateVersion,
      eventSequence:result.table.eventSequence,
    }));

    if(!result.replayed){
      rawSource.publishTable(result.table,nowMs);
    }
  });

  const handleSeatLeaveTransaction=(
    identity: BlackjackRealtimeIdentity,
    request: BlackjackSeatLeaveRequest,
    acknowledge: (result: BlackjackSeatLeaveAccepted)=>void,
  ): Promise<void>=>queue.enqueue(async()=>{
    assertHealthy();
    const nowMs=input.nowMs();
    assertNowMs(nowMs);

    const result=await coordinator.leaveSeat({
      playerId:identity.playerId,
      nowMs,
    });
    if(!result.replayed){
      await persist(nowMs);
    }

    acknowledge(Object.freeze({
      type:"SEAT_LEAVE_ACCEPTED",
      requestId:request.requestId,
      replayed:result.replayed,
      stateVersion:result.table.stateVersion,
      eventSequence:result.table.eventSequence,
    }));

    if(!result.replayed){
      rawSource.publishTable(result.table,nowMs);
    }
  });

  const driver: BlackjackRoundRealtimeDriver=Object.freeze({
    source,
    tick,
  });

  return Object.freeze({
    source,
    driver,
    handlePlayerActionTransaction,
    onIdentityConnected,
    onIdentityDisconnected,
    handleSeatClaimTransaction,
    handleSeatLeaveTransaction,
    getPrivatePlayerState:(identity,snapshot)=>
      buildBlackjackPrivatePlayerState(
        coordinator,
        identity,
        snapshot,
      ),
    pendingCount:queue.pendingCount,
    activeCount:queue.activeCount,
    fatalError:()=>fatal,
  });
}
