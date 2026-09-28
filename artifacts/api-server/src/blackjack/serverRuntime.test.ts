import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import type { BlackjackRound, BlackjackTable } from "./domain";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackReservationBook } from "./reservations";
import {
  BLACKJACK_WS_PATH,
} from "./realtime";
import {
  recoverAndAttachBlackjackServerRuntime,
  type BlackjackAttachedServerRuntime,
} from "./serverRuntime";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function durableRuntime(): BlackjackDurableRuntimeState {
  const foundation=createBlackjackTableFoundation({
    tableId:"server-runtime-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"server-runtime-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"server-runtime-table:round-1",
    roundNumber:1,
    phase:"BETTING",
    activeSeatOrder:[],
    hands:[],
    dealer:{cards:[],holeCardRevealed:false},
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:20_000,
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
    stateVersion:2,
    eventSequence:2,
  };

  return {
    table,
    actionProtocol:createBlackjackActionProtocolState(),
    reconnectRegistry:createBlackjackReconnectRegistry(),
    wallets:[createBlackjackWalletLedgerState({
      userId:"user-1",
      totalBalanceCents:100_000,
    })],
    reservationBooks:[createBlackjackReservationBook("user-1")],
    bettingPositions:[],
  };
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const address=server.address();
      if(!address || typeof address==="string"){
        reject(new Error("Blackjack server runtime test did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve,reject)=>{
    const onError=(error: Error)=>{
      socket.off("message",onMessage);
      reject(error);
    };
    const onMessage=(raw: RawData)=>{
      socket.off("error",onError);
      resolve(JSON.parse(raw.toString()));
    };
    socket.once("error",onError);
    socket.once("message",onMessage);
  });
}

function closeServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  return new Promise((resolve)=>server.close(()=>resolve()));
}

describe("blackjack owned server runtime wiring",()=>{
  let server: ReturnType<typeof createServer> | undefined;
  let attached: BlackjackAttachedServerRuntime | null=null;
  let client: WebSocket | undefined;

  afterEach(async()=>{
    client?.terminate();
    attached?.close();
    if(server?.listening) await closeServer(server);
    client=undefined;
    attached=null;
    server=undefined;
  });

  it("recovers, schedules and attaches authenticated realtime in one owned bootstrap",async()=>{
    let stored: BlackjackDurableSnapshot=createBlackjackDurableSnapshot(
      durableRuntime(),
      5_000,
    );
    let clock=10_000;
    let scheduledCallback: (()=>void) | null=null;
    let schedulerCancelled=false;

    server=createServer();
    attached=await recoverAndAttachBlackjackServerRuntime({
      server,
      tableId:"server-runtime-table",
      snapshotRepository:{
        load:async()=>stored,
        save:async(snapshot,expectedVersion)=>{
          expect(expectedVersion).toBe(stored.stateVersion);
          stored=snapshot;
          return snapshot;
        },
      },
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:clock,
      nowMs:()=>clock,
      resolveIdentity:()=>({
        userId:"user-1",
        playerId:"player-1",
        sessionId:"session-1",
      }),
      createConnectionId:()=>"server-runtime-connection",
      scheduler:{
        schedule:(callback)=>{
          scheduledCallback=callback;
          return "server-runtime-scheduler";
        },
        cancelSchedule:(handle)=>{
          expect(handle).toBe("server-runtime-scheduler");
          schedulerCancelled=true;
        },
      },
    });

    expect(attached).not.toBeNull();
    expect(attached?.scheduled.scheduler.isRunning()).toBe(true);
    expect(scheduledCallback).not.toBeNull();
    expect(attached?.scheduled.coordinator.getTable().players[0])
      .toMatchObject({
        status:"DISCONNECTED",
        connected:false,
      });

    const port=await listen(server);
    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    const initial=await nextMessage(client) as {
      type:string;
      snapshot:{
        phase:string;
        players: readonly {
          playerId:string;
          status:string;
          connected:boolean;
        }[];
      };
    };

    expect(initial.type).toBe("FULL_TABLE_SNAPSHOT");
    expect(initial.snapshot.phase).toBe("BETTING");
    expect(initial.snapshot.players[0]).toMatchObject({
      playerId:"player-1",
      status:"BETTING",
      connected:true,
    });
    expect(
      attached?.scheduled.coordinator.getReconnectRegistry().records,
    ).toEqual([]);
    expect(stored.payload.table.players[0].connected).toBe(true);

    attached?.close();
    expect(attached?.scheduled.scheduler.isRunning()).toBe(false);
    expect(schedulerCancelled).toBe(true);
    expect(
      attached?.scheduled.coordinator.getTable().players[0].connected,
    ).toBe(true);
  });

  it("returns null and does not attach transport when no durable table exists",async()=>{
    server=createServer();
    let scheduled=false;

    attached=await recoverAndAttachBlackjackServerRuntime({
      server,
      tableId:"missing-server-runtime-table",
      snapshotRepository:{
        load:async()=>null,
        save:async()=>{
          throw new Error("save must not run");
        },
      },
      journalRepository:{
        loadAfter:async()=>{
          throw new Error("journal must not run");
        },
      },
      recoveredAtMs:10_000,
      nowMs:()=>10_000,
      resolveIdentity:()=>null,
      scheduler:{
        schedule:()=>{
          scheduled=true;
          return "unused";
        },
        cancelSchedule:()=>undefined,
      },
    });

    expect(attached).toBeNull();
    expect(scheduled).toBe(false);
  });
});
