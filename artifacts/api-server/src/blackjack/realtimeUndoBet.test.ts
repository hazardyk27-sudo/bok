import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import type { BlackjackCoordinatedAction } from "./actionCoordinator";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
  type BlackjackRealtimeSource,
} from "./realtime";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onError=(error:Error)=>{
      socket.off("message",onMessage);
      reject(error);
    };
    const onMessage=(raw:RawData)=>{
      socket.off("error",onError);
      resolve(JSON.parse(raw.toString()));
    };
    socket.once("error",onError);
    socket.once("message",onMessage);
  });
}

function listen(server:ReturnType<typeof createServer>):Promise<number>{
  return new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const address=server.address();
      if(!address || typeof address==="string"){
        reject(new Error("Blackjack UNDO realtime test server did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server:ReturnType<typeof createServer>):Promise<void>{
  return new Promise((resolve)=>server.close(()=>resolve()));
}

describe("blackjack realtime wager undo routing",()=>{
  let runtime:BlackjackRealtimeRuntime|undefined;
  let server:ReturnType<typeof createServer>|undefined;
  let client:WebSocket|undefined;

  afterEach(async()=>{
    client?.terminate();
    runtime?.close();
    if(server?.listening) await closeServer(server);
    client=undefined;
    runtime=undefined;
    server=undefined;
  });

  it("admits UNDO_BET and routes it to the authenticated action transaction",async()=>{
    const table=createBlackjackTableFoundation({
      tableId:"undo-realtime-table",
      shoe:createUnshuffledBlackjackShoe({
        shoeId:"undo-realtime-shoe",
        createdAtMs:1,
      }),
    });
    const snapshot=buildBlackjackPublicSnapshot(table,1_000);
    const source:BlackjackRealtimeSource={
      getSnapshot:()=>snapshot,
      subscribe:()=>()=>undefined,
    };

    let resolveRouted!:(action:BlackjackCoordinatedAction)=>void;
    const routed=new Promise<BlackjackCoordinatedAction>((resolve)=>{
      resolveRouted=resolve;
    });

    server=createServer();
    runtime=attachBlackjackWebSocket(server,source,{
      nowMs:()=>2_000,
      createConnectionId:()=>"undo-realtime-connection",
      resolveIdentity:()=>({
        userId:"undo-user",
        playerId:"undo-player",
        sessionId:"undo-session",
      }),
      handlePlayerActionTransaction:(action)=>{
        resolveRouted(action);
      },
    });

    const port=await listen(server);
    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    await nextMessage(client);

    client.send(JSON.stringify({
      type:"UNDO_BET",
      actionId:"undo-route-1",
      expectedStateVersion:snapshot.stateVersion,
      roundId:"undo-round",
      seatNumber:3,
    }));

    const action=await routed;
    expect(action.envelope).toMatchObject({
      type:"UNDO_BET",
      actionId:"undo-route-1",
      actorPlayerId:"undo-player",
      tableId:"undo-realtime-table",
      expectedStateVersion:snapshot.stateVersion,
      roundId:"undo-round",
      seatNumber:3,
    });
    expect(action).toMatchObject({
      nowMs:2_000,
      releaseTransactionId:
        "blackjack:undo-realtime-table:undo-route-1:undo-bet-tx",
    });
  });
});