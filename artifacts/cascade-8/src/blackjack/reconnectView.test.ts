import { describe, expect, it } from "vitest";
import {
  connectBlackjackRealtimeElement,
  type BlackjackBrowserSocket,
} from "./browserRealtime";

type Listener = (event: MessageEvent<unknown> | Event) => void;

function physicalSocket() {
  const listeners=new Map<string,Set<Listener>>();
  const sent:string[]=[];
  const closeCalls:Array<[number|undefined,string|undefined]>=[];
  const socket: BlackjackBrowserSocket={
    send:(data)=>sent.push(data),
    addEventListener:(type,listener)=>{
      const set=listeners.get(type) ?? new Set<Listener>();
      set.add(listener as Listener);
      listeners.set(type,set);
    },
    removeEventListener:(type,listener)=>{
      listeners.get(type)?.delete(listener as Listener);
    },
    close:(code,reason)=>closeCalls.push([code,reason]),
  };
  const emit=(type:string,event:Event|MessageEvent<unknown>)=>{
    for(const listener of listeners.get(type) ?? []){
      listener(event);
    }
  };
  return {socket,listeners,sent,closeCalls,emit};
}

function fullSnapshot(eventSequence:number,roundId:string){
  return {
    type:"FULL_TABLE_SNAPSHOT",
    resetEventSequenceTo:eventSequence,
    resetStateVersionTo:eventSequence,
    snapshot:{
      serverTimeMs:1_000,
      tableId:"reconnect-ui-table",
      phase:"BETTING",
      maxSeats:5,
      seats:[
        {seatNumber:1,playerId:"local-player"},
        {seatNumber:2,playerId:null},
        {seatNumber:3,playerId:null},
        {seatNumber:4,playerId:null},
        {seatNumber:5,playerId:null},
      ],
      players:[{
        playerId:"local-player",
        seatNumber:1,
        status:"BETTING",
        connected:true,
      }],
      round:{
        roundId,
        phase:"BETTING",
        hands:[],
        dealer:{cards:[],holeCardRevealed:false},
        currentTurn:null,
        bettingClosesAtMs:10_000,
      },
      stateVersion:eventSequence,
      eventSequence,
    },
  };
}

describe("blackjack resilient browser realtime transport",()=>{
  it("reconnects after an unexpected close and resyncs through a new full snapshot",()=>{
    const physicals:Array<ReturnType<typeof physicalSocket>>=[];
    const reconnectCallbacks:Array<()=>void>=[];
    const app={
      innerHTML:"",
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    } as unknown as HTMLElement;

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"blackjack.example"},
      getViewContext:()=>({
        localPlayerId:"local-player",
        availableBalanceCents:100_000,
      }),
      createSocket:()=>{
        const next=physicalSocket();
        physicals.push(next);
        return next.socket;
      },
      scheduleReconnect:(callback)=>{
        reconnectCallbacks.push(callback);
        return callback;
      },
      cancelReconnect:()=>undefined,
      reconnectJitterRatio:0,
      scheduleTransportTimer:()=> "transport-timer",
      cancelTransportTimer:()=>undefined,
      scheduleRender:()=> "render-handle",
      cancelRender:()=>undefined,
    });

    expect(physicals).toHaveLength(1);
    expect(connection.getStatus()).toMatchObject({
      state:"CONNECTING",
      transportConnected:false,
      cursor:null,
    });
    physicals[0].emit(
      "message",
      new MessageEvent("message",{
        data:JSON.stringify(fullSnapshot(1,"round-1")),
      }),
    );
    expect(connection.controller.getCursor()).toEqual({
      eventSequence:1,
      stateVersion:1,
    });
    expect(connection.getStatus()).toMatchObject({
      state:"READY",
      transportConnected:true,
      cursor:{eventSequence:1,stateVersion:1},
    });
    expect(app.innerHTML).toContain("BETTING");

    physicals[0].emit(
      "close",
      Object.assign(new Event("close"),{code:1006}),
    );
    expect(reconnectCallbacks).toHaveLength(1);
    expect(connection.getStatus().state).toBe("RECONNECTING");
    reconnectCallbacks[0]();
    expect(physicals).toHaveLength(2);

    physicals[1].emit(
      "message",
      new MessageEvent("message",{
        data:JSON.stringify(fullSnapshot(5,"round-2")),
      }),
    );
    expect(connection.controller.getCursor()).toEqual({
      eventSequence:5,
      stateVersion:5,
    });

    connection.close();
    expect(connection.getStatus().state).toBe("CLOSED");
  });

  it("backs off repeated pre-ready failures and resets after a full snapshot",()=>{
    const physicals:Array<ReturnType<typeof physicalSocket>>=[];
    const delays:number[]=[];
    const reconnectCallbacks:Array<()=>void>=[];
    const app={
      innerHTML:"",
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    } as unknown as HTMLElement;

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"blackjack.example"},
      createSocket:()=>{
        const next=physicalSocket();
        physicals.push(next);
        return next.socket;
      },
      reconnectDelayMs:500,
      reconnectMaxDelayMs:4_000,
      reconnectJitterRatio:0,
      scheduleReconnect:(callback,delayMs)=>{
        reconnectCallbacks.push(callback);
        delays.push(delayMs);
        return callback;
      },
      cancelReconnect:()=>undefined,
      scheduleTransportTimer:()=> "transport-timer",
      cancelTransportTimer:()=>undefined,
      scheduleRender:()=> "render-handle",
      cancelRender:()=>undefined,
    });

    physicals[0].emit("close",Object.assign(new Event("close"),{code:1006}));
    expect(delays).toEqual([500]);
    reconnectCallbacks.shift()?.();
    physicals[1].emit("close",Object.assign(new Event("close"),{code:1006}));
    expect(delays).toEqual([500,1_000]);
    reconnectCallbacks.shift()?.();

    physicals[2].emit(
      "message",
      new MessageEvent("message",{
        data:JSON.stringify(fullSnapshot(1,"round-reset")),
      }),
    );
    physicals[2].emit("close",Object.assign(new Event("close"),{code:1006}));
    expect(delays.at(-1)).toBe(500);
    connection.close();
  });

  it("closes a zombie connection when no authoritative snapshot arrives",()=>{
    const physicals:Array<ReturnType<typeof physicalSocket>>=[];
    const timers:Array<()=>void>=[];
    const app={
      innerHTML:"",
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    } as unknown as HTMLElement;

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"blackjack.example"},
      createSocket:()=>{
        const next=physicalSocket();
        physicals.push(next);
        return next.socket;
      },
      snapshotTimeoutMs:500,
      heartbeatIntervalMs:1_000,
      scheduleTransportTimer:(callback)=>{
        timers.push(callback);
        return callback;
      },
      cancelTransportTimer:()=>undefined,
      scheduleReconnect:()=> "reconnect",
      cancelReconnect:()=>undefined,
      scheduleRender:()=> "render-handle",
      cancelRender:()=>undefined,
    });

    expect(timers).toHaveLength(1);
    timers[0]();
    expect(physicals[0].closeCalls).toContainEqual([
      4002,
      "BLACKJACK_SNAPSHOT_TIMEOUT",
    ]);
    connection.close();
  });

  it("turns snapshot-unavailable into a reconnectable transport close",()=>{
    const physicals:Array<ReturnType<typeof physicalSocket>>=[];
    const reconnectCallbacks:Array<()=>void>=[];
    const app={
      innerHTML:"",
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    } as unknown as HTMLElement;

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"blackjack.example"},
      createSocket:()=>{
        const next=physicalSocket();
        physicals.push(next);
        return next.socket;
      },
      reconnectJitterRatio:0,
      scheduleReconnect:(callback)=>{
        reconnectCallbacks.push(callback);
        return callback;
      },
      cancelReconnect:()=>undefined,
      scheduleTransportTimer:()=> "transport-timer",
      cancelTransportTimer:()=>undefined,
      scheduleRender:()=> "render-handle",
      cancelRender:()=>undefined,
    });

    physicals[0].emit(
      "message",
      new MessageEvent("message",{
        data:JSON.stringify({
          type:"error",
          error:"BLACKJACK_SNAPSHOT_UNAVAILABLE",
        }),
      }),
    );
    expect(physicals[0].closeCalls).toContainEqual([
      4002,
      "BLACKJACK_SNAPSHOT_UNAVAILABLE",
    ]);

    physicals[0].emit(
      "close",
      Object.assign(new Event("close"),{code:1013}),
    );
    expect(reconnectCallbacks).toHaveLength(1);
    expect(connection.getStatus().state).toBe("CONNECTING");
    connection.close();
  });

  it("treats policy/auth close as terminal instead of reconnect-spamming",()=>{
    const physicals:Array<ReturnType<typeof physicalSocket>>=[];
    const reconnectCallbacks:Array<()=>void>=[];
    const app={
      innerHTML:"",
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    } as unknown as HTMLElement;

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"blackjack.example"},
      createSocket:()=>{
        const next=physicalSocket();
        physicals.push(next);
        return next.socket;
      },
      scheduleReconnect:(callback)=>{
        reconnectCallbacks.push(callback);
        return callback;
      },
      cancelReconnect:()=>undefined,
      scheduleTransportTimer:()=> "transport-timer",
      cancelTransportTimer:()=>undefined,
      scheduleRender:()=> "render-handle",
      cancelRender:()=>undefined,
    });

    physicals[0].emit(
      "close",
      Object.assign(new Event("close"),{code:1008}),
    );
    expect(reconnectCallbacks).toEqual([]);
    expect(connection.getStatus().state).toBe("ERROR");
    connection.close();
  });

  it("does not reconnect a session-replaced socket",()=>{
    const physicals:Array<ReturnType<typeof physicalSocket>>=[];
    const reconnectCallbacks:Array<()=>void>=[];
    const app={
      innerHTML:"",
      addEventListener:()=>undefined,
      removeEventListener:()=>undefined,
    } as unknown as HTMLElement;

    const connection=connectBlackjackRealtimeElement(app,{
      location:{protocol:"https:",host:"blackjack.example"},
      createSocket:()=>{
        const next=physicalSocket();
        physicals.push(next);
        return next.socket;
      },
      scheduleReconnect:(callback)=>{
        reconnectCallbacks.push(callback);
        return callback;
      },
      cancelReconnect:()=>undefined,
      reconnectJitterRatio:0,
      scheduleTransportTimer:()=> "transport-timer",
      cancelTransportTimer:()=>undefined,
      scheduleRender:()=> "render-handle",
      cancelRender:()=>undefined,
    });

    physicals[0].emit(
      "close",
      Object.assign(new Event("close"),{code:4001}),
    );
    expect(reconnectCallbacks).toEqual([]);
    expect(connection.getStatus().state).toBe("SESSION_REPLACED");
    connection.close();
    expect(connection.getStatus().state).toBe("CLOSED");
  });
});
