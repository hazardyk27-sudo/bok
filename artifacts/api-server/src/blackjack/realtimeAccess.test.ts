import { createServer, type IncomingMessage } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import type { BlackjackPublicSnapshot } from "./publicSnapshot";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
} from "./realtime";
import {
  BLACKJACK_REALTIME_ACCESS_TTL_MS,
  issueBlackjackRealtimeAccess,
  resolveBlackjackRealtimeAccess,
} from "./realtimeAccess";

const SESSION_ID="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SIGNING_SECRET="blackjack-test-signing-secret-that-is-long-enough-123456";
const WRONG_SECRET="blackjack-test-signing-secret-that-is-wrong-654321";
const NONCE="bbbbbbbbbbbbbbbbbbbbbbbb";

function request(url:string,cookie?:string):IncomingMessage{
  return {
    url,
    headers:cookie===undefined?{}:{cookie},
  } as IncomingMessage;
}

function snapshot():BlackjackPublicSnapshot{
  return {
    serverTimeMs:1,
    tableId:"access-test-table",
    phase:"TABLE_IDLE",
    maxSeats:5,
    seats:[1,2,3,4,5].map((seatNumber)=>({
      seatNumber:seatNumber as 1|2|3|4|5,
      playerId:null,
    })),
    players:[],
    shoe:{
      shoeId:"access-test-shoe",
      cardsRemaining:312,
      reshufflePending:false,
    },
    round:null,
    stateVersion:1,
    eventSequence:1,
  };
}

function listen(server:ReturnType<typeof createServer>):Promise<number>{
  return new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(0,"127.0.0.1",()=>{
      const address=server.address();
      if(!address || typeof address==="string"){
        reject(new Error("realtime access test server did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server:ReturnType<typeof createServer>):Promise<void>{
  return new Promise((resolve)=>server.close(()=>resolve()));
}

function nextMessage(socket:WebSocket):Promise<unknown>{
  return new Promise((resolve,reject)=>{
    const onMessage=(raw:RawData)=>{
      cleanup();
      try{ resolve(JSON.parse(raw.toString())); }
      catch(error){ reject(error); }
    };
    const onError=(error:Error)=>{
      cleanup();
      reject(error);
    };
    const cleanup=()=>{
      socket.off("message",onMessage);
      socket.off("error",onError);
    };
    socket.on("message",onMessage);
    socket.on("error",onError);
  });
}

describe("blackjack realtime access token",()=>{
  let runtime:BlackjackRealtimeRuntime|undefined;
  let server:ReturnType<typeof createServer>|undefined;
  let client:WebSocket|undefined;

  afterEach(async()=>{
    client?.terminate();
    runtime?.close();
    if(server?.listening) await closeServer(server);
    runtime=undefined;
    server=undefined;
    client=undefined;
  });

  it("resolves a signed token without reading auth or game cookies",()=>{
    const issued=issueBlackjackRealtimeAccess(SESSION_ID,{
      nowMs:1_000,
      signingSecret:SIGNING_SECRET,
      createNonce:()=>NONCE,
    });

    expect(issued.expiresAtMs).toBe(1_000+BLACKJACK_REALTIME_ACCESS_TTL_MS);
    expect(resolveBlackjackRealtimeAccess(
      request(
        `${BLACKJACK_WS_PATH}?access=${issued.token}`,
        "fy_auth=stale; game_session=wrong; blackjack_realtime_session=wrong",
      ),
      {nowMs:1_001,signingSecret:SIGNING_SECRET},
    )).toEqual({
      userId:SESSION_ID,
      playerId:`blackjack-player:${SESSION_ID}`,
      sessionId:SESSION_ID,
    });
  });

  it("survives process replacement because validation has no memory state",()=>{
    const issued=issueBlackjackRealtimeAccess(SESSION_ID,{
      nowMs:10_000,
      signingSecret:SIGNING_SECRET,
      createNonce:()=>NONCE,
    });

    expect(resolveBlackjackRealtimeAccess(
      request(`${BLACKJACK_WS_PATH}?access=${issued.token}`),
      {nowMs:10_100,signingSecret:SIGNING_SECRET},
    )).toMatchObject({sessionId:SESSION_ID});
  });

  it("rejects tampered, wrong-key and expired tokens",()=>{
    const issued=issueBlackjackRealtimeAccess(SESSION_ID,{
      nowMs:20_000,
      signingSecret:SIGNING_SECRET,
      createNonce:()=>NONCE,
    });
    const tampered=issued.token.slice(0,-1)+(issued.token.endsWith("a")?"b":"a");

    expect(resolveBlackjackRealtimeAccess(
      request(`${BLACKJACK_WS_PATH}?access=${tampered}`),
      {nowMs:20_001,signingSecret:SIGNING_SECRET},
    )).toBeNull();
    expect(resolveBlackjackRealtimeAccess(
      request(`${BLACKJACK_WS_PATH}?access=${issued.token}`),
      {nowMs:20_001,signingSecret:WRONG_SECRET},
    )).toBeNull();
    expect(resolveBlackjackRealtimeAccess(
      request(`${BLACKJACK_WS_PATH}?access=${issued.token}`),
      {
        nowMs:20_000+BLACKJACK_REALTIME_ACCESS_TTL_MS+1,
        signingSecret:SIGNING_SECRET,
      },
    )).toBeNull();
  });

  it("opens a real websocket from the signed access token",async()=>{
    const issued=issueBlackjackRealtimeAccess(SESSION_ID,{
      signingSecret:SIGNING_SECRET,
      createNonce:()=>NONCE,
    });
    const tableSnapshot=snapshot();
    server=createServer();
    runtime=attachBlackjackWebSocket(
      server,
      {
        getSnapshot:()=>tableSnapshot,
        subscribe:()=>()=>undefined,
      },
      {
        resolveIdentity:(incoming)=>resolveBlackjackRealtimeAccess(
          incoming,
          {signingSecret:SIGNING_SECRET},
        ),
      },
    );
    const port=await listen(server);

    client=new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?access=${issued.token}`,
      {
        headers:{
          Cookie:"fy_auth=stale; game_session=wrong; blackjack_realtime_session=wrong",
        },
      },
    );

    await expect(nextMessage(client)).resolves.toMatchObject({
      type:"FULL_TABLE_SNAPSHOT",
      reason:"INITIAL_CONNECT",
      snapshot:{tableId:"access-test-table"},
    });
    expect(runtime.authenticatedConnectionCount()).toBe(1);
  });
});
