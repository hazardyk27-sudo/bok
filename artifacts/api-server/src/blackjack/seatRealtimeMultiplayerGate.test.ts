import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import type {
  BlackjackCard,
  BlackjackShoe,
} from "./domain";
import { createBlackjackReservationBook } from "./reservations";
import { BLACKJACK_WS_PATH } from "./realtime";
import {
  initializeAndAttachBlackjackServerRuntime,
  type BlackjackAttachedServerRuntime,
} from "./serverRuntime";
import { createUnshuffledBlackjackShoe } from "./shoe";
import type {
  BlackjackDurableSnapshot,
} from "./snapshotState";
import { createBlackjackWalletLedgerState } from "./walletLedger";

type JsonMessage=Record<string,unknown>;

class MessageInbox {
  readonly history: JsonMessage[]=[];
  private readonly waiters: Array<{
    predicate:(message:JsonMessage)=>boolean;
    resolve:(message:JsonMessage)=>void;
  }>=[];

  constructor(readonly socket: WebSocket){
    socket.on("message",(raw:RawData)=>{
      const parsed=JSON.parse(raw.toString()) as JsonMessage;
      this.history.push(parsed);
      const index=this.waiters.findIndex(
        (waiter)=>waiter.predicate(parsed),
      );
      if(index>=0){
        const [waiter]=this.waiters.splice(index,1);
        waiter?.resolve(parsed);
      }
    });
  }

  waitFor(
    predicate:(message:JsonMessage)=>boolean,
  ):Promise<JsonMessage>{
    const existing=this.history.find(predicate);
    if(existing) return Promise.resolve(existing);
    return new Promise((resolve)=>{
      this.waiters.push({predicate,resolve});
    });
  }

  latestSnapshot(): JsonMessage {
    const envelope=[...this.history].reverse().find(
      (message)=>
        (
          message.type==="snapshot" ||
          message.type==="FULL_TABLE_SNAPSHOT"
        ) &&
        typeof message.snapshot==="object" &&
        message.snapshot!==null,
    );
    if(!envelope){
      throw new Error("Blackjack client has no public snapshot");
    }
    return envelope.snapshot as JsonMessage;
  }

  latestPrivateState(): JsonMessage | null {
    return [...this.history].reverse().find(
      (message)=>message.type==="PRIVATE_PLAYER_STATE",
    ) ?? null;
  }
}

function gateShoe(): BlackjackShoe {
  const source=createUnshuffledBlackjackShoe({
    shoeId:"five-client-gate-shoe",
    createdAtMs:1,
  });
  const cards=[...source.cards];
  const ranks: readonly BlackjackCard["rank"][]=[
    "10","9","8","7","6","10",
    "7","8","9","10","5","6",
  ];

  for(let target=0;target<ranks.length;target+=1){
    const index=cards.findIndex(
      (card,candidateIndex)=>
        candidateIndex>=target &&
        card.rank===ranks[target],
    );
    if(index<0){
      throw new Error("Blackjack five-client gate rank missing");
    }
    [cards[target],cards[index]]=[cards[index],cards[target]];
  }
  return {...source,cards};
}

function listen(
  server: ReturnType<typeof createServer>,
): Promise<number> {
  return new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const address=server.address();
      if(!address || typeof address==="string"){
        reject(new Error("Blackjack five-client gate did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(
  server: ReturnType<typeof createServer>,
):Promise<void>{
  return new Promise((resolve)=>server.close(()=>resolve()));
}

function snapshotCursor(snapshot:JsonMessage){
  const stateVersion=snapshot.stateVersion;
  const eventSequence=snapshot.eventSequence;
  if(
    typeof stateVersion!=="number" ||
    typeof eventSequence!=="number"
  ){
    throw new Error("Blackjack gate snapshot cursor is invalid");
  }
  return {stateVersion,eventSequence};
}

describe("blackjack five-client realtime entry-to-game gate",()=>{
  let server: ReturnType<typeof createServer>|undefined;
  let attached: BlackjackAttachedServerRuntime|null=null;
  const clients: WebSocket[]=[];

  afterEach(async()=>{
    attached?.close();
    for(const client of clients){
      client.terminate();
    }
    clients.length=0;
    if(server?.listening){
      await closeServer(server);
    }
    attached=null;
    server=undefined;
  });

  it("takes five authenticated clients from empty table through seats, bets and authoritative initial deal",async()=>{
    server=createServer();
    let stored: BlackjackDurableSnapshot|null=null;
    let clock=10_000;
    let connectionSequence=0;

    attached=await initializeAndAttachBlackjackServerRuntime({
      server,
      tableId:"five-client-gate-table",
      snapshotRepository:{
        load:async()=>stored,
        save:async(snapshot,expectedPreviousStateVersion)=>{
          if(stored===null){
            expect(expectedPreviousStateVersion).toBeNull();
          } else {
            expect(expectedPreviousStateVersion)
              .toBe(stored.stateVersion);
          }
          stored=snapshot;
          return snapshot;
        },
      },
      journalRepository:{loadAfter:async()=>[]},
      recoveredAtMs:clock,
      nowMs:()=>clock,
      resolveIdentity:(request)=>{
        const url=new URL(
          request.url ?? "/",
          "http://localhost",
        );
        const id=Number(url.searchParams.get("client"));
        if(!Number.isInteger(id) || id<1 || id>5){
          return null;
        }
        return {
          userId:"gate-user-"+id,
          playerId:"gate-player-"+id,
          sessionId:"gate-session-"+id,
        };
      },
      loadSeatAccount:async(identity)=>({
        playerId:identity.playerId,
        userId:identity.userId,
        wallet:createBlackjackWalletLedgerState({
          userId:identity.userId,
          totalBalanceCents:100_000,
        }),
        book:createBlackjackReservationBook(identity.userId),
      }),
      createInitialShoe:gateShoe,
      createFreshShoe:gateShoe,
      createConnectionId:()=>
        "gate-connection-"+(++connectionSequence),
      bettingWindowMs:10_000,
      scheduler:{
        schedule:()=> "five-client-gate-scheduler",
        cancelSchedule:()=>undefined,
      },
    });

    const port=await listen(server);
    const inboxes: MessageInbox[]=[];
    for(let id=1;id<=5;id+=1){
      const client=new WebSocket(
        `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?client=${id}`,
      );
      clients.push(client);
      const inbox=new MessageInbox(client);
      inboxes.push(inbox);
      const initial=await inbox.waitFor(
        (message)=>message.type==="FULL_TABLE_SNAPSHOT",
      );
      expect((initial.snapshot as JsonMessage).phase)
        .toBe("TABLE_IDLE");
    }

    const claimAcks=await Promise.all(
      inboxes.map(async(inbox,index)=>{
        inbox.socket.send(JSON.stringify({
          type:"CLAIM_SEAT",
          requestId:"claim-"+(index+1),
          seatNumber:index+1,
        }));
        return inbox.waitFor(
          (message)=>
            message.type==="SEAT_CLAIM_ACCEPTED" &&
            message.requestId==="claim-"+(index+1),
        );
      }),
    );

    expect(
      claimAcks
        .map((ack)=>ack.eventSequence)
        .sort((left,right)=>(left as number)-(right as number)),
    ).toEqual([1,2,3,4,5]);
    expect(attached.scheduled.coordinator.getTable()).toMatchObject({
      phase:"BETTING",
      stateVersion:8,
      eventSequence:5,
      round:{
        roundId:"five-client-gate-table:round-1",
        roundNumber:1,
        phase:"BETTING",
        bettingClosesAtMs:20_000,
      },
    });
    expect(attached.scheduled.coordinator.getTable().players)
      .toHaveLength(5);
    expect(attached.scheduled.coordinator.getTable().seats.every(
      (seat)=>seat.playerId!==null,
    )).toBe(true);

    for(const inbox of inboxes){
      await inbox.waitFor((message)=>
        message.type==="snapshot" &&
        (message.snapshot as JsonMessage).eventSequence===5
      );
    }

    for(let index=0;index<5;index+=1){
      const inbox=inboxes[index]!;
      const seatNumber=index+1;

      for(const type of ["PLACE_BET","READY"] as const){
        const before=inbox.latestSnapshot();
        const cursor=snapshotCursor(before);
        const round=before.round as JsonMessage;
        const actionId=
          "round1-"+type.toLowerCase()+"-"+seatNumber;

        inbox.socket.send(JSON.stringify({
          type,
          actionId,
          expectedStateVersion:cursor.stateVersion,
          roundId:round.roundId,
          seatNumber,
          ...(type==="PLACE_BET"
            ? {chipValueCents:1_000}
            : {}),
        }));

        const ack=await inbox.waitFor(
          (message)=>
            message.type==="ACTION_ACCEPTED" &&
            message.actionId===actionId,
        );
        const acknowledgedSequence=ack.eventSequence;
        expect(typeof acknowledgedSequence).toBe("number");

        await Promise.all(
          inboxes.map((candidate)=>candidate.waitFor(
            (message)=>
              message.type==="snapshot" &&
              (message.snapshot as JsonMessage).eventSequence===
                acknowledgedSequence,
          )),
        );
      }
    }

    expect(attached.scheduled.coordinator.getTable()).toMatchObject({
      phase:"BETTING",
      stateVersion:18,
      eventSequence:15,
    });
    expect(attached.scheduled.coordinator.getBettingPositions())
      .toHaveLength(5);
    expect(attached.scheduled.coordinator.getBettingPositions().every(
      (position)=>position.status==="READY",
    )).toBe(true);

    for(const inbox of inboxes){
      const privateState=inbox.latestPrivateState();
      expect(privateState).toMatchObject({
        type:"PRIVATE_PLAYER_STATE",
        stateVersion:18,
        eventSequence:15,
        availableBalanceCents:99_000,
        reservedBalanceCents:1_000,
        betting:{
          status:"READY",
          betCents:1_000,
        },
      });
    }

    clock=20_000;
    const started=await attached.scheduled.authority.driver.tick();
    expect(started.status).toBe("ROUND_STARTED");
    expect(started.transitions.map((transition)=>transition.type))
      .toEqual([
        "BETTING_LOCKED",
        "INITIAL_DEAL_COMMITTED",
      ]);

    const table=attached.scheduled.coordinator.getTable();
    expect(table).toMatchObject({
      phase:"PLAYER_TURNS",
      stateVersion:20,
      eventSequence:17,
    });
    expect(table.shoe.nextIndex).toBe(12);
    expect(table.round?.hands).toHaveLength(5);
    expect(table.round?.hands.every(
      (hand)=>hand.cards.length===2,
    )).toBe(true);
    expect(table.round?.dealer.cards).toHaveLength(2);
    expect(table.round?.dealer.holeCardRevealed).toBe(false);

    for(const inbox of inboxes){
      const live=await inbox.waitFor(
        (message)=>
          message.type==="snapshot" &&
          (message.snapshot as JsonMessage).eventSequence===17,
      );
      const snapshot=live.snapshot as JsonMessage;
      expect(snapshot.phase).toBe("PLAYER_TURNS");
      const round=snapshot.round as JsonMessage;
      const dealer=round.dealer as JsonMessage;
      const dealerCards=dealer.cards as unknown[];
      expect(dealerCards).toHaveLength(2);
      expect(dealerCards[1]).toBeNull();
    }

    const persistedSnapshot=
      stored as BlackjackDurableSnapshot | null;
    if(persistedSnapshot===null){
      throw new Error("Blackjack five-client gate did not persist snapshot");
    }
    expect(persistedSnapshot.stateVersion).toBe(20);
    expect(persistedSnapshot.eventSequence).toBe(17);
  });
});
