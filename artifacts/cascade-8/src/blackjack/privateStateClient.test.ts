import { describe, expect, it } from "vitest";
import {
  createBlackjackPrivatePlayerStateClient,
} from "./privateStateClient";
import type {
  BlackjackRealtimeSocketLike,
} from "./realtimeClient";
import type {
  BlackjackPublicSnapshotViewSource,
} from "./snapshotView";

function snapshot(
  stateVersion:number,
  eventSequence:number,
  roundId:string,
): BlackjackPublicSnapshotViewSource {
  return {
    serverTimeMs:1_000,
    tableId:"private-client-table",
    phase:"ROUND_END",
    maxSeats:5,
    seats:[
      {seatNumber:1,playerId:"local-player"},
      {seatNumber:2,playerId:null},
      {seatNumber:3,playerId:null},
      {seatNumber:4,playerId:null},
      {seatNumber:5,playerId:null},
    ],
    players:[{
      playerId:"local-player",
      seatNumber:1,
      status:"SEATED_WAITING",
      connected:true,
    }],
    round:{
      roundId,
      phase:"ROUND_END",
      hands:[],
      dealer:{cards:[],holeCardRevealed:true},
      currentTurn:null,
      bettingClosesAtMs:null,
    },
    stateVersion,
    eventSequence,
  };
}

describe("blackjack private player state client",()=>{
  it("applies wallet and exact chip-stack state only at the authoritative cursor",()=>{
    const socket: BlackjackRealtimeSocketLike={
      send:()=>undefined,
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    };
    let current=snapshot(7,7,"round-1");
    let changes=0;
    const client=createBlackjackPrivatePlayerStateClient({
      socket,
      getSnapshot:()=>current,
      onStateChange:()=>{ changes+=1; },
    });

    client.receive({
      type:"PRIVATE_PLAYER_STATE",
      stateVersion:6,
      eventSequence:6,
      roundId:"round-1",
      playerId:"local-player",
      availableBalanceCents:50_000,
      reservedBalanceCents:0,
      betting:null,
    });
    expect(client.getState()).toBeNull();

    client.receive({
      type:"PRIVATE_PLAYER_STATE",
      stateVersion:7,
      eventSequence:7,
      roundId:"round-1",
      playerId:"local-player",
      availableBalanceCents:125_000,
      reservedBalanceCents:0,
      betting:null,
    });
    expect(client.getState()).toMatchObject({
      playerId:"local-player",
      availableBalanceCents:125_000,
      reservedBalanceCents:0,
    });
    expect(changes).toBe(1);

    current=snapshot(8,8,"round-2");
    client.receive({
      type:"PRIVATE_PLAYER_STATE",
      stateVersion:8,
      eventSequence:8,
      roundId:"round-2",
      playerId:"local-player",
      availableBalanceCents:112_500,
      reservedBalanceCents:12_500,
      betting:{
        roundId:"round-2",
        status:"OPEN",
        betCents:12_500,
        activeChipValuesCents:[2_500,10_000],
      },
    });
    expect(client.getState()).toMatchObject({
      roundId:"round-2",
      playerId:"local-player",
      availableBalanceCents:112_500,
      reservedBalanceCents:12_500,
      betting:{
        roundId:"round-2",
        status:"OPEN",
        betCents:12_500,
        activeChipValuesCents:[2_500,10_000],
      },
    });
  });
});
