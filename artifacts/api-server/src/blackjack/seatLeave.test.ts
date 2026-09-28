import { describe, expect, it } from "vitest";
import { BlackjackPlayerActionCoordinator } from "./actionCoordinator";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function account(playerId:string,userId:string){
  return {
    playerId,userId,
    wallet:createBlackjackWalletLedgerState({
      userId,totalBalanceCents:100_000,
    }),
    book:createBlackjackReservationBook(userId),
  };
}

describe("blackjack seat leave and rejoin",()=>{
  it("leaves an uncommitted seat, returns empty table to TABLE_IDLE, then rejoins",async()=>{
    const game=new BlackjackPlayerActionCoordinator({
      table:createBlackjackTableFoundation({
        tableId:"leave-table",
        shoe:createUnshuffledBlackjackShoe({
          shoeId:"leave-shoe",
          createdAtMs:1,
        }),
      }),
      accounts:[],
    });

    await game.claimSeat({
      account:account("p1","u1"),
      sessionId:"s1",
      seatNumber:2,
      nowMs:1_000,
    });
    expect(game.getTable().phase).toBe("BETTING");

    const left=await game.leaveSeat({
      playerId:"p1",
      nowMs:1_100,
    });
    expect(left.replayed).toBe(false);
    expect(game.getTable()).toMatchObject({
      phase:"TABLE_IDLE",
      round:null,
      eventSequence:2,
    });
    expect(game.getTable().players).toEqual([]);
    expect(game.getTable().seats[1].playerId).toBeNull();
    expect(game.getAccounts()).toEqual([]);

    await game.claimSeat({
      account:account("p1","u1"),
      sessionId:"s2",
      seatNumber:4,
      nowMs:2_000,
    });
    expect(game.getTable()).toMatchObject({
      phase:"BETTING",
      round:{roundId:"leave-table:round-1"},
    });
    expect(game.getTable().players[0]).toMatchObject({
      playerId:"p1",
      sessionId:"s2",
      seatNumber:4,
      status:"BETTING",
    });
  });

  it("refuses leave after a wager is reserved",async()=>{
    const game=new BlackjackPlayerActionCoordinator({
      table:createBlackjackTableFoundation({
        tableId:"leave-bet-table",
        shoe:createUnshuffledBlackjackShoe({
          shoeId:"leave-bet-shoe",
          createdAtMs:1,
        }),
      }),
      accounts:[],
    });
    await game.claimSeat({
      account:account("p1","u1"),
      sessionId:"s1",
      seatNumber:1,
      nowMs:1_000,
    });
    const table=game.getTable();
    await game.submit({
      envelope:{
        actionId:"bet-before-leave",
        actorPlayerId:"p1",
        type:"PLACE_BET",
        tableId:table.tableId,
        expectedStateVersion:table.stateVersion,
        roundId:table.round!.roundId,
        handId:null,
        seatNumber:1,
        payloadFingerprint:"PLACE_BET|bet-before-leave",
      },
      nowMs:1_100,
      chipValueCents:1_000,
      reservationId:"leave-reservation",
      reserveTransactionId:"leave-reserve-tx",
    });

    await expect(game.leaveSeat({
      playerId:"p1",
      nowMs:1_200,
    })).rejects.toThrow(/active wager/);
    expect(game.getTable().players).toHaveLength(1);
  });

  it("allows leave during ROUND_END after the wager has already settled",async()=>{
    const game=new BlackjackPlayerActionCoordinator({
      table:createBlackjackTableFoundation({
        tableId:"leave-settled-table",
        shoe:createUnshuffledBlackjackShoe({
          shoeId:"leave-settled-shoe",
          createdAtMs:1,
        }),
      }),
      accounts:[],
    });
    await game.claimSeat({
      account:account("p1","u1"),
      sessionId:"s1",
      seatNumber:1,
      nowMs:1_000,
    });

    const table=game.getTable();
    await game.submit({
      envelope:{
        actionId:"settled-bet",
        actorPlayerId:"p1",
        type:"PLACE_BET",
        tableId:table.tableId,
        expectedStateVersion:table.stateVersion,
        roundId:table.round!.roundId,
        handId:null,
        seatNumber:1,
        payloadFingerprint:"PLACE_BET|settled-bet",
      },
      nowMs:1_100,
      chipValueCents:1_000,
      reservationId:"settled-reservation",
      reserveTransactionId:"settled-reserve-tx",
    });
    await game.submit({
      envelope:{
        actionId:"settled-ready",
        actorPlayerId:"p1",
        type:"READY",
        tableId:table.tableId,
        expectedStateVersion:game.getTable().stateVersion,
        roundId:table.round!.roundId,
        handId:null,
        seatNumber:1,
        payloadFingerprint:"READY|settled-ready",
      },
      nowMs:1_200,
    });
    await game.closeBettingWindow(table.round!.bettingClosesAtMs!);
    await game.startInitialDeal(table.round!.bettingClosesAtMs!);
    const turn=game.getTable().round?.currentTurn;
    if(turn){
      await game.timeoutCurrentTurn(turn.endsAtMs);
    }
    if(game.getTable().phase==="DEALER_TURN"){
      await game.runDealerTurn(20_000);
    }
    if(game.getTable().phase==="SETTLEMENT"){
      await game.settleCurrentRound(20_000);
    }
    expect(game.getTable().phase).toBe("ROUND_END");

    await expect(game.leaveSeat({
      playerId:"p1",
      nowMs:20_001,
    })).resolves.toMatchObject({replayed:false});
    expect(game.getTable().phase).toBe("TABLE_IDLE");
    expect(game.getTable().players).toEqual([]);
  });

});
