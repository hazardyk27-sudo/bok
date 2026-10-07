import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  attachBlackjackWebSocket,
  BLACKJACK_WS_PATH,
  type BlackjackRealtimeIdentity,
} from "./realtime";
import { resolveBlackjackLiveRealtimeIdentity } from "./realtimeIdentityGuard";

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve)=>server.close(()=>resolve()));
}

function nextTick(): Promise<void> {
  return new Promise((resolve)=>setTimeout(resolve,10));
}

describe("blackjack realtime closed transport integration",()=>{
  let server: Server | null=null;
  let runtime: ReturnType<typeof attachBlackjackWebSocket> | null=null;

  afterEach(async()=>{
    runtime?.close();
    runtime=null;
    if(server!==null) await closeServer(server);
    server=null;
  });

  it("does not register a ghost connection when transport dies during async auth",async()=>{
    server=createServer();

    let releaseAuth!: (identity: BlackjackRealtimeIdentity)=>void;
    const pendingIdentity=new Promise<BlackjackRealtimeIdentity>((resolve)=>{
      releaseAuth=resolve;
    });
    let connectedCalls=0;
    let snapshotCalls=0;

    runtime=attachBlackjackWebSocket(
      server,
      {
        getSnapshot:async()=>{
          snapshotCalls+=1;
          throw new Error("closed transport must never request a snapshot");
        },
        subscribe:()=>()=>undefined,
      },
      {
        resolveIdentity:(request)=>
          resolveBlackjackLiveRealtimeIdentity(
            request,
            async()=>pendingIdentity,
          ),
        onIdentityConnected:()=>{
          connectedCalls+=1;
        },
      },
    );

    await new Promise<void>((resolve)=>server!.listen(0,"127.0.0.1",resolve));
    const address=server.address();
    if(address===null || typeof address==="string"){
      throw new Error("test server did not expose a TCP port");
    }

    const client=new WebSocket(
      `ws://127.0.0.1:${address.port}${BLACKJACK_WS_PATH}`,
    );
    await once(client,"open");
    client.terminate();
    await once(client,"close");
    await nextTick();

    releaseAuth({userId:"u1",playerId:"p1",sessionId:"s1"});
    await nextTick();

    expect(runtime.connectionCount()).toBe(0);
    expect(runtime.authenticatedConnectionCount()).toBe(0);
    expect(connectedCalls).toBe(0);
    expect(snapshotCalls).toBe(0);
  });
});
