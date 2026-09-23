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
