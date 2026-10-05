import { describe, expect, it } from "vitest";
import {
  deriveBlackjackPresentationEvents,
  type BlackjackPresentationEvent,
} from "./presentationQueue";
import type { BlackjackPublicSnapshotViewSource } from "./snapshotView";

function snapshot(input:{
  phase: BlackjackPublicSnapshotViewSource["phase"];
  eventSequence:number;
  stateVersion:number;
  handStatus:"ACTIVE"|"COMPLETE";
  result?:"WIN"|"LOSS"|"PUSH"|"BLACKJACK_WIN"|null;
  payoutCents?:number;
  dealerCards?: readonly ({
    suit:"CLUBS"|"DIAMONDS"|"HEARTS"|"SPADES";
    rank:"A"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"10"|"J"|"Q"|"K";
  }|null)[];
}): BlackjackPublicSnapshotViewSource {
  return Object.freeze({
    serverTimeMs:10_000,
    tableId:"table-1",
    phase:input.phase,
    maxSeats:5 as const,
    seats:Object.freeze([
      { seatNumber:1 as const, playerId:"player-1" },
      { seatNumber:2 as const, playerId:null },
      { seatNumber:3 as const, playerId:null },
      { seatNumber:4 as const, playerId:null },
      { seatNumber:5 as const, playerId:null },
    ]),
    players:Object.freeze([
      {
        playerId:"player-1",
        seatNumber:1 as const,
        status:"PLAYING" as const,
        connected:true,
      },
    ]),
    round:Object.freeze({
      roundId:"round-1",
      phase:input.phase==="ROUND_END" ? "ROUND_END" as const : "DEALER_TURN" as const,
      hands:Object.freeze([
        Object.freeze({
          handId:"hand-1",
          playerId:"player-1",
          seatNumber:1 as const,
          cards:Object.freeze([
            Object.freeze({ suit:"HEARTS" as const, rank:"10" as const }),
            Object.freeze({ suit:"CLUBS" as const, rank:"9" as const }),
          ]),
          betCents:10_000,
          status:input.handStatus,
          result:input.result,
          ...(input.payoutCents===undefined ? {} : { payoutCents:input.payoutCents }),
        }),
      ]),
      dealer:Object.freeze({
        cards:Object.freeze(input.dealerCards ?? [
          Object.freeze({ suit:"SPADES" as const, rank:"10" as const }),
          Object.freeze({ suit:"DIAMONDS" as const, rank:"8" as const }),
        ]),
        holeCardRevealed:true,
      }),
      currentTurn:null,
      bettingClosesAtMs:null,
    }),
    stateVersion:input.stateVersion,
    eventSequence:input.eventSequence,
  });
}

function settled(events:readonly BlackjackPresentationEvent[]) {
  return events.filter(
    (event): event is Extract<BlackjackPresentationEvent,{type:"HAND_SETTLED"}> =>
      event.type==="HAND_SETTLED",
  );
}

describe("blackjack settlement presentation events",()=>{
  it("derives one authoritative settlement event with server payout data",()=>{
    const previous=snapshot({
      phase:"DEALER_TURN",
      eventSequence:20,
      stateVersion:30,
      handStatus:"ACTIVE",
      result:null,
    });
    const next=snapshot({
      phase:"ROUND_END",
      eventSequence:21,
      stateVersion:31,
      handStatus:"COMPLETE",
      result:"WIN",
      payoutCents:20_000,
    });

    expect(settled(deriveBlackjackPresentationEvents(previous,next))).toEqual([
      expect.objectContaining({
        type:"HAND_SETTLED",
        eventSequence:21,
        stateVersion:31,
        roundId:"round-1",
        playerId:"player-1",
        seatNumber:1,
        handId:"hand-1",
        result:"WIN",
        betCents:10_000,
        payoutCents:20_000,
      }),
    ]);
  });

  it("queues dealer card presentation before settlement chips",()=>{
    const previous=snapshot({
      phase:"DEALER_TURN",
      eventSequence:40,
      stateVersion:50,
      handStatus:"ACTIVE",
      result:null,
      dealerCards:[
        { suit:"SPADES", rank:"10" },
        { suit:"DIAMONDS", rank:"6" },
      ],
    });
    const next=snapshot({
      phase:"ROUND_END",
      eventSequence:41,
      stateVersion:51,
      handStatus:"COMPLETE",
      result:"LOSS",
      payoutCents:0,
      dealerCards:[
        { suit:"SPADES", rank:"10" },
        { suit:"DIAMONDS", rank:"6" },
        { suit:"CLUBS", rank:"4" },
      ],
    });

    const types=deriveBlackjackPresentationEvents(previous,next).map(
      (event)=>event.type,
    );
    expect(types.indexOf("DEALER_CARD_DEALT")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("HAND_SETTLED")).toBeGreaterThan(
      types.indexOf("DEALER_CARD_DEALT"),
    );
  });

  it("does not replay an unchanged completed hand",()=>{
    const settledSnapshot=snapshot({
      phase:"ROUND_END",
      eventSequence:60,
      stateVersion:70,
      handStatus:"COMPLETE",
      result:"PUSH",
      payoutCents:10_000,
    });
    const repeated=snapshot({
      phase:"ROUND_END",
      eventSequence:61,
      stateVersion:71,
      handStatus:"COMPLETE",
      result:"PUSH",
      payoutCents:10_000,
    });

    expect(settled(deriveBlackjackPresentationEvents(settledSnapshot,repeated))).toEqual([]);
  });
});
