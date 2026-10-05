type GuardWindow = Window & {
  __cadiPurchaseStateGuardInstalled?: boolean;
};

type PurchaseFingerprint = {
  mode: string | null;
  stakeCents: number | null;
};

type PurchaseStateSnapshot = {
  round?: {
    mode?: unknown;
    stakeCents?: unknown;
    status?: unknown;
  } | null;
};

const CADI_PREFIX = "/api/cadi-kazan/";
const CREATE_ROUND_PATH = "/api/cadi-kazan/rounds";
const STATE_PATH = "/api/cadi-kazan/state";
const OFFICE_POOL_PATH = "/api/cadi-kazan/office-pool";
const RETRYABLE_PURCHASE_STATUSES = new Set([502, 503, 504]);
const STATE_ATTEMPT_TIMEOUT_MS = 1_800;
const PURCHASE_ATTEMPT_TIMEOUT_MS = 2_500;
const PURCHASE_RECONCILE_TIMEOUT_MS = 1_500;
const OFFICE_POOL_WARMUP_TIMEOUT_MS = 2_500;
const PURCHASE_MAX_ATTEMPTS = 2;

let mutationGeneration = 0;
let purchaseInFlight: Promise<Response> | null = null;
let stateBootstrapInFlight: Promise<Response> | null = null;
let stateBootstrapReady = false;
let officePoolWarmupInFlight: Promise<void> | null = null;

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

function fetchWithTimeout(
  nativeFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
) {
  return nativeFetch(input, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function isRetryableTransportError(error: unknown) {
  if (error instanceof TypeError) return true;
  return error instanceof DOMException
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

function warmOfficePool(nativeFetch: typeof window.fetch) {
  if (officePoolWarmupInFlight) return;

  const warmup = fetchWithTimeout(
    nativeFetch,
    OFFICE_POOL_PATH,
    { credentials: "same-origin", cache: "no-store" },
    OFFICE_POOL_WARMUP_TIMEOUT_MS,
  )
    .then((response) => {
      if (!response.ok) throw new Error("CADI_OFFICE_POOL_WARMUP_FAILED");
    })
    .catch(() => {
      // Warmup is only a latency optimization. The purchase repository remains
      // authoritative and can create/activate a pool on demand if this fails.
    })
    .finally(() => {
      if (officePoolWarmupInFlight === warmup) officePoolWarmupInFlight = null;
    });

  officePoolWarmupInFlight = warmup;
}

function markStateReady(nativeFetch: typeof window.fetch) {
  stateBootstrapReady = true;
  warmOfficePool(nativeFetch);
}

function readPurchaseFingerprint(init?: RequestInit): PurchaseFingerprint {
  if (typeof init?.body !== "string") return { mode: null, stakeCents: null };
  try {
    const payload = JSON.parse(init.body) as { mode?: unknown; stakeCents?: unknown };
    return {
      mode: typeof payload.mode === "string" ? payload.mode : null,
      stakeCents: Number.isSafeInteger(payload.stakeCents) ? Number(payload.stakeCents) : null,
    };
  } catch {
    return { mode: null, stakeCents: null };
  }
}

function stateMatchesPurchase(snapshot: PurchaseStateSnapshot, fingerprint: PurchaseFingerprint) {
  const round = snapshot.round;
  if (!round || round.status !== "ACTIVE") return false;
  if (fingerprint.mode !== null && round.mode !== fingerprint.mode) return false;
  if (fingerprint.stakeCents !== null && round.stakeCents !== fingerprint.stakeCents) return false;
  return true;
}

async function reconcilePurchaseState(
  nativeFetch: typeof window.fetch,
  fingerprint: PurchaseFingerprint,
) {
  try {
    const response = await fetchWithTimeout(
      nativeFetch,
      STATE_PATH,
      { credentials: "same-origin", cache: "no-store" },
      PURCHASE_RECONCILE_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    const snapshot = await response.clone().json().catch(() => null) as PurchaseStateSnapshot | null;
    if (!snapshot || !stateMatchesPurchase(snapshot, fingerprint)) return null;
    markStateReady(nativeFetch);
    return response;
  } catch {
    return null;
  }
}

async function fetchPurchaseWithSafeRetry(
  nativeFetch: typeof window.fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const fingerprint = readPurchaseFingerprint(init);
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= PURCHASE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        nativeFetch,
        input,
        init,
        PURCHASE_ATTEMPT_TIMEOUT_MS,
      );
      lastResponse = response;
      if (
        !RETRYABLE_PURCHASE_STATUSES.has(response.status)
        || !canReplayRequest(input)
        || attempt >= PURCHASE_MAX_ATTEMPTS
      ) {
        if (!RETRYABLE_PURCHASE_STATUSES.has(response.status)) return response;
        break;
      }
    } catch (error) {
      lastError = error;
      if (
        !canReplayRequest(input)
        || !isRetryableTransportError(error)
        || attempt >= PURCHASE_MAX_ATTEMPTS
      ) {
        break;
      }
    }
  }

  // Every replay uses the exact same body and therefore the exact same start
  // idempotency key. If the server committed but both responses were lost or
  // timed out, recover the authoritative active round instead of leaving the
  // player uncertain and inviting a second purchase with a new key.
  const reconciled = await reconcilePurchaseState(nativeFetch, fingerprint);
  if (reconciled) return reconciled;
  if (lastResponse) return lastResponse;
  if (lastError && !isRetryableTransportError(lastError)) throw lastError;
  throw new Error("Bilet işlemi zaman aşımına uğradı. Tekrar deneyin.");
}

async function waitForResponse(request: Promise<Response> | null) {
  if (!request) return null;
  try {
    return await request;
  } catch {
    return null;
  }
}

async function ensureStateBootstrap(nativeFetch: typeof window.fetch) {
  if (stateBootstrapReady) return;

  const inFlight = await waitForResponse(stateBootstrapInFlight);
  if (inFlight?.ok) {
    markStateReady(nativeFetch);
    return;
  }

  const response = await fetchWithTimeout(
    nativeFetch,
    STATE_PATH,
    { credentials: "same-origin", cache: "no-store" },
    STATE_ATTEMPT_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error("Cadı Kazan bağlantısı hazır değil. Tekrar deneyin.");
  }
  markStateReady(nativeFetch);
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
      const activePurchase = purchaseInFlight;
      if (activePurchase) {
        await waitForResponse(activePurchase);
        const refreshed = await fetchWithTimeout(nativeFetch, input, init, STATE_ATTEMPT_TIMEOUT_MS);
        if (refreshed.ok) markStateReady(nativeFetch);
        return refreshed;
      }

      const startedAtGeneration = mutationGeneration;
      const request = fetchWithTimeout(nativeFetch, input, init, STATE_ATTEMPT_TIMEOUT_MS);
      stateBootstrapInFlight = request;
      try {
        const response = await request;
        if (response.ok) markStateReady(nativeFetch);
        // The page can begin loading /state and a mutation can start before the
        // old snapshot is applied. Refresh only after the purchase settles so a
        // stale balance cannot overwrite the authoritative post-mutation state.
        if (startedAtGeneration !== mutationGeneration) {
          await waitForResponse(purchaseInFlight);
          const refreshed = await fetchWithTimeout(nativeFetch, input, init, STATE_ATTEMPT_TIMEOUT_MS);
          if (refreshed.ok) markStateReady(nativeFetch);
          return refreshed;
        }
        return response;
      } finally {
        if (stateBootstrapInFlight === request) stateBootstrapInFlight = null;
      }
    }

    if (method === "POST" && path === CREATE_ROUND_PATH) {
      // On a brand-new browser, establish the canonical game_session first.
      // The state request is bounded, so purchase can fail fast instead of
      // sitting forever behind a dead bootstrap request.
      await ensureStateBootstrap(nativeFetch);

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
        if (response.ok) markStateReady(nativeFetch);
        return response.clone();
      } finally {
        if (purchaseInFlight === request) purchaseInFlight = null;
      }
    }

    if (method !== "GET" && path.startsWith(CADI_PREFIX)) mutationGeneration += 1;
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}
