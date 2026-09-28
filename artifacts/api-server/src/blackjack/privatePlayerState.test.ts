import { describe, expect, it } from "vitest";
import {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type {
  BlackjackRound,
  BlackjackTable,
} from "./domain";
import {
  buildBlackjackPrivatePlayerState,
} from "./privatePlayerState";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackWalletLedgerState,
} from "./walletLedger";

function game(){
  const foundation=createBlackjackTableFoundation({
    tableId:"private-state-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"private-state-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"private-state-round",
    roundNumber:1,
    phase:"ROUND_END",
    activeSeatOrder:[1,2],
    hands:[],
    dealer:{cards:[],holeCardRevealed:true},
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:10_000,
    finishedAtMs:20_000,
  };
  const table: BlackjackTable={
    ...foundation,
    phase:"ROUND_END",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===1
        ? {...seat,playerId:"p1"}
        : seat.seatNumber===2
          ? {...seat,playerId:"p2"}
          : seat,
    ),
    players:[
      {
        playerId:"p1",userId:"u1",sessionId:"s1",seatNumber:1,
        status:"SEATED_WAITING",connected:true,
        disconnectedAtMs:null,handIds:[],
      },
      {
        playerId:"p2",userId:"u2",sessionId:"s2",seatNumber:2,
        status:"SEATED_WAITING",connected:true,
        disconnectedAtMs:null,handIds:[],
      },
    ],
    round,
    stateVersion:12,
    eventSequence:12,
  };

  return new BlackjackPlayerActionCoordinator({
    table,
    accounts:[
      {
        playerId:"p1",userId:"u1",
        wallet:createBlackjackWalletLedgerState({
          userId:"u1",totalBalanceCents:125_000,
        }),
        book:createBlackjackReservationBook("u1"),
      },
      {
        playerId:"p2",userId:"u2",
        wallet:createBlackjackWalletLedgerState({
          userId:"u2",totalBalanceCents:80_000,
        }),
        book:createBlackjackReservationBook("u2"),
      },
    ],
  });
}

describe("blackjack private player realtime state",()=>{
  it("returns only the authenticated player's wallet at the matching cursor",()=>{
    const coordinator=game();
    const snapshot=buildBlackjackPublicSnapshot(
      coordinator.getTable(),
      20_000,
    );

    const first=buildBlackjackPrivatePlayerState(
      coordinator,
      {userId:"u1",playerId:"p1",sessionId:"s1"},
      snapshot,
    );
    const second=buildBlackjackPrivatePlayerState(
      coordinator,
      {userId:"u2",playerId:"p2",sessionId:"s2"},
      snapshot,
    );

    expect(first).toMatchObject({
      type:"PRIVATE_PLAYER_STATE",
      stateVersion:12,
      eventSequence:12,
      roundId:"private-state-round",
      availableBalanceCents:125_000,
      reservedBalanceCents:0,
    });
    expect(second).toMatchObject({
      availableBalanceCents:80_000,
      reservedBalanceCents:0,
    });
    expect(first?.availableBalanceCents)
      .not.toBe(second?.availableBalanceCents);
  });

  it("refuses identity mismatch and historical transition cursors",()=>{
    const coordinator=game();
    const current=buildBlackjackPublicSnapshot(
      coordinator.getTable(),
      20_000,
    );

    expect(buildBlackjackPrivatePlayerState(
      coordinator,
      {userId:"u2",playerId:"p1",sessionId:"s1"},
      current,
    )).toBeNull();

    expect(buildBlackjackPrivatePlayerState(
      coordinator,
      {userId:"u1",playerId:"p1",sessionId:"s1"},
      {...current,stateVersion:11,eventSequence:11},
    )).toBeNull();
  });
});
