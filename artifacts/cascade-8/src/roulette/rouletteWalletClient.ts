import type { RouletteRoundSettlement } from "./betRules";
import {
  expandRouletteBetPlacementsToChipValues,
  type RouletteBetPlacement,
} from "./betState";
import type { RouletteWinningResult } from "./spinResult";

export type RouletteWallet = {
  sessionId: string;
  balanceCents: number;
};

export type RouletteGlobalTablePhase =
  | "scheduled"
  | "betting"
  | "spinning"
  | "result"
  | "complete";

export type RouletteGlobalTableSnapshot = {
  roundId: string;
  simulationVersion: string;
  phase: RouletteGlobalTablePhase;
  serverTimeMs: number;
  bettingOpenAtMs: number;
  bettingCloseAtMs: number;
  spinStartedAtMs: number;
  resultAtMs: number;
  nextRoundAtMs: number;
  seed: string | null;
  result: RouletteWinningResult | null;
};

export type RouletteGlobalBetSnapshot = {
  id: string;
  roundId: string;
  bets: RouletteBetPlacement[];
  stakeCents: number;
  payoutCents: number;
  settlement: RouletteRoundSettlement | null;
  settledAtMs: number | null;
  updatedAtMs: number;
};

export type RouletteBootstrapResponse = {
  simulationVersion: string;
  serverTimeMs: number;
  globalTable: RouletteGlobalTableSnapshot | null;
  globalBet: RouletteGlobalBetSnapshot | null;
  wallet: RouletteWallet;
};

export type RouletteGlobalBetUpdateResponse = {
  globalBet: RouletteGlobalBetSnapshot | null;
  balanceCents: number;
};

export type RouletteServerSpinResponse = {
  roundId: string;
  seed: string;
  simulationVersion: string;
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
    error instanceof Error &&
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
    globalThis.setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(
      timeoutId,
    );
  }
}

async function requestSpinWithTimeoutRetry(
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
        body: JSON.stringify({
          bets,
          idempotencyKey,
        }),
      },
      ROULETTE_SPIN_REQUEST_TIMEOUT_MS,
    );

  try {
    return await request();
  } catch (error) {
    if (!isAbortError(error)) {
      throw error;
    }

    // Retry once with the exact same idempotency key. If the first request
    // committed after the browser timed out, the server returns that same
    // round instead of charging the wallet twice.
    try {
      return await request();
    } catch (retryError) {
      if (isAbortError(retryError)) {
        throw new Error(
          "ROULETTE_SPIN_TIMEOUT",
        );
      }
      throw retryError;
    }
  }
}

export class RouletteWalletClient {
  async bootstrap(): Promise<RouletteBootstrapResponse> {
    const response = await fetch(`${API_BASE}/state`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    const body =
      await readResponse<{
        simulationVersion?: unknown;
        serverTimeMs?: unknown;
        globalTable?: RouletteGlobalTableSnapshot | null;
        globalBet?: RouletteGlobalBetSnapshot | null;
        wallet: RouletteWallet;
      }>(response);
    const headerVersion =
      response.headers?.get?.(
        "X-Roulette-Simulation-Version",
      );

    return {
      simulationVersion:
        typeof body.simulationVersion ===
        "string"
          ? body.simulationVersion
          : headerVersion ?? "",
      serverTimeMs:
        typeof body.serverTimeMs === "number"
          ? body.serverTimeMs
          : Number.NaN,
      globalTable:
        body.globalTable ?? null,
      globalBet:
        body.globalBet ?? null,
      wallet: body.wallet,
    };
  }

  async updateGlobalBet(
    roundId: string,
    bets: readonly RouletteBetPlacement[],
    idempotencyKey: string,
  ): Promise<RouletteGlobalBetUpdateResponse> {
    const response =
      await fetchWithTimeout(
        `${API_BASE}/global-bets`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            roundId,
            bets,
            idempotencyKey,
          }),
        },
        ROULETTE_SPIN_REQUEST_TIMEOUT_MS,
      ).catch((error) => {
        if (isAbortError(error)) {
          throw new Error(
            "ROULETTE_GLOBAL_BET_TIMEOUT",
          );
        }
        throw error;
      });

    return readResponse<RouletteGlobalBetUpdateResponse>(
      response,
    );
  }

  async spin(
    bets: readonly RouletteBetPlacement[],
    idempotencyKey: string,
  ) {
    const aggregateResponse =
      await requestSpinWithTimeoutRetry(
        bets,
        idempotencyKey,
      );

    try {
      return await readResponse<RouletteServerSpinResponse>(
        aggregateResponse,
      );
    } catch (error) {
      const legacyAggregateRejected =
        error instanceof Error &&
        (
          error.message ===
            "INVALID_ROULETTE_CHIP" ||
          error.message ===
            "INVALID_ROULETTE_BET_AMOUNT"
        );

      if (!legacyAggregateRejected) {
        throw error;
      }

      const denominationSafeBets =
        expandRouletteBetPlacementsToChipValues(
          bets,
        );

      const legacyResponse =
        await requestSpinWithTimeoutRetry(
          denominationSafeBets,
          idempotencyKey,
        );

      return readResponse<RouletteServerSpinResponse>(
        legacyResponse,
      );
    }
  }
}
