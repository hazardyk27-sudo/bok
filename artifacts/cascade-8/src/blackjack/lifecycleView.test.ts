import { describe, expect, it } from "vitest";
import {
  bindBlackjackRealtimeView,
  type BlackjackRealtimeSocketLike,
} from "./realtimeClient";
import {
  createBlackjackBettingClient,
} from "./bettingClient";
import {
  createBlackjackPlayerActionClient,
} from "./playerActionsClient";
import type {
  BlackjackPublicSnapshotViewSource,
} from "./snapshotView";

function socket(sent: string[] = []): BlackjackRealtimeSocketLike {
  return {
    send:(data)=>sent.push(data),
    addEventListener:()=>undefined,
    removeEventListener:()=>undefined,
  };
}

function snapshot(input:{
  roundId:string;
  phase?:"BETTING"|"PLAYER_TURNS";
  stateVersion:number;
  eventSequence:number;
  serverTimeMs?:number;
}): BlackjackPublicSnapshotViewSource {
  const phase=input.phase ?? "BETTING";
  return {
    serverTimeMs:input.serverTimeMs ?? 1_000,
    tableId:"lifecycle-ui-table",
    phase,
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
      status:phase==="BETTING" ? "BETTING" : "PLAYING",
      connected:true,
    }],
    round:{
      roundId:input.roundId,
      phase,
      hands:phase==="PLAYER_TURNS"
        ? [{
            handId:input.roundId+":hand",
            playerId:"local-player",
            seatNumber:1,
            cards:[
              {suit:"HEARTS",rank:"10"},
              {suit:"SPADES",rank:"6"},
            ],
            betCents:1_000,
            status:"ACTIVE",
          }]
        : [],
      dealer:{
        cards:phase==="PLAYER_TURNS"
          ? [{suit:"CLUBS",rank:"9"},null]
          : [],
        holeCardRevealed:false,
      },
      currentTurn:phase==="PLAYER_TURNS"
        ? {
            seatNumber:1,
            handId:input.roundId+":hand",
            startedAtMs:1_000,
            endsAtMs:5_000,
          }
        : null,
      bettingClosesAtMs:phase==="BETTING" ? 5_000 : null,
    },
    stateVersion:input.stateVersion,
    eventSequence:input.eventSequence,
  };
}

describe("blackjack browser lifecycle projection",()=>{
  it("advances only the visual countdown between authoritative snapshots",()=>{
    let clientNow=10_000;
    const labels:string[]=[];
    const controller=bindBlackjackRealtimeView({
      socket:socket(),
      nowMs:()=>clientNow,
      getViewContext:()=>({localPlayerId:"local-player"}),
      renderModel:(model)=>labels.push(model.turnLabel),
    });

    const authoritative=snapshot({
      roundId:"round-1",
      stateVersion:1,
      eventSequence:1,
      serverTimeMs:1_000,
    });
    controller.receive({
      type:"FULL_TABLE_SNAPSHOT",
      snapshot:authoritative,
      resetEventSequenceTo:1,
      resetStateVersionTo:1,
    });
    expect(labels.at(-1)).toBe("BETTING · 4s");

    clientNow=12_100;
    expect(controller.rerenderLatest()).toBe(true);
    expect(labels.at(-1)).toBe("BETTING · 2s");
    expect(controller.getSnapshot()?.serverTimeMs).toBe(1_000);
    expect(controller.getCursor()).toEqual({
      eventSequence:1,
      stateVersion:1,
    });
  });

  it("clears private betting state when the authoritative round changes",()=>{
    let current=snapshot({
      roundId:"round-1",
      stateVersion:1,
      eventSequence:1,
    });
    const sent:string[]=[];
    const betting=createBlackjackBettingClient({
      socket:socket(sent),
      getSnapshot:()=>current,
      getViewContext:()=>({localPlayerId:"local-player"}),
      createActionId:()=>"bet-round-1",
    });

    betting.submit("PLACE_BET",1_000);
    betting.receive({
      type:"ACTION_ACCEPTED",
      actionId:"bet-round-1",
      replayed:false,
      stateVersion:2,
      eventSequence:2,
      betting:{
        roundId:"round-1",
        status:"OPEN",
        betCents:1_000,
        availableBalanceCents:99_000,
      },
    });
    current={...current,stateVersion:2,eventSequence:2};
    betting.receive({type:"snapshot",snapshot:current});
    expect(betting.getState()?.roundId).toBe("round-1");

    current=snapshot({
      roundId:"round-2",
      stateVersion:3,
      eventSequence:3,
    });
    betting.receive({type:"snapshot",snapshot:current});

    expect(betting.getState()).toBeNull();
    expect(betting.getPending()).toBeNull();
    expect(betting.getFeedback()).toBeNull();
  });

  it("clears stale player-action feedback on a new round",()=>{
    let current=snapshot({
      roundId:"round-1",
      phase:"PLAYER_TURNS",
      stateVersion:1,
      eventSequence:1,
    });
    const actions=createBlackjackPlayerActionClient({
      socket:socket(),
      getSnapshot:()=>current,
      getViewContext:()=>({
        localPlayerId:"local-player",
        availableBalanceCents:100_000,
      }),
      createActionId:()=>"hit-round-1",
    });

    actions.submit("HIT");
    actions.receive({
      type:"ACTION_REJECTED",
      actionId:"hit-round-1",
      error:"STALE_ACTION",
    });
    expect(actions.getFeedback()?.status).toBe("REJECTED");

    current=snapshot({
      roundId:"round-2",
      phase:"PLAYER_TURNS",
      stateVersion:2,
      eventSequence:2,
    });
    actions.receive({type:"snapshot",snapshot:current});

    expect(actions.getPending()).toBeNull();
    expect(actions.getFeedback()).toBeNull();
  });
});
