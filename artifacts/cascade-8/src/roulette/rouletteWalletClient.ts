import type { RouletteRoundSettlement } from "./betRules";
import type { RouletteBetPlacement } from "./betState";
import type { RouletteWinningResult } from "./spinResult";

export type RouletteWallet = {
  sessionId: string;
  balanceCents: number;
};

export type RouletteServerSpinResponse = {
  roundId: string;
  seed: string;
  result: RouletteWinningResult;
  settlement: RouletteRoundSettlement;
  wallet: RouletteWallet;
};

const API_BASE = "/api/roulette";
export const ROULETTE_SPIN_REQUEST_TIMEOUT_MS = 8_000;

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : "ROULETTE_CONNECTION_FAILED",
    );
  }

  return body as T;
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException &&
    error.name === "AbortError"
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller =
    new AbortController();
  const timeoutId =
    window.setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(
      timeoutId,
    );
  }
}

export class RouletteWalletClient {
  async bootstrap() {
    const response = await fetch(`${API_BASE}/state`, {
      credentials: "same-origin",
    });

    return (
      await readResponse<{ wallet: RouletteWallet }>(response)
    ).wallet;
  }

  async spin(
    bets: readonly RouletteBetPlacement[],
    idempotencyKey: string,
  ) {
    const request = () =>
      fetchWithTimeout(
        `${API_BASE}/spins`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bets, idempotencyKey }),
        },
        ROULETTE_SPIN_REQUEST_TIMEOUT_MS,
      );

    let response: Response;

    try {
      response = await request();
    } catch (error) {
      if (!isAbortError(error)) {
        throw error;
      }

      // Retry once with the exact same idempotency key. If the first request
      // committed after the browser timed out, the server returns that same
      // round instead of charging the wallet twice.
      try {
        response = await request();
      } catch (retryError) {
        if (isAbortError(retryError)) {
          throw new Error(
            "ROULETTE_SPIN_TIMEOUT",
          );
        }
        throw retryError;
      }
    }

    return readResponse<RouletteServerSpinResponse>(response);
  }
}
