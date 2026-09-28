import { describe, expect, it } from "vitest";
import {
  createBlackjackSeatCommandClient,
} from "./seatClient";
import type { BlackjackRealtimeSocketLike } from "./realtimeClient";

describe("blackjack browser seat command client",()=>{
  it("keeps claim pending through ACK until matching snapshot cursor arrives",()=>{
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

    client.receive({
      type:"snapshot",
      snapshot:{stateVersion:2,eventSequence:1},
    });
    expect(client.getPending()).toBeNull();
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
  });
});
