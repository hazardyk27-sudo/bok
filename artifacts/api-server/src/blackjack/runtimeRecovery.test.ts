import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import type {
  BlackjackRound,
  BlackjackTable,
} from "./domain";
import { createBlackjackReconnectRegistry } from "./reconnect";
import {
  createBlackjackReservationBook,
} from "./reservations";
import {
  recoverAndStartBlackjackRoundRuntime,
} from "./runtimeRecovery";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";
import {
  createBlackjackWalletLedgerState,
} from "./walletLedger";

function durableBettingRuntime(): BlackjackDurableRuntimeState {
  const foundation=createBlackjackTableFoundation({
    tableId:"recovered-runtime-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"recovered-runtime-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"recovered-round-1",
    roundNumber:1,
    phase:"BETTING",
    activeSeatOrder:[],
    hands:[],
    dealer:{cards:[],holeCardRevealed:false},
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:5_000,
    finishedAtMs:null,
  };
  const table: BlackjackTable={
    ...foundation,
    phase:"BETTING",
    seats:foundation.seats.map((seat)=>
      seat.seatNumber===1
        ? {...seat,playerId:"player-1"}
        : seat,
    ),
    players:[{
      playerId:"player-1",
      userId:"user-1",
      sessionId:"session-1",
      seatNumber:1,
      status:"BETTING",
      connected:true,
      disconnectedAtMs:null,
      handIds:[],
    }],
    round,
    stateVersion:3,
    eventSequence:3,
  };

  return {
    table,
    actionProtocol:createBlackjackActionProtocolState(),
    reconnectRegistry:createBlackjackReconnectRegistry(),
    wallets:[createBlackjackWalletLedgerState({
      userId:"user-1",
      totalBalanceCents:100_000,
    })],
    reservationBooks:[
      createBlackjackReservationBook("user-1"),
    ],
    bettingPositions:[],
  };
}

describe("blackjack recovered scheduled runtime",()=>{
  it("persists resume state, catches up an expired deadline, then persists before publishing",async()=>{
    const initial=createBlackjackDurableSnapshot(
      durableBettingRuntime(),
      4_000,
    );
    let stored: BlackjackDurableSnapshot=initial;
    const savedPhases: string[]=[];
    const savedVersions: number[]=[];

    const snapshotRepository={
      load:async()=>stored,
      save:async(
        snapshot: BlackjackDurableSnapshot,
        expectedPreviousStateVersion: number | null,
      )=>{
        expect(expectedPreviousStateVersion)
          .toBe(stored.stateVersion);
        stored=snapshot;
        savedPhases.push(snapshot.payload.table.phase);
        savedVersions.push(snapshot.stateVersion);
        return snapshot;
      },
    };

    let scheduled: (()=>void) | null=null;
    let cancelled=false;
    const runtime=await recoverAndStartBlackjackRoundRuntime({
      tableId:"recovered-runtime-table",
      snapshotRepository,
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:10_000,
      nowMs:()=>10_000,
      scheduler:{
        schedule:(callback)=>{
          scheduled=callback;
          return "recovery-scheduler";
        },
        cancelSchedule:(handle)=>{
          expect(handle).toBe("recovery-scheduler");
          cancelled=true;
        },
      },
    });

    expect(runtime).not.toBeNull();
    expect(savedPhases).toEqual([
      "BETTING",
      "BETTING_LOCKED",
    ]);
    expect(savedVersions).toEqual([5,6]);
    expect(stored.eventSequence).toBe(4);
    expect(stored.payload.table.phase).toBe("BETTING_LOCKED");
    expect(runtime?.coordinator.getTable().phase)
      .toBe("BETTING_LOCKED");
    expect(runtime?.scheduler.completedTickCount()).toBe(1);
    expect(runtime?.scheduler.lastResult()?.status)
      .toBe("BETTING_CLOSED_EMPTY");
    expect(
      runtime?.getDurableRuntime().table.players[0],
    ).toMatchObject({
      status:"DISCONNECTED",
      connected:false,
      disconnectedAtMs:10_000,
    });
    expect(
      runtime?.reconnectRegistry.records[0],
    ).toMatchObject({
      playerId:"player-1",
      disconnectedAtMs:10_000,
      expiresAtMs:40_000,
    });

    expect(scheduled).not.toBeNull();
    runtime?.stop();
    expect(cancelled).toBe(true);
  });

  it("returns null and never schedules when no durable snapshot exists",async()=>{
    let scheduled=false;

    const runtime=await recoverAndStartBlackjackRoundRuntime({
      tableId:"missing-table",
      snapshotRepository:{
        load:async()=>null,
        save:async()=>{
          throw new Error("save must not run");
        },
      },
      journalRepository:{
        loadAfter:async()=>{
          throw new Error("journal must not load");
        },
      },
      recoveredAtMs:10_000,
      nowMs:()=>10_000,
      scheduler:{
        schedule:()=>{
          scheduled=true;
          return "unused";
        },
        cancelSchedule:()=>undefined,
      },
    });

    expect(runtime).toBeNull();
    expect(scheduled).toBe(false);
  });

  it("does not publish recovered timer state if durable persistence fails",async()=>{
    const initial=createBlackjackDurableSnapshot(
      durableBettingRuntime(),
      4_000,
    );
    let saves=0;
    let scheduled=false;

    await expect(
      recoverAndStartBlackjackRoundRuntime({
        tableId:"recovered-runtime-table",
        snapshotRepository:{
          load:async()=>initial,
          save:async(snapshot)=>{
            saves+=1;
            if(saves===1) return snapshot;
            throw new Error("durable write failed");
          },
        },
        journalRepository:{loadAfter:async()=>[]},
        recoveredAtMs:10_000,
        nowMs:()=>10_000,
        scheduler:{
          schedule:()=>{
            scheduled=true;
            return "failure-scheduler";
          },
          cancelSchedule:()=>undefined,
        },
      }),
    ).resolves.toMatchObject({
      scheduler:expect.any(Object),
    });

    expect(scheduled).toBe(true);
    // The catch-up tick is contained by the scheduler. Its state may mutate
    // in memory, but realtime publication is blocked by beforePublish.
  });
});
