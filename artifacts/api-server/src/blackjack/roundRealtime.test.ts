import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import {
  BlackjackPlayerActionCoordinator,
  type BlackjackCoordinatedAction,
} from "./actionCoordinator";
import type { BlackjackRound, BlackjackTable } from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import {
  createBlackjackRoundRealtimeDriver,
} from "./roundRealtime";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function bettingTable(): BlackjackTable {
  const foundation=createBlackjackTableFoundation({
    tableId:"round-realtime-table",
    shoe:createUnshuffledBlackjackShoe({
      shoeId:"round-realtime-shoe",
      createdAtMs:1,
    }),
  });
  const round: BlackjackRound={
    roundId:"round-realtime-1",
    roundNumber:1,
    phase:"BETTING",
    activeSeatOrder:[],
    hands:[],
    dealer:{cards:[],holeCardRevealed:false},
    currentTurn:null,
    startedAtMs:0,
    bettingClosesAtMs:10_000,
    finishedAtMs:null,
  };

  return {
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
  };
}

function coordinator(){
  return new BlackjackPlayerActionCoordinator({
    table:bettingTable(),
    accounts:[{
      playerId:"player-1",
      userId:"user-1",
      wallet:createBlackjackWalletLedgerState({
        userId:"user-1",
        totalBalanceCents:100_000,
      }),
      book:createBlackjackReservationBook("user-1"),
    }],
    bettingLimits:{minBetCents:1_000,maxBetCents:null},
  });
}

function action(
  type:"PLACE_BET"|"READY",
  actionId:string,
  expectedStateVersion:number,
): BlackjackCoordinatedAction {
  return {
    envelope:{
      actionId,
      actorPlayerId:"player-1",
      type,
      tableId:"round-realtime-table",
      expectedStateVersion,
      roundId:"round-realtime-1",
      handId:null,
      seatNumber:1,
      payloadFingerprint:type+"|"+actionId,
    },
    nowMs:9_000,
    ...(type==="PLACE_BET"
      ? {
          chipValueCents:1_000,
          reservationId:"reservation-"+actionId,
          reserveTransactionId:"reserve-"+actionId,
        }
      : {}),
  };
}

function nextMessages(
  socket: WebSocket,
  count: number,
): Promise<unknown[]> {
  return new Promise((resolve,reject)=>{
    const messages: unknown[]=[];
    const cleanup=()=>{
      socket.off("message",onMessage);
      socket.off("error",onError);
    };
    const onError=(error: Error)=>{
      cleanup();
      reject(error);
    };
    const onMessage=(raw: RawData)=>{
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch(error) {
        cleanup();
        reject(error);
        return;
      }
      if(messages.length===count){
        cleanup();
        resolve(messages);
      }
    };
    socket.on("message",onMessage);
    socket.on("error",onError);
  });
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const address=server.address();
      if(!address || typeof address==="string"){
        reject(new Error("Blackjack realtime runtime test did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(
  server: ReturnType<typeof createServer>,
): Promise<void> {
  return new Promise((resolve)=>server.close(()=>resolve()));
}

describe("blackjack round runtime realtime publication",()=>{
  let runtime: BlackjackRealtimeRuntime | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  let client: WebSocket | undefined;

  afterEach(async()=>{
    client?.terminate();
    runtime?.close();
    if(server?.listening) await closeServer(server);
    client=undefined;
    runtime=undefined;
    server=undefined;
  });

  it("broadcasts betting-close and initial-deal snapshots in exact cursor order",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-1",0));
    await game.submit(action("READY","ready-1",1));

    let clock=9_999;
    const driver=createBlackjackRoundRealtimeDriver(
      game,
      { nowMs:()=>clock },
    );

    server=createServer();
    runtime=attachBlackjackWebSocket(
      server,
      driver.source,
    );
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    const [initial]=await nextMessages(client,1) as [{
      type:string;
      snapshot:{phase:string;stateVersion:number;eventSequence:number};
    }];

    expect(initial.type).toBe("FULL_TABLE_SNAPSHOT");
    expect(initial.snapshot.phase).toBe("BETTING");
    expect(initial.snapshot.stateVersion).toBe(2);
    expect(initial.snapshot.eventSequence).toBe(2);

    clock=10_000;
    const updates=nextMessages(client,2);
    const tick=await driver.tick();
    const [locked,dealt]=await updates as Array<{
      type:string;
      snapshot:{
        phase:string;
        stateVersion:number;
        eventSequence:number;
        round:{phase:string}|null;
      };
    }>;

    expect(tick.status).toBe("ROUND_STARTED");
    expect(locked.type).toBe("snapshot");
    expect(locked.snapshot).toMatchObject({
      phase:"BETTING_LOCKED",
      stateVersion:3,
      eventSequence:3,
    });
    expect(dealt.type).toBe("snapshot");
    expect(dealt.snapshot).toMatchObject({
      phase:"PLAYER_TURNS",
      stateVersion:4,
      eventSequence:4,
    });
    expect(dealt.snapshot.round?.phase).toBe("PLAYER_TURNS");

    const current=await driver.source.getSnapshot();
    expect(current.stateVersion).toBe(4);
    expect(current.eventSequence).toBe(4);
    expect(current.phase).toBe("PLAYER_TURNS");
  });

  it("does not publish duplicate snapshots when a later tick is a no-op",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-2",0));
    await game.submit(action("READY","ready-2",1));

    let clock=10_000;
    const driver=createBlackjackRoundRealtimeDriver(
      game,
      { nowMs:()=>clock },
    );
    const published: number[]=[];
    const unsubscribe=driver.source.subscribe((snapshot)=>{
      published.push(snapshot.eventSequence);
    });

    await driver.tick();
    expect(published).toEqual([3,4]);

    clock=10_100;
    const replay=await driver.tick();
    expect(replay.status).toBe("NOOP");
    expect(published).toEqual([3,4]);

    unsubscribe();
  });

  it("publishes timeout, dealer and settlement snapshots without cursor gaps",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","bet-timeout-live",0));
    await game.submit(action("READY","ready-timeout-live",1));

    let clock=10_000;
    const driver=createBlackjackRoundRealtimeDriver(
      game,
      { nowMs:()=>clock },
    );
    await driver.tick();

    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();
    const published: Array<{
      phase:string;
      stateVersion:number;
      eventSequence:number;
    }>=[];
    const unsubscribe=driver.source.subscribe((snapshot)=>{
      published.push({
        phase:snapshot.phase,
        stateVersion:snapshot.stateVersion,
        eventSequence:snapshot.eventSequence,
      });
    });

    clock=turn!.endsAtMs;
    const tick=await driver.tick();

    expect(tick.status).toBe("ROUND_ENDED");
    expect(published).toEqual([
      {
        phase:"DEALER_TURN",
        stateVersion:5,
        eventSequence:5,
      },
      {
        phase:"SETTLEMENT",
        stateVersion:6,
        eventSequence:6,
      },
      {
        phase:"ROUND_END",
        stateVersion:7,
        eventSequence:7,
      },
    ]);

    unsubscribe();
  });


  it("publishes the next betting round as the next contiguous realtime cursor",async()=>{
    const game=coordinator();
    await game.submit(action("PLACE_BET","cycle-live-bet",0));
    await game.submit(action("READY","cycle-live-ready",1));

    let clock=10_000;
    const driver=createBlackjackRoundRealtimeDriver(
      game,
      { nowMs:()=>clock },
    );
    await driver.tick();

    const turn=game.getTable().round?.currentTurn;
    expect(turn).not.toBeNull();

    clock=turn!.endsAtMs;
    await driver.tick();
    expect(game.getTable().phase).toBe("ROUND_END");
    const endedSequence=game.getTable().eventSequence;

    const published: Array<{
      phase:string;
      stateVersion:number;
      eventSequence:number;
      roundNumber:number|null;
    }>=[];
    const unsubscribe=driver.source.subscribe((snapshot)=>{
      published.push({
        phase:snapshot.phase,
        stateVersion:snapshot.stateVersion,
        eventSequence:snapshot.eventSequence,
        roundNumber:snapshot.round?.roundNumber ?? null,
      });
    });

    clock+=2_999;
    const holding=await driver.tick();
    expect(holding.status).toBe("WAITING_FOR_NEXT_ROUND");
    expect(published).toEqual([]);

    clock+=1;
    const next=await driver.tick();

    expect(next.status).toBe("NEXT_BETTING_ROUND_STARTED");
    expect(published).toEqual([{
      phase:"BETTING",
      stateVersion:game.getTable().stateVersion,
      eventSequence:endedSequence+1,
      roundNumber:2,
    }]);
    unsubscribe();
  });

});
