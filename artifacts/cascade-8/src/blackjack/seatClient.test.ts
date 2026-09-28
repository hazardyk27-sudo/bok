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
      playerId:"local-player",
      availableBalanceCents:100_000,
      reservedBalanceCents:0,
      replayed:false,
      stateVersion:2,
      eventSequence:1,
    });
    expect(client.getPending()?.acceptedEventSequence).toBe(1);
    expect(client.getConfirmed()).toEqual({
      playerId:"local-player",
      seatNumber:3,
      availableBalanceCents:100_000,
      reservedBalanceCents:0,
    });

    client.receive({
      type:"snapshot",
      snapshot:{stateVersion:2,eventSequence:1},
    });
    expect(client.getPending()).toBeNull();
    expect(client.getConfirmed()?.playerId).toBe("local-player");
  });

  it("clears confirmed local seat only after an accepted leave reaches its snapshot",()=>{
    const socket:BlackjackRealtimeSocketLike={
      send:()=>undefined,
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    };
    let request=0;
    const client=createBlackjackSeatCommandClient({
      socket,
      createRequestId:()=>"seat-request-"+(++request),
    });

    client.claim(2);
    client.receive({
      type:"SEAT_CLAIM_ACCEPTED",
      requestId:"seat-request-1",
      seatNumber:2,
      playerId:"local-player",
      availableBalanceCents:75_000,
      reservedBalanceCents:0,
      replayed:false,
      stateVersion:4,
      eventSequence:4,
    });
    client.receive({
      type:"snapshot",
      snapshot:{stateVersion:4,eventSequence:4},
    });
    expect(client.getConfirmed()?.seatNumber).toBe(2);

    client.leave();
    client.receive({
      type:"SEAT_LEAVE_ACCEPTED",
      requestId:"seat-request-2",
      replayed:false,
      stateVersion:5,
      eventSequence:5,
    });
    expect(client.getConfirmed()?.seatNumber).toBe(2);

    client.receive({
      type:"snapshot",
      snapshot:{stateVersion:5,eventSequence:5},
    });
    expect(client.getConfirmed()).toBeNull();
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
