import { describe, expect, it } from "vitest";
import { BlackjackPlayerActionCoordinator } from "./actionCoordinator";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackRuntimeAuthority } from "./runtimeAuthority";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function game(){
  return new BlackjackPlayerActionCoordinator({
    table:createBlackjackTableFoundation({
      tableId:"seat-claim-table",
      shoe:createUnshuffledBlackjackShoe({
        shoeId:"seat-claim-shoe",
        createdAtMs:1,
      }),
    }),
    accounts:[],
  });
}

describe("blackjack authenticated seat claim",()=>{
  it("opens round 1 betting when the first authenticated player claims a seat",async()=>{
    const coordinator=game();
    let persisted=0;
    let acknowledged: unknown=null;
    const published:number[]=[];
    const authority=createBlackjackRuntimeAuthority(coordinator,{
      nowMs:()=>1_000,
      bettingWindowMs:12_000,
      loadSeatAccount:async(identity)=>({
        playerId:identity.playerId,
        userId:identity.userId,
        wallet:createBlackjackWalletLedgerState({
          userId:identity.userId,
          totalBalanceCents:100_000,
        }),
        book:createBlackjackReservationBook(identity.userId),
      }),
      persist:async()=>{ persisted+=1; },
    });
    authority.source.subscribe((snapshot)=>{
      published.push(snapshot.eventSequence);
    });

    await authority.handleSeatClaimTransaction(
      {userId:"u1",playerId:"p1",sessionId:"s1"},
      {type:"CLAIM_SEAT",requestId:"claim-1",seatNumber:3},
      (result)=>{ acknowledged=result; },
    );

    expect(coordinator.getTable()).toMatchObject({
      phase:"BETTING",
      stateVersion:2,
      eventSequence:1,
      round:{
        roundId:"seat-claim-table:round-1",
        roundNumber:1,
        phase:"BETTING",
        startedAtMs:1_000,
        bettingClosesAtMs:13_000,
      },
    });
    expect(coordinator.getTable().players[0]).toMatchObject({
      playerId:"p1",
      userId:"u1",
      sessionId:"s1",
      seatNumber:3,
      status:"BETTING",
      connected:true,
    });
    expect(coordinator.getAccount("p1").wallet.availableBalanceCents)
      .toBe(100_000);
    expect(persisted).toBe(1);
    expect(acknowledged).toMatchObject({
      type:"SEAT_CLAIM_ACCEPTED",
      requestId:"claim-1",
      seatNumber:3,
      playerId:"p1",
      availableBalanceCents:100_000,
      reservedBalanceCents:0,
      replayed:false,
      stateVersion:2,
      eventSequence:1,
    });
    expect(published).toEqual([1]);
  });

  it("rejects occupied seats and replays the same identity-seat claim",async()=>{
    const coordinator=game();
    const account=(playerId:string,userId:string)=>({
      playerId,
      userId,
      wallet:createBlackjackWalletLedgerState({
        userId,
        totalBalanceCents:50_000,
      }),
      book:createBlackjackReservationBook(userId),
    });

    await coordinator.claimSeat({
      account:account("p1","u1"),
      sessionId:"s1",
      seatNumber:1,
      nowMs:1_000,
    });
    const replay=await coordinator.claimSeat({
      account:account("p1","u1"),
      sessionId:"s1",
      seatNumber:1,
      nowMs:1_001,
    });
    expect(replay.replayed).toBe(true);
    expect(coordinator.getTable().eventSequence).toBe(1);

    await expect(coordinator.claimSeat({
      account:account("p2","u2"),
      sessionId:"s2",
      seatNumber:1,
      nowMs:1_002,
    })).rejects.toThrow(/occupied/);
  });
});
