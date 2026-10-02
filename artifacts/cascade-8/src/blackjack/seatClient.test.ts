import { describe, expect, it } from "vitest";
import {
  createBlackjackSeatCommandClient,
} from "./seatClient";
import type { BlackjackRealtimeSocketLike } from "./realtimeClient";

describe("blackjack browser seat command client",()=>{
  it("keeps claim pending through ACK, requests sync, then completes on matching snapshot",()=>{
    const sent:string[]=[];
    const socket:BlackjackRealtimeSocketLike={
      send:(data)=>sent.push(data),
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    };
    const client=createBlackjackSeatCommandClient({
      socket,
      createRequestId:()=>"seat-request-1",
    });

    client.claim(3);
    expect(JSON.parse(sent[0])).toEqual({
      type:"CLAIM_SEAT",
      requestId:"seat-request-1",
      seatNumber:3,
    });

    client.receive({
      type:"SEAT_CLAIM_ACCEPTED",
      requestId:"seat-request-1",
      seatNumber:3,
      replayed:false,
      stateVersion:2,
      eventSequence:1,
    });
    expect(client.getPending()?.acceptedEventSequence).toBe(1);
    expect(JSON.parse(sent[1])).toEqual({type:"sync"});

    client.receive({
      type:"FULL_TABLE_SNAPSHOT",
      snapshot:{stateVersion:2,eventSequence:1},
    });
    expect(client.getPending()).toBeNull();
    expect(client.getFeedback()).toEqual({
      status:"ACCEPTED",
      requestId:"seat-request-1",
      type:"CLAIM_SEAT",
      error:null,
    });
  });

  it("sends leave and clears rejected commands",()=>{
    const sent:string[]=[];
    const socket:BlackjackRealtimeSocketLike={
      send:(data)=>sent.push(data),
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    };
    const client=createBlackjackSeatCommandClient({
      socket,
      createRequestId:()=>"leave-request-1",
    });

    client.leave();
    expect(JSON.parse(sent[0])).toEqual({
      type:"LEAVE_SEAT",
      requestId:"leave-request-1",
    });
    client.receive({
      type:"SEAT_LEAVE_REJECTED",
      requestId:"leave-request-1",
      error:"SEAT_LEAVE_NOT_AVAILABLE",
    });
    expect(client.getPending()).toBeNull();
    expect(client.getFeedback()).toEqual({
      status:"REJECTED",
      requestId:"leave-request-1",
      type:"LEAVE_SEAT",
      error:"SEAT_LEAVE_NOT_AVAILABLE",
    });
  });

  it("requests sync after accepted leave as well",()=>{
    const sent:string[]=[];
    const socket:BlackjackRealtimeSocketLike={
      send:(data)=>sent.push(data),
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    };
    const client=createBlackjackSeatCommandClient({
      socket,
      createRequestId:()=>"leave-request-2",
    });

    client.leave();
    client.receive({
      type:"SEAT_LEAVE_ACCEPTED",
      requestId:"leave-request-2",
      replayed:false,
      stateVersion:4,
      eventSequence:3,
    });

    expect(JSON.parse(sent[1])).toEqual({type:"sync"});
  });

  it("clears pending and exposes feedback when transport send throws",()=>{
    const client=createBlackjackSeatCommandClient({
      socket:{
        send:()=>{ throw new Error("socket closed"); },
        addEventListener:()=>undefined,
        removeEventListener:()=>undefined,
      },
      createRequestId:()=>"seat-send-error",
    });

    expect(()=>client.claim(2)).toThrow(/socket closed/);
    expect(client.getPending()).toBeNull();
    expect(client.getFeedback()).toMatchObject({
      status:"REJECTED",
      requestId:"seat-send-error",
      type:"CLAIM_SEAT",
    });
  });
});