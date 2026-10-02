// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { connectBlackjackRealtimeElement } from "./browserRealtime";
import type { BlackjackPublicSnapshotViewSource } from "./snapshotView";

function emptySnapshot(): BlackjackPublicSnapshotViewSource {
  return {
    serverTimeMs:1_000,
    tableId:"interaction-ux-table",
    phase:"TABLE_IDLE",
    maxSeats:5,
    seats:[
      {seatNumber:1,playerId:null},
      {seatNumber:2,playerId:null},
      {seatNumber:3,playerId:null},
      {seatNumber:4,playerId:null},
      {seatNumber:5,playerId:null},
    ],
    players:[],
    round:null,
    stateVersion:1,
    eventSequence:1,
  };
}

describe("blackjack contextual interaction UX",()=>{
  it("selects an open seat first and sends CLAIM_SEAT only after confirmation",()=>{
    const listeners=new Map<
      string,
      Set<(event:Event|MessageEvent<unknown>)=>void>
    >();
    const sent:string[]=[];
    const socket={
      send:(data:string)=>sent.push(data),
      addEventListener:(
        type:string,
        listener:(event:Event|MessageEvent<unknown>)=>void,
      )=>{
        const set=listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type,set);
      },
      removeEventListener:(
        type:string,
        listener:(event:Event|MessageEvent<unknown>)=>void,
      )=>{
        listeners.get(type)?.delete(listener);
      },
      close:()=>undefined,
    };

    const app=document.createElement("div");
    document.body.append(app);

    let requestId=0;
    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"casino.example"},
      createSocket:()=>socket,
      createActionId:()=>`seat-request-${++requestId}`,
      autoReconnect:false,
      scheduleRender:()=> "render",
      cancelRender:()=>undefined,
      scheduleTransportTimer:()=> "transport",
      cancelTransportTimer:()=>undefined,
    });

    const snapshot=emptySnapshot();
    for(const listener of listeners.get("message") ?? []){
      listener(new MessageEvent("message",{
        data:JSON.stringify({
          type:"FULL_TABLE_SNAPSHOT",
          snapshot,
          resetEventSequenceTo:1,
          resetStateVersionTo:1,
        }),
      }));
    }

    const seat=app.querySelector<HTMLElement>('[data-seat="2"]');
    expect(seat?.dataset.blackjackSeatSelect).toBe("true");

    seat?.click();
    expect(sent).toHaveLength(0);
    expect(
      app.querySelector("[data-blackjack-selected-seat]")?.textContent,
    ).toBe("2");
    expect(
      app.querySelector<HTMLElement>(
        "[data-blackjack-seat-confirm]",
      )?.hidden,
    ).toBe(false);

    app.querySelector<HTMLButtonElement>(
      '[data-blackjack-seat-confirm-action="CONFIRM"]',
    )?.click();

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toMatchObject({
      type:"CLAIM_SEAT",
      requestId:"seat-request-1",
      seatNumber:2,
    });

    connection.close();
  });

  it("supports keyboard seat selection without sending a claim prematurely",()=>{
    const listeners=new Map<
      string,
      Set<(event:Event|MessageEvent<unknown>)=>void>
    >();
    const sent:string[]=[];
    const socket={
      send:(data:string)=>sent.push(data),
      addEventListener:(
        type:string,
        listener:(event:Event|MessageEvent<unknown>)=>void,
      )=>{
        const set=listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type,set);
      },
      removeEventListener:()=>undefined,
      close:()=>undefined,
    };
    const app=document.createElement("div");
    document.body.append(app);

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"casino.example"},
      createSocket:()=>socket,
      autoReconnect:false,
      scheduleRender:()=> "render",
      cancelRender:()=>undefined,
      scheduleTransportTimer:()=> "transport",
      cancelTransportTimer:()=>undefined,
    });

    const snapshot=emptySnapshot();
    for(const listener of listeners.get("message") ?? []){
      listener(new MessageEvent("message",{
        data:JSON.stringify({
          type:"FULL_TABLE_SNAPSHOT",
          snapshot,
          resetEventSequenceTo:1,
          resetStateVersionTo:1,
        }),
      }));
    }

    const seat=app.querySelector<HTMLElement>('[data-seat="4"]');
    seat?.dispatchEvent(new KeyboardEvent("keydown",{
      key:"Enter",
      bubbles:true,
    }));

    expect(sent).toHaveLength(0);
    expect(
      app.querySelector("[data-blackjack-selected-seat]")?.textContent,
    ).toBe("4");

    connection.close();
  });
});
