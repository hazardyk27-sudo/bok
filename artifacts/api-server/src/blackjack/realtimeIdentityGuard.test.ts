import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  isBlackjackRealtimeRequestAlive,
  resolveBlackjackLiveRealtimeIdentity,
} from "./realtimeIdentityGuard";

function fakeRequest(): IncomingMessage {
  return {
    aborted:false,
    destroyed:false,
    socket:{destroyed:false},
  } as unknown as IncomingMessage;
}

describe("blackjack realtime identity transport guard",()=>{
  it("accepts identity while request transport stays alive",async()=>{
    const request=fakeRequest();
    const identity={userId:"u1",playerId:"p1",sessionId:"s1"} as const;

    expect(isBlackjackRealtimeRequestAlive(request)).toBe(true);
    await expect(
      resolveBlackjackLiveRealtimeIdentity(request,async()=>identity),
    ).resolves.toEqual(identity);
  });

  it("rejects before resolving when request transport is already closed",async()=>{
    const request=fakeRequest();
    (request.socket as {destroyed:boolean}).destroyed=true;
    let resolverCalls=0;

    await expect(
      resolveBlackjackLiveRealtimeIdentity(request,async()=>{
        resolverCalls+=1;
        return {userId:"u1",playerId:"p1",sessionId:"s1"};
      }),
    ).resolves.toBeNull();
    expect(resolverCalls).toBe(0);
  });

  it("drops identity when transport closes while async auth is resolving",async()=>{
    const request=fakeRequest();
    let finish!:()=>void;
    const blocked=new Promise<void>((resolve)=>{finish=resolve;});
    const pending=resolveBlackjackLiveRealtimeIdentity(
      request,
      async()=>{
        await blocked;
        return {userId:"u1",playerId:"p1",sessionId:"s1"};
      },
    );

    (request as unknown as {destroyed:boolean}).destroyed=true;
    (request.socket as {destroyed:boolean}).destroyed=true;
    finish();

    await expect(pending).resolves.toBeNull();
  });
});
