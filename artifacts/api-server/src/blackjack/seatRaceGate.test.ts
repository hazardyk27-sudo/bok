import { describe, expect, it } from "vitest";
import { BlackjackPlayerActionCoordinator } from "./actionCoordinator";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackRuntimeAuthority } from "./runtimeAuthority";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function game(){
  return new BlackjackPlayerActionCoordinator({
    table:createBlackjackTableFoundation({
      tableId:"seat-race-table",
      shoe:createUnshuffledBlackjackShoe({
        shoeId:"seat-race-shoe",
        createdAtMs:1,
      }),
    }),
    accounts:[],
  });
}

function identity(index:number){
  return {
    userId:"race-user-"+index,
    playerId:"race-player-"+index,
    sessionId:"race-session-"+index,
  };
}

describe("blackjack seat claim race and capacity gate",()=>{
  it("serializes same-seat races so exactly one authenticated identity wins",async()=>{
    const coordinator=game();
    let accountLoads=0;
    let persists=0;
    let now=1_000;
    const authority=createBlackjackRuntimeAuthority(coordinator,{
      nowMs:()=>now++,
      loadSeatAccount:async(candidate)=>{
        accountLoads+=1;
        return {
          playerId:candidate.playerId,
          userId:candidate.userId,
          wallet:createBlackjackWalletLedgerState({
            userId:candidate.userId,
            totalBalanceCents:100_000,
          }),
          book:createBlackjackReservationBook(candidate.userId),
        };
      },
      persist:async()=>{ persists+=1; },
    });

    const attempts=Array.from({length:5},(_,index)=>
      authority.handleSeatClaimTransaction(
        identity(index+1),
        {
          type:"CLAIM_SEAT",
          requestId:"same-seat-"+(index+1),
          seatNumber:3,
        },
        ()=>undefined,
      ),
    );
    const settled=await Promise.allSettled(attempts);
    const fulfilled=settled.filter(
      (result)=>result.status==="fulfilled",
    );
    const rejected=settled.filter(
      (result)=>result.status==="rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    expect(coordinator.getTable().players).toHaveLength(1);
    expect(coordinator.getTable().seats[2].playerId).toBe("race-player-1");
    expect(coordinator.getTable()).toMatchObject({
      stateVersion:2,
      eventSequence:1,
      phase:"BETTING",
    });
    expect(accountLoads).toBe(1);
    expect(persists).toBe(1);
  });

  it("caps concurrent distinct claims at exactly five seats with contiguous cursors",async()=>{
    const coordinator=game();
    let accountLoads=0;
    let persists=0;
    let now=2_000;
    const published:number[]=[];
    const authority=createBlackjackRuntimeAuthority(coordinator,{
      nowMs:()=>now++,
      loadSeatAccount:async(candidate)=>{
        accountLoads+=1;
        return {
          playerId:candidate.playerId,
          userId:candidate.userId,
          wallet:createBlackjackWalletLedgerState({
            userId:candidate.userId,
            totalBalanceCents:100_000,
          }),
          book:createBlackjackReservationBook(candidate.userId),
        };
      },
      persist:async()=>{ persists+=1; },
    });
    authority.source.subscribe((snapshot)=>{
      published.push(snapshot.eventSequence);
    });

    const seats=[1,2,3,4,5,5] as const;
    const attempts=seats.map((seatNumber,index)=>
      authority.handleSeatClaimTransaction(
        identity(index+1),
        {
          type:"CLAIM_SEAT",
          requestId:"capacity-"+(index+1),
          seatNumber,
        },
        ()=>undefined,
      ),
    );
    const settled=await Promise.allSettled(attempts);

    expect(settled.filter(
      (result)=>result.status==="fulfilled",
    )).toHaveLength(5);
    expect(settled.filter(
      (result)=>result.status==="rejected",
    )).toHaveLength(1);
    expect(coordinator.getTable().players).toHaveLength(5);
    expect(coordinator.getTable().seats.every(
      (seat)=>seat.playerId!==null,
    )).toBe(true);
    expect(coordinator.getTable()).toMatchObject({
      stateVersion:6,
      eventSequence:5,
      phase:"BETTING",
    });
    expect(published).toEqual([1,2,3,4,5]);
    expect(accountLoads).toBe(5);
    expect(persists).toBe(5);
    expect(coordinator.getAccounts()).toHaveLength(5);
  });

  it("replays the winning identity without reloading external account state",async()=>{
    const coordinator=game();
    let accountLoads=0;
    const candidate=identity(1);
    const authority=createBlackjackRuntimeAuthority(coordinator,{
      nowMs:()=>3_000,
      loadSeatAccount:async(current)=>{
        accountLoads+=1;
        return {
          playerId:current.playerId,
          userId:current.userId,
          wallet:createBlackjackWalletLedgerState({
            userId:current.userId,
            totalBalanceCents:100_000,
          }),
          book:createBlackjackReservationBook(current.userId),
        };
      },
    });

    await authority.handleSeatClaimTransaction(
      candidate,
      {type:"CLAIM_SEAT",requestId:"first",seatNumber:1},
      ()=>undefined,
    );
    let replayed=false;
    await authority.handleSeatClaimTransaction(
      candidate,
      {type:"CLAIM_SEAT",requestId:"replay",seatNumber:1},
      (result)=>{ replayed=result.replayed; },
    );

    expect(replayed).toBe(true);
    expect(accountLoads).toBe(1);
    expect(coordinator.getTable().eventSequence).toBe(1);
  });
});
