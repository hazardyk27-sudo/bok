import type {
  BlackjackRoundRealtimeDriver,
} from "./roundRealtime";
import type {
  BlackjackRoundRuntimeTickResult,
} from "./roundRuntime";

export const BLACKJACK_RUNTIME_TICK_INTERVAL_MS = 250 as const;

export type BlackjackRoundSchedulerOptions = Readonly<{
  intervalMs?: number;
  schedule?: ScheduleFn;
  cancelSchedule?: CancelScheduleFn;
  onError?: (error: unknown) => void;
}>;

export type BlackjackRoundScheduler = Readonly<{
  stop: () => void;
  isRunning: () => boolean;
  isTickInFlight: () => boolean;
  completedTickCount: () => number;
  skippedOverlapCount: () => number;
  lastResult: () => BlackjackRoundRuntimeTickResult | null;
  lastError: () => unknown | null;
  tickNow: () => Promise<BlackjackRoundRuntimeTickResult | null>;
}>;

type ScheduleFn = (
  callback: () => void,
  intervalMs: number,
) => unknown;

type CancelScheduleFn = (handle: unknown) => void;

function assertIntervalMs(intervalMs: number): void {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new RangeError(
      "Blackjack runtime scheduler intervalMs must be a positive safe integer",
    );
  }
}

const defaultSchedule: ScheduleFn = (callback, intervalMs) =>
  setInterval(callback, intervalMs);

const defaultCancel: CancelScheduleFn = (handle) =>
  clearInterval(handle as ReturnType<typeof setInterval>);

export function startBlackjackRoundScheduler(
  driver: BlackjackRoundRealtimeDriver,
  input: BlackjackRoundSchedulerOptions = {},
): BlackjackRoundScheduler {
  const intervalMs =
    input.intervalMs ?? BLACKJACK_RUNTIME_TICK_INTERVAL_MS;
  assertIntervalMs(intervalMs);

  const schedule=input.schedule ?? defaultSchedule;
  const cancelSchedule=input.cancelSchedule ?? defaultCancel;

  let running=true;
  let inFlight=false;
  let completedTicks=0;
  let skippedOverlaps=0;
  let latestResult: BlackjackRoundRuntimeTickResult | null=null;
  let latestError: unknown | null=null;

  const execute=async(): Promise<BlackjackRoundRuntimeTickResult | null>=>{
    if(!running) return null;
    if(inFlight){
      skippedOverlaps+=1;
      return null;
    }

    inFlight=true;
    try {
      const result=await driver.tick();
      latestResult=result;
      latestError=null;
      completedTicks+=1;
      return result;
    } catch(error) {
      latestError=error;
      input.onError?.(error);
      return null;
    } finally {
      inFlight=false;
    }
  };

  const handle=schedule(()=>{
    void execute();
  },intervalMs);

  return Object.freeze({
    stop:()=>{
      if(!running) return;
      running=false;
      cancelSchedule(handle);
    },
    isRunning:()=>running,
    isTickInFlight:()=>inFlight,
    completedTickCount:()=>completedTicks,
    skippedOverlapCount:()=>skippedOverlaps,
    lastResult:()=>latestResult,
    lastError:()=>latestError,
    tickNow:execute,
  });
}
