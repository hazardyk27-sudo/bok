import { RoulettePhysicsReplay } from "./roulettePhysicsReplay";

const params = new URLSearchParams(window.location.search);
const roundId = params.get("roundId") ?? "";
const expectedNumber = Number(params.get("expectedNumber"));
const apiBase = (params.get("apiBase") ?? "").replace(/\/$/, "");

if (!roundId || !Number.isInteger(expectedNumber) || expectedNumber < 0 || expectedNumber > 36) {
  throw new Error("ROULETTE_PRODUCTION_REPLAY_PROBE_PARAMS_INVALID");
}

if (apiBase) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (raw.startsWith("/api/")) {
      return nativeFetch(apiBase + raw, {
        ...init,
        credentials: "omit",
      });
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}

const canvas = document.querySelector<HTMLCanvasElement>(
  "#roulette-production-replay",
);
if (!canvas) throw new Error("ROULETTE_PRODUCTION_REPLAY_PROBE_CANVAS_MISSING");

document.documentElement.dataset.probeState = "starting";

try {
  const replay = await RoulettePhysicsReplay.create(canvas);
  await replay.settle(roundId, expectedNumber);
  document.documentElement.dataset.probeState = "complete";
} catch (error) {
  document.documentElement.dataset.probeState = "error";
  document.documentElement.dataset.probeError =
    error instanceof Error ? error.message : String(error);
  throw error;
}
