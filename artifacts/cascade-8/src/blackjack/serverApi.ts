import type {
  BlackjackServerActionRequest,
  BlackjackServerErrorPayload,
  BlackjackServerSnapshot,
} from "./serverContract";

export class BlackjackServerApiError extends Error {
  readonly status: number;
  readonly snapshot: BlackjackServerSnapshot | null;

  constructor(
    message: string,
    status: number,
    snapshot: BlackjackServerSnapshot | null = null,
  ) {
    super(message);
    this.name = "BlackjackServerApiError";
    this.status = status;
    this.snapshot = snapshot;
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let payload: (T & BlackjackServerErrorPayload) | null = null;

  try {
    payload = await response.json() as T & BlackjackServerErrorPayload;
  } catch {
    throw new BlackjackServerApiError(
      response.ok ? "BLACKJACK_INVALID_SERVER_RESPONSE" : `BLACKJACK_HTTP_${response.status}`,
      response.ok ? 502 : response.status,
    );
  }

  if (!response.ok) {
    throw new BlackjackServerApiError(
      payload.error || `BLACKJACK_HTTP_${response.status}`,
      response.status,
      payload.snapshot ?? null,
    );
  }
  return payload;
}

export function createBlackjackIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `blackjack-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function fetchBlackjackServerState(): Promise<BlackjackServerSnapshot> {
  const response = await fetch("/api/blackjack/state", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  return readJson<BlackjackServerSnapshot>(response);
}

export async function sendBlackjackServerAction(
  request: BlackjackServerActionRequest,
): Promise<BlackjackServerSnapshot> {
  const response = await fetch("/api/blackjack/action", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return readJson<BlackjackServerSnapshot>(response);
}

function isTransientTransportError(error: unknown): boolean {
  if (error instanceof BlackjackServerApiError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  return error instanceof TypeError;
}

export async function sendBlackjackServerActionReliable(
  request: BlackjackServerActionRequest,
  retryCount = 1,
): Promise<BlackjackServerSnapshot> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    try {
      return await sendBlackjackServerAction(request);
    } catch (error) {
      lastError = error;
      if (!isTransientTransportError(error) || attempt >= retryCount) {
        throw error;
      }
      // Retry the exact same request and idempotency key. The authoritative
      // backend receipt makes an ambiguous network retry financially safe.
    }
  }

  throw lastError;
}
