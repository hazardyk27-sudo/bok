import { describe, expect, it } from "vitest";
import {
  createBlackjackPresentationQueue,
  deriveBlackjackPresentationEvents,
  type BlackjackPresentationEvent,
} from "./presentationQueue";
import { bindBlackjackRealtimeView, type BlackjackRealtimeSocketLike } from "./realtimeClient";
import type { BlackjackPublicSnapshotViewSource } from "./snapshotView";

function snapshotWithCards(input: Readonly<{
  eventSequence: number;
  stateVersion: number;
  phase?: BlackjackPublicSnapshotViewSource["phase"];
  seatOneCards?: readonly Readonly<{ suit:"CLUBS"|"DIAMONDS"|"HEARTS"|"SPADES"; rank:"A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K"; }>[];
  seatThreeCards?: readonly Readonly<{ suit:"CLUBS"|"DIAMONDS"|"HEARTS"|"SPADES"; rank:"A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K"; }>[];
  dealerCards?: readonly (Readonly<{ suit:"CLUBS"|"DIAMONDS"|"HEARTS"|"SPADES"; rank:"A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K"; }> | null)[];
  holeCardRevealed?: boolean;
}>): BlackjackPublicSnapshotViewSource {
  const phase=input.phase ?? "INITIAL_DEAL";
  return {
    serverTimeMs:10_000,
    tableId:"presentation-table",
    phase,
    maxSeats:5,
    seats:[
      { seatNumber:1, playerId:"player-1" },
      { seatNumber:2, playerId:null },
      { seatNumber:3, playerId:"player-3" },
      { seatNumber:4, playerId:null },
      { seatNumber:5, playerId:null },
    ],
    players:[
      { playerId:"player-1", seatNumber:1, status:"PLAYING", connected:true },
      { playerId:"player-3", seatNumber:3, status:"PLAYING", connected:true },
    ],
    round:{
      roundId:"round-presentation",
      phase:
        phase==="TABLE_IDLE" || phase==="SHUFFLING" || phase==="RECOVERING"
          ? "INITIAL_DEAL"
          : phase,
      hands:[
        {
          handId:"hand-1",
          playerId:"player-1",
          seatNumber:1,
          cards:input.seatOneCards ?? [],
          betCents:1_000,
          status:"WAITING",
        },
        {
          handId:"hand-3",
          playerId:"player-3",
          seatNumber:3,
          cards:input.seatThreeCards ?? [],
          betCents:1_000,
          status:"WAITING",
        },
      ],
      dealer:{
        cards:input.dealerCards ?? [],
        holeCardRevealed:input.holeCardRevealed ?? false,
      },
      currentTurn:null,
      bettingClosesAtMs:null,
    },
    stateVersion:input.stateVersion,
    eventSequence:input.eventSequence,
  };
}

describe("blackjack presentation queue foundation",()=>{
  it("derives multi-card deals in table order instead of collapsing the snapshot",()=>{
    const previous=snapshotWithCards({ eventSequence:10, stateVersion:10 });
    const next=snapshotWithCards({
      eventSequence:11,
      stateVersion:11,
      seatOneCards:[
        { suit:"SPADES", rank:"A" },
        { suit:"HEARTS", rank:"9" },
      ],
      seatThreeCards:[
        { suit:"CLUBS", rank:"10" },
        { suit:"DIAMONDS", rank:"7" },
      ],
      dealerCards:[
        { suit:"HEARTS", rank:"K" },
        null,
      ],
    });

    const events=deriveBlackjackPresentationEvents(previous,next);
    expect(events.map((event)=>event.type)).toEqual([
      "PLAYER_CARD_DEALT",
      "PLAYER_CARD_DEALT",
      "DEALER_CARD_DEALT",
      "PLAYER_CARD_DEALT",
      "PLAYER_CARD_DEALT",
      "DEALER_CARD_DEALT",
    ]);
    expect(events.map((event)=>
      event.type==="PLAYER_CARD_DEALT"
        ? `S${event.seatNumber}:${event.cardIndex}`
        : event.type==="DEALER_CARD_DEALT"
          ? `D:${event.cardIndex}:${event.hidden ? "HIDDEN" : "OPEN"}`
          : event.type,
    )).toEqual([
      "S1:0",
      "S3:0",
      "D:0:OPEN",
      "S1:1",
      "S3:1",
      "D:1:HIDDEN",
    ]);
  });

  it("emits dealer hole-card reveal as its own presentation event",()=>{
    const previous=snapshotWithCards({
      eventSequence:20,
      stateVersion:20,
      phase:"PLAYER_TURNS",
      dealerCards:[{ suit:"SPADES", rank:"10" },null],
    });
    const next=snapshotWithCards({
      eventSequence:21,
      stateVersion:21,
      phase:"DEALER_TURN",
      dealerCards:[
        { suit:"SPADES", rank:"10" },
        { suit:"HEARTS", rank:"6" },
      ],
      holeCardRevealed:true,
    });

    const events=deriveBlackjackPresentationEvents(previous,next);
    expect(events.map((event)=>event.type)).toEqual([
      "PHASE_CHANGED",
      "DEALER_HOLE_REVEALED",
    ]);
    expect(events[1]).toMatchObject({
      type:"DEALER_HOLE_REVEALED",
      cardIndex:1,
      card:{ suit:"HEARTS", rank:"6" },
    });
  });

  it("plays presentation events strictly FIFO and survives an animation failure",async()=>{
    const source=deriveBlackjackPresentationEvents(
      snapshotWithCards({ eventSequence:30, stateVersion:30 }),
      snapshotWithCards({
        eventSequence:31,
        stateVersion:31,
        seatOneCards:[{ suit:"SPADES", rank:"A" }],
        seatThreeCards:[{ suit:"HEARTS", rank:"10" }],
      }),
    );
    expect(source).toHaveLength(2);

    let releaseFirst: (()=>void) | null=null;
    const firstGate=new Promise<void>((resolve)=>{ releaseFirst=resolve; });
    const order: string[]=[];
    const failures: string[]=[];
    let playIndex=0;
    const queue=createBlackjackPresentationQueue({
      play:async(event)=>{
        const index=playIndex++;
        order.push(`start:${index}:${event.type}`);
        if(index===0) await firstGate;
        order.push(`end:${index}:${event.type}`);
        if(index===0) throw new Error("visual-only failure");
      },
      onError:(_error,event)=>{ failures.push(event.type); },
    });

    queue.enqueue(source);
    await Promise.resolve();
    expect(order).toEqual(["start:0:PLAYER_CARD_DEALT"]);
    expect(queue.isRunning()).toBe(true);
    expect(queue.getPendingCount()).toBe(1);

    releaseFirst?.();
    await queue.whenIdle();
    expect(order).toEqual([
      "start:0:PLAYER_CARD_DEALT",
      "end:0:PLAYER_CARD_DEALT",
      "start:1:PLAYER_CARD_DEALT",
      "end:1:PLAYER_CARD_DEALT",
    ]);
    expect(failures).toEqual(["PLAYER_CARD_DEALT"]);
    expect(queue.isRunning()).toBe(false);
  });

  it("does not replay historical animations on FULL_TABLE_SNAPSHOT but emits live deltas",()=>{
    const listeners=new Set<(event: MessageEvent<unknown>)=>void>();
    const socket: BlackjackRealtimeSocketLike={
      send:()=>undefined,
      addEventListener:(_type,listener)=>{ listeners.add(listener); },
      removeEventListener:(_type,listener)=>{ listeners.delete(listener); },
    };
    const presentation: BlackjackPresentationEvent[]=[];
    const baseline=snapshotWithCards({
      eventSequence:40,
      stateVersion:40,
      phase:"PLAYER_TURNS",
      seatOneCards:[
        { suit:"SPADES", rank:"A" },
        { suit:"HEARTS", rank:"9" },
      ],
      seatThreeCards:[
        { suit:"CLUBS", rank:"10" },
        { suit:"DIAMONDS", rank:"7" },
      ],
      dealerCards:[{ suit:"HEARTS", rank:"K" },null],
    });
    const controller=bindBlackjackRealtimeView({
      socket,
      nowMs:()=>10_000,
      renderModel:()=>undefined,
      onPresentationEvents:(events)=>{ presentation.push(...events); },
    });

    controller.receive({
      type:"FULL_TABLE_SNAPSHOT",
      snapshot:baseline,
      resetEventSequenceTo:40,
      resetStateVersionTo:40,
    });
    expect(presentation).toEqual([]);

    const live=snapshotWithCards({
      eventSequence:41,
      stateVersion:41,
      phase:"PLAYER_TURNS",
      seatOneCards:[
        { suit:"SPADES", rank:"A" },
        { suit:"HEARTS", rank:"9" },
      ],
      seatThreeCards:[
        { suit:"CLUBS", rank:"10" },
        { suit:"DIAMONDS", rank:"7" },
        { suit:"SPADES", rank:"4" },
      ],
      dealerCards:[{ suit:"HEARTS", rank:"K" },null],
    });
    controller.receive({ type:"snapshot", snapshot:live });

    expect(presentation).toHaveLength(1);
    expect(presentation[0]).toMatchObject({
      type:"PLAYER_CARD_DEALT",
      seatNumber:3,
      handId:"hand-3",
      cardIndex:2,
      card:{ suit:"SPADES", rank:"4" },
    });
    expect(controller.getSnapshot()?.eventSequence).toBe(41);
    controller.detach();
  });
});
