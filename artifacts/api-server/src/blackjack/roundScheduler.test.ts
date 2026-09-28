import { describe, expect, it } from "vitest";
import type {
  BlackjackRoundRealtimeDriver,
} from "./roundRealtime";
import type {
  BlackjackRoundRuntimeTickResult,
} from "./roundRuntime";
import {
  BLACKJACK_RUNTIME_TICK_INTERVAL_MS,
  startBlackjackRoundScheduler,
} from "./roundScheduler";

function result(
  status: BlackjackRoundRuntimeTickResult["status"]="NOOP",
): BlackjackRoundRuntimeTickResult {
  return {
    status,
    table:{} as BlackjackRoundRuntimeTickResult["table"],
    transitions:[],
  };
}

describe("blackjack periodic round scheduler",()=>{
  it("registers the authoritative driver on a 250ms periodic cadence",async()=>{
    let scheduled: (()=>void) | null=null;
    let scheduledMs=0;
    let cancelled=false;
    let calls=0;

    const driver={
      source:{} as BlackjackRoundRealtimeDriver["source"],
      tick:async()=>{
        calls+=1;
        return result("WAITING_FOR_BETTING_DEADLINE");
      },
    } satisfies BlackjackRoundRealtimeDriver;

    const scheduler=startBlackjackRoundScheduler(driver,{
      schedule:(callback,intervalMs)=>{
        scheduled=callback;
        scheduledMs=intervalMs;
        return "test-handle";
      },
      cancelSchedule:(handle)=>{
        expect(handle).toBe("test-handle");
        cancelled=true;
      },
    });

    expect(scheduledMs).toBe(BLACKJACK_RUNTIME_TICK_INTERVAL_MS);
    expect(scheduler.isRunning()).toBe(true);
    expect(calls).toBe(0);

    await scheduler.tickNow();
    expect(calls).toBe(1);
    expect(scheduler.completedTickCount()).toBe(1);
    expect(scheduler.lastResult()?.status)
      .toBe("WAITING_FOR_BETTING_DEADLINE");

    scheduler.stop();
    expect(cancelled).toBe(true);
    expect(scheduler.isRunning()).toBe(false);
    expect(await scheduler.tickNow()).toBeNull();

    expect(scheduled).not.toBeNull();
  });

  it("never overlaps async ticks and counts skipped timer firings",async()=>{
    let scheduled: (()=>void) | null=null;
    let release: (()=>void) | null=null;
    let calls=0;

    const driver={
      source:{} as BlackjackRoundRealtimeDriver["source"],
      tick:()=>new Promise<BlackjackRoundRuntimeTickResult>((resolve)=>{
        calls+=1;
        release=()=>resolve(result("NOOP"));
      }),
    } satisfies BlackjackRoundRealtimeDriver;

    const scheduler=startBlackjackRoundScheduler(driver,{
      schedule:(callback)=>{
        scheduled=callback;
        return "overlap-handle";
      },
      cancelSchedule:()=>undefined,
    });

    const first=scheduler.tickNow();
    expect(scheduler.isTickInFlight()).toBe(true);
    expect(calls).toBe(1);

    scheduled?.();
    scheduled?.();
    expect(calls).toBe(1);
    expect(scheduler.skippedOverlapCount()).toBe(2);

    release?.();
    await first;

    expect(scheduler.isTickInFlight()).toBe(false);
    expect(scheduler.completedTickCount()).toBe(1);

    const second=scheduler.tickNow();
    expect(calls).toBe(2);
    release?.();
    await second;
    expect(scheduler.completedTickCount()).toBe(2);

    scheduler.stop();
  });

  it("contains tick failures, reports them, and continues on the next cadence",async()=>{
    let scheduled: (()=>void) | null=null;
    const errors: unknown[]=[];
    let calls=0;

    const driver={
      source:{} as BlackjackRoundRealtimeDriver["source"],
      tick:async()=>{
        calls+=1;
        if(calls===1) throw new Error("runtime tick failed");
        return result("NOOP");
      },
    } satisfies BlackjackRoundRealtimeDriver;

    const scheduler=startBlackjackRoundScheduler(driver,{
      schedule:(callback)=>{
        scheduled=callback;
        return "error-handle";
      },
      cancelSchedule:()=>undefined,
      onError:(error)=>errors.push(error),
    });

    await scheduler.tickNow();
    expect(errors).toHaveLength(1);
    expect(scheduler.lastError()).toBeInstanceOf(Error);
    expect(scheduler.completedTickCount()).toBe(0);
    expect(scheduler.isRunning()).toBe(true);

    const next=scheduler.tickNow();
    await next;
    expect(calls).toBe(2);
    expect(scheduler.completedTickCount()).toBe(1);
    expect(scheduler.lastError()).toBeNull();

    expect(scheduled).not.toBeNull();
    scheduler.stop();
  });
});
