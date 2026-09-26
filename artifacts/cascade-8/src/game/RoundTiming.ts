export type MotionTiming = {
  startedAt: number;
  visualSettledAt: number;
  completedAt: number;
  tailMs: number;
  movingUnits: number;
  specialUnits: number;
  maxFrameGapMs: number;
  frameSamples: number;
};

export type RoundTimingEvent = {
  name: string;
  atMs: number;
  detail?: Record<string, number | string | boolean | null>;
};

export type RoundTimingTrace = {
  id: string;
  mode: "base" | "bonus";
  turbo: boolean;
  auto: boolean;
  startedAt: number;
  events: RoundTimingEvent[];
};

type TimingWindow = Window & {
  __CASCADE8_TIMING__?: RoundTimingTrace[];
  cascade8TimingDump?: () => RoundTimingTrace[];
};

const MAX_TRACES = 50;

type LongTaskSample = { startTime: number; duration: number; name: string };
type SchedulerEvent = { at: number; type: string };

const longTasks: LongTaskSample[] = [];
const schedulerEvents: SchedulerEvent[] = [];
let longTaskObserver: PerformanceObserver | null = null;

function trimRuntimeDiagnostics(now = performance.now()) {
  const cutoff = now - 60_000;
  while (longTasks.length && longTasks[0].startTime + longTasks[0].duration < cutoff) longTasks.shift();
  while (schedulerEvents.length && schedulerEvents[0].at < cutoff) schedulerEvents.shift();
}

function ingestLongTaskEntries(entries: readonly PerformanceEntry[]) {
  entries.forEach((entry) => {
    longTasks.push({
      startTime: entry.startTime,
      duration: entry.duration,
      name: entry.name || "longtask",
    });
  });
  trimRuntimeDiagnostics();
}

if (typeof window !== "undefined") {
  if (typeof PerformanceObserver !== "undefined") {
    try {
      longTaskObserver = new PerformanceObserver((list) => ingestLongTaskEntries(list.getEntries()));
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  }

  const noteSchedulerEvent = (type: string) => {
    schedulerEvents.push({ at: performance.now(), type });
    trimRuntimeDiagnostics();
  };
  document.addEventListener("visibilitychange", () => noteSchedulerEvent(`visibility:${document.visibilityState}`));
  window.addEventListener("blur", () => noteSchedulerEvent("window:blur"));
  window.addEventListener("focus", () => noteSchedulerEvent("window:focus"));
  window.addEventListener("pagehide", () => noteSchedulerEvent("pagehide"));
  window.addEventListener("pageshow", () => noteSchedulerEvent("pageshow"));
}

export function createRoundTimingTrace(
  mode: RoundTimingTrace["mode"],
  turbo: boolean,
  auto: boolean,
): RoundTimingTrace {
  return {
    id: crypto.randomUUID(),
    mode,
    turbo,
    auto,
    startedAt: performance.now(),
    events: [],
  };
}

export function markRoundTiming(
  trace: RoundTimingTrace | null,
  name: string,
  detail?: RoundTimingEvent["detail"],
) {
  if (!trace) return;
  trace.events.push({
    name,
    atMs: Math.round((performance.now() - trace.startedAt) * 10) / 10,
    ...(detail ? { detail } : {}),
  });
}

export function motionTimingDetail(timing: MotionTiming) {
  return {
    visualSettleMs: Math.round((timing.visualSettledAt - timing.startedAt) * 10) / 10,
    promiseCompleteMs: Math.round((timing.completedAt - timing.startedAt) * 10) / 10,
    tailMs: Math.round(timing.tailMs * 10) / 10,
    movingUnits: timing.movingUnits,
    specialUnits: timing.specialUnits,
    maxFrameGapMs: Math.round(timing.maxFrameGapMs * 10) / 10,
    frameSamples: timing.frameSamples,
  };
}

export function publishRoundTiming(trace: RoundTimingTrace | null) {
  if (!trace) return;
  if (longTaskObserver) ingestLongTaskEntries(longTaskObserver.takeRecords());
  const target = window as TimingWindow;
  const history = target.__CASCADE8_TIMING__ ?? [];
  history.push(trace);
  if (history.length > MAX_TRACES) history.splice(0, history.length - MAX_TRACES);
  target.__CASCADE8_TIMING__ = history;
  target.cascade8TimingDump = () => [...(target.__CASCADE8_TIMING__ ?? [])];

  const gaps = trace.events.slice(1).map((event, index) => ({
    from: trace.events[index].name,
    to: event.name,
    ms: Math.round((event.atMs - trace.events[index].atMs) * 10) / 10,
  })).sort((a, b) => b.ms - a.ms).slice(0, 5);

  const serverEvent = trace.events.find((event) => event.name === "SERVER_RESULT");
  const serverResult = serverEvent?.detail ?? {};
  const boardEvent = trace.events.find((event) => event.name === "BASE_BOARD_RENDERED");
  const dropEvent = trace.events.find((event) => event.name === "BASE_DROP_DONE");
  const motionEvents = trace.events.filter((event) => typeof event.detail?.maxFrameGapMs === "number");
  const worstMotionFrameEvent = motionEvents.reduce<RoundTimingEvent | null>((worst, event) => {
    if (!worst) return event;
    return Number(event.detail?.maxFrameGapMs ?? 0) > Number(worst.detail?.maxFrameGapMs ?? 0) ? event : worst;
  }, null);
  const worstMotionFrameGapMs = Number(worstMotionFrameEvent?.detail?.maxFrameGapMs ?? 0);
  const biggest = gaps[0];
  const durationMs = trace.events.at(-1)?.atMs ?? 0;
  const requestEvent = trace.events.find((event) => event.name === "SPIN_REQUESTED");
  const serverWaitMs = requestEvent && serverEvent ? Math.round((serverEvent.atMs - requestEvent.atMs) * 10) / 10 : null;
  const renderWaitMs = serverEvent && boardEvent ? Math.round((boardEvent.atMs - serverEvent.atMs) * 10) / 10 : null;
  const dropWaitMs = boardEvent && dropEvent ? Math.round((dropEvent.atMs - boardEvent.atMs) * 10) / 10 : null;
  const dropDetail = dropEvent?.detail ?? {};
  const summary = [
    `ROUND ${Math.round(durationMs)}ms`,
    `mode=${trace.mode}`,
    `turbo=${trace.turbo}`,
    `win=${serverResult.baseWinCents ?? 0}`,
    `tumbles=${serverResult.tumbleCount ?? 0}`,
    `scatters=${serverResult.scatterCount ?? 0}`,
    `cores=${serverResult.settlementCoreCount ?? 0}`,
    `server=${serverWaitMs ?? "n/a"}ms`,
    `render=${renderWaitMs ?? "n/a"}ms`,
    `drop=${dropWaitMs ?? "n/a"}ms`,
    `dropTail=${dropDetail.tailMs ?? "n/a"}ms`,
    `maxFrameGap=${dropDetail.maxFrameGapMs ?? "n/a"}ms`,
    biggest ? `BIGGEST ${biggest.ms}ms ${biggest.from} -> ${biggest.to}` : "BIGGEST n/a",
  ].join(" | ");

  console.warn("[CASCADE8_GAP]", summary);

  const roundEndAt = performance.now();
  const roundLongTasks = longTasks
    .filter((task) => task.startTime <= roundEndAt && task.startTime + task.duration >= trace.startedAt)
    .sort((a, b) => b.duration - a.duration);
  const roundSchedulerEvents = schedulerEvents
    .filter((event) => event.at >= trace.startedAt && event.at <= roundEndAt);

  const movementGapLooksTooLong = Boolean(
    biggest
    && biggest.ms >= 1000
    && (biggest.to === "BASE_DROP_DONE" || biggest.to.endsWith("_CASCADE_DONE")),
  );

  if (worstMotionFrameGapMs >= 100 || movementGapLooksTooLong) {
    const longestLongTask = roundLongTasks[0] ?? null;
    const classification = worstMotionFrameGapMs >= 100
      ? longestLongTask && longestLongTask.duration >= 50
        ? "MAIN_THREAD_LONG_TASK"
        : roundSchedulerEvents.length || document.hidden
          ? "PAGE_SCHEDULING_OR_VISIBILITY"
          : "RAF_SCHEDULER_PAUSE"
      : "MOVEMENT_PHASE_SLOW_WITHOUT_FRAME_STALL";
    console.error(
      "[CASCADE8_STALL]",
      `class=${classification} | motionEvent=${worstMotionFrameEvent?.name ?? "none"} | maxFrameGap=${Math.round(worstMotionFrameGapMs * 10) / 10}ms | biggest=${biggest ? `${biggest.ms}ms ${biggest.from}->${biggest.to}` : "n/a"} | longTask=${longestLongTask ? Math.round(longestLongTask.duration * 10) / 10 : 0}ms | hidden=${document.hidden} | focus=${document.hasFocus()} | schedulerEvents=${roundSchedulerEvents.map((event) => event.type).join(",") || "none"}`,
      { longestLongTask, roundLongTasks, roundSchedulerEvents, worstMotionFrameEvent, trace },
    );
  }

  console.info("[CASCADE8_TIMING]", {
    id: trace.id,
    mode: trace.mode,
    turbo: trace.turbo,
    auto: trace.auto,
    durationMs,
    largestGaps: gaps,
    events: trace.events,
  });
}
