type GuardWindow = Window & {
  __cadiPurchaseStateGuardInstalled?: boolean;
};

const CADI_PREFIX = "/api/cadi-kazan/";
const CREATE_ROUND_PATH = "/api/cadi-kazan/rounds";
const STATE_PATH = "/api/cadi-kazan/state";
const RETRYABLE_PURCHASE_STATUSES = new Set([502, 503, 504]);

let mutationGeneration = 0;
let purchaseInFlight: Promise<Response> | null = null;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function pathname(input: RequestInfo | URL) {
  try {
    return new URL(requestUrl(input), window.location.origin).pathname;
  } catch {
    return requestUrl(input);
  }
}

function canReplayRequest(input: RequestInfo | URL) {
  return typeof input === "string" || input instanceof URL;
}

async function fetchPurchaseWithSafeRetry(
  nativeFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  try {
    const first = await nativeFetch(input, init);
    if (!RETRYABLE_PURCHASE_STATUSES.has(first.status) || !canReplayRequest(input)) return first;
    return nativeFetch(input, init);
  } catch (error) {
    if (!canReplayRequest(input)) throw error;
    // The body contains the same start idempotency key on the retry. If the
    // first request committed but its response was lost, the server returns the
    // existing round instead of charging a second time.
    return nativeFetch(input, init);
  }
}

async function waitForPurchaseToSettle(purchase: Promise<Response> | null) {
  if (!purchase) return;
  try {
    await purchase;
  } catch {
    // A state refresh after a failed transport is still the authoritative way
    // to learn whether the server committed the purchase.
  }
}

export function installCadiPurchaseStateGuard() {
  if (typeof window === "undefined") return;
  const guardedWindow = window as GuardWindow;
  if (guardedWindow.__cadiPurchaseStateGuardInstalled) return;
  guardedWindow.__cadiPurchaseStateGuardInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = requestMethod(input, init);
    const path = pathname(input);

    if (method === "GET" && path === STATE_PATH) {
      const startedAtGeneration = mutationGeneration;
      const activePurchase = purchaseInFlight;
      if (activePurchase) {
        await waitForPurchaseToSettle(activePurchase);
        return nativeFetch(input, init);
      }

      const response = await nativeFetch(input, init);
      // The page can begin loading /state and the user can purchase a card
      // before that old response is applied. Never let an older wallet snapshot
      // overwrite a newer purchase/reveal/cash-out mutation. If a purchase is
      // still in flight, wait for its authoritative result before refreshing.
      if (startedAtGeneration !== mutationGeneration) {
        await waitForPurchaseToSettle(purchaseInFlight);
        return nativeFetch(input, init);
      }
      return response;
    }

    if (method === "POST" && path === CREATE_ROUND_PATH) {
      const alreadyRunning = purchaseInFlight;
      if (alreadyRunning) {
        const response = await alreadyRunning;
        return response.clone();
      }

      mutationGeneration += 1;
      const request = fetchPurchaseWithSafeRetry(nativeFetch, input, init);
      purchaseInFlight = request;
      try {
        const response = await request;
        return response.clone();
      } finally {
        purchaseInFlight = null;
      }
    }

    if (method !== "GET" && path.startsWith(CADI_PREFIX)) mutationGeneration += 1;
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}
