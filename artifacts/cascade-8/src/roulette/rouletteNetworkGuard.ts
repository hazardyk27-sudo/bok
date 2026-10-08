export const ROULETTE_STATE_HARD_TIMEOUT_MS = 2_500;
export const ROULETTE_MUTATION_HARD_TIMEOUT_MS = 3_000;

const STATE_PATH = "/api/roulette/state";
const GLOBAL_BETS_PATH = "/api/roulette/global-bets";
const GLOBAL_BETS_LATEST_PATH =
  "/api/roulette/global-bets/latest";

type RouletteGuardedWindow = Window & {
  __rouletteNetworkGuardInstalled?: boolean;
};

function readRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function readRequestMethod(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (init?.method) return init.method.toUpperCase();
  if (
    typeof Request !== "undefined" &&
    input instanceof Request
  ) {
    return input.method.toUpperCase();
  }
  return "GET";
}

export function getRouletteRequestTimeoutMs(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const base =
    typeof window !== "undefined"
      ? window.location.href
      : "http://localhost/";
  const url =
    new URL(readRequestUrl(input), base);
  const method =
    readRequestMethod(input, init);

  if (
    url.pathname === STATE_PATH &&
    method === "GET"
  ) {
    return ROULETTE_STATE_HARD_TIMEOUT_MS;
  }

  if (
    (
      url.pathname === GLOBAL_BETS_PATH ||
      url.pathname === GLOBAL_BETS_LATEST_PATH
    ) &&
    method === "PUT"
  ) {
    return ROULETTE_MUTATION_HARD_TIMEOUT_MS;
  }

  return null;
}

function combineAbortSignals(
  source: AbortSignal | null | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timeoutId = 0;

  const abortFromSource = () => {
    if (!controller.signal.aborted) {
      controller.abort(source?.reason);
    }
  };

  if (source?.aborted) {
    abortFromSource();
  } else {
    source?.addEventListener(
      "abort",
      abortFromSource,
      {
        once: true,
      },
    );
  }

  timeoutId = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(
        new DOMException(
          "Roulette request timed out",
          "AbortError",
        ),
      );
    }
  }, timeoutMs) as unknown as number;

  return {
    signal: controller.signal,
    cleanup() {
      globalThis.clearTimeout(timeoutId);
      source?.removeEventListener(
        "abort",
        abortFromSource,
      );
    },
  };
}

export function installRouletteNetworkGuard() {
  if (typeof window === "undefined") return;

  const guardedWindow =
    window as RouletteGuardedWindow;
  if (
    guardedWindow.__rouletteNetworkGuardInstalled
  ) {
    return;
  }
  guardedWindow.__rouletteNetworkGuardInstalled =
    true;

  const nativeFetch =
    window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const timeoutMs =
      getRouletteRequestTimeoutMs(
        input,
        init,
      );
    if (timeoutMs === null) {
      return nativeFetch(input, init);
    }

    const sourceSignal =
      init?.signal ??
      (
        typeof Request !== "undefined" &&
        input instanceof Request
          ? input.signal
          : undefined
      );
    const combined =
      combineAbortSignals(
        sourceSignal,
        timeoutMs,
      );

    try {
      return await nativeFetch(input, {
        ...init,
        signal: combined.signal,
      });
    } finally {
      combined.cleanup();
    }
  };
}
