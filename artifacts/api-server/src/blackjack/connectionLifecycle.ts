import type {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type { BlackjackRealtimeIdentity } from "./realtime";
import type {
  BlackjackCoordinatorRealtimeSource,
} from "./roundRealtime";

export type BlackjackRealtimeConnectionLifecycle = Readonly<{
  connected: (
    identity: BlackjackRealtimeIdentity,
    connectedAtMs: number,
  ) => Promise<void>;
  disconnected: (
    identity: BlackjackRealtimeIdentity,
    disconnectedAtMs: number,
  ) => Promise<void>;
}>;

function assertNowMs(nowMs: number): void {
  if(!Number.isSafeInteger(nowMs) || nowMs<0){
    throw new RangeError(
      "Blackjack connection lifecycle time must be non-negative",
    );
  }
}

export function createBlackjackRealtimeConnectionLifecycle(
  coordinator: BlackjackPlayerActionCoordinator,
  source: BlackjackCoordinatorRealtimeSource,
  input: {
    beforePublish?: (
      serverTimeMs: number,
    ) => void | Promise<void>;
  } = {},
): BlackjackRealtimeConnectionLifecycle {
  return Object.freeze({
    connected:async(identity,connectedAtMs)=>{
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

      await input.beforePublish?.(connectedAtMs);
      source.publishTable(result.table,connectedAtMs);
    },
    disconnected:async(identity,disconnectedAtMs)=>{
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

      await input.beforePublish?.(disconnectedAtMs);
      source.publishTable(result.table,disconnectedAtMs);
    },
  });
}
