import type {
  RouletteRoundSettlement,
} from "./betRules";
import type {
  RouletteBetPlacement,
} from "./betState";
import type {
  RouletteWinningResult,
} from "./spinResult";

export type RouletteWallet = {
  sessionId: string;
  balanceCents: number;
};

export type RouletteGlobalTablePhase =
  | "scheduled"
  | "betting"
  | "verifying"
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
  revision: number;
  settlement:
    | RouletteRoundSettlement
    | null;
  settledAtMs: number | null;
  updatedAtMs: number;
};

export type RouletteBootstrapResponse = {
  simulationVersion: string;
  serverTimeMs: number;
  globalTable:
    | RouletteGlobalTableSnapshot
    | null;
  recentResults: number[];
  globalBet:
    | RouletteGlobalBetSnapshot
    | null;
  wallet: RouletteWallet;
};

export type RouletteServerSpinResponse = {
  roundId: string;
  seed: string;
  simulationVersion: string;
  result: RouletteWinningResult;
  settlement: RouletteRoundSettlement;
  wallet: RouletteWallet;
};

export type RouletteGlobalBetUpdateResponse = {
  globalBet:
    | RouletteGlobalBetSnapshot
    | null;
  balanceCents: number;
};

const API_BASE = "/api/roulette";
export const ROULETTE_REQUEST_TIMEOUT_MS = 8_000;

function clonePlacements(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({ ...bet }));
}

function cloneGlobalBet(
  globalBet: RouletteGlobalBetSnapshot | null,
) {
  if (!globalBet) return null;

  return {
    ...globalBet,
    bets: clonePlacements(
      globalBet.bets,
    ),
  };
}

function cloneBootstrap(
  bootstrap: RouletteBootstrapResponse,
): RouletteBootstrapResponse {
  return {
    ...bootstrap,
    globalTable:
      bootstrap.globalTable
        ? {
            ...bootstrap.globalTable,
            result:
              bootstrap.globalTable.result
                ? {
                    ...bootstrap.globalTable.result,
                  }
                : null,
          }
        : null,
    recentResults: [
      ...bootstrap.recentResults,
    ],
    globalBet:
      cloneGlobalBet(
        bootstrap.globalBet,
      ),
    wallet: {
      ...bootstrap.wallet,
    },
  };
}

async function readResponse<T>(
  response: Response,
): Promise<T> {
  const body = await response
    .json()
    .catch(() => ({})) as { error?: unknown };

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
  return error instanceof Error && error.name === "AbortError";
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

type RouletteBettingContinuity = {
  bootstrap: RouletteBootstrapResponse;
  receivedAtClientMs: number;
};

export class RouletteWalletClient {
  private bettingContinuity:
    RouletteBettingContinuity | null = null;

  private rememberBettingBootstrap(
    bootstrap: RouletteBootstrapResponse,
  ) {
    if (
      !bootstrap.globalTable ||
      bootstrap.globalTable.phase !== "betting"
    ) {
      return;
    }

    this.bettingContinuity = {
      bootstrap:
        cloneBootstrap(
          bootstrap,
        ),
      receivedAtClientMs:
        Date.now(),
    };
  }

  private activeBettingFallback(
    authoritativeServerNowMs?: number,
  ): RouletteBootstrapResponse | null {
    const continuity =
      this.bettingContinuity;
    const table =
      continuity?.bootstrap.globalTable;

    if (!continuity || !table) {
      return null;
    }

    const estimatedServerNowMs =
      Number.isFinite(
        authoritativeServerNowMs,
      )
        ? Number(
            authoritativeServerNowMs,
          )
        : continuity.bootstrap.serverTimeMs +
          Math.max(
            0,
            Date.now() -
              continuity.receivedAtClientMs,
          );

    if (
      !Number.isFinite(
        estimatedServerNowMs,
      ) ||
      estimatedServerNowMs <
        table.bettingOpenAtMs ||
      estimatedServerNowMs >=
        table.bettingCloseAtMs
    ) {
      this.bettingContinuity = null;
      return null;
    }

    const fallback =
      cloneBootstrap(
        continuity.bootstrap,
      );

    fallback.serverTimeMs =
      estimatedServerNowMs;
    fallback.globalTable = {
      ...table,
      phase: "betting",
      serverTimeMs:
        estimatedServerNowMs,
    };

    return fallback;
  }

  async bootstrap(): Promise<RouletteBootstrapResponse> {
    let response: Response;

    try {
      response = await fetch(
        `${API_BASE}/state`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
    } catch (error) {
      const fallback =
        this.activeBettingFallback();
      if (fallback) {
        return fallback;
      }
      throw error;
    }

    let body: {
      simulationVersion?: unknown;
      serverTimeMs?: unknown;
      globalTable?: RouletteGlobalTableSnapshot | null;
      recentResults?: unknown;
      globalBet?: RouletteGlobalBetSnapshot | null;
      wallet: RouletteWallet;
    };

    try {
      body = await readResponse(response);
    } catch (error) {
      const fallback =
        this.activeBettingFallback();
      if (fallback) {
        return fallback;
      }
      throw error;
    }

    const headerVersion = response.headers?.get?.(
      "X-Roulette-Simulation-Version",
    );

    const bootstrap: RouletteBootstrapResponse = {
      simulationVersion:
        typeof body.simulationVersion === "string"
          ? body.simulationVersion
          : headerVersion ?? "",
      serverTimeMs:
        typeof body.serverTimeMs === "number"
          ? body.serverTimeMs
          : Number.NaN,
      globalTable: body.globalTable ?? null,
      recentResults:
        Array.isArray(body.recentResults)
          ? body.recentResults.filter(
              (value): value is number =>
                typeof value === "number" &&
                Number.isInteger(value) &&
                value >= 0 &&
                value <= 36,
            )
          : [],
      globalBet: body.globalBet ?? null,
      wallet: body.wallet,
    };

    if (bootstrap.globalTable) {
      this.rememberBettingBootstrap(
        bootstrap,
      );
      return bootstrap;
    }

    const fallback =
      this.activeBettingFallback(
        bootstrap.serverTimeMs,
      );

    if (
      fallback &&
      fallback.simulationVersion ===
        bootstrap.simulationVersion
    ) {
      return {
        ...bootstrap,
        serverTimeMs:
          fallback.serverTimeMs,
        globalTable:
          fallback.globalTable,
      };
    }

    return bootstrap;
  }

  async updateGlobalBet(
    roundId: string,
    bets: readonly RouletteBetPlacement[],
    idempotencyKey: string,
    expectedRevision: number,
  ): Promise<RouletteGlobalBetUpdateResponse> {
    const response = await fetchWithTimeout(
      `${API_BASE}/global-bets`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roundId,
          bets: clonePlacements(bets),
          idempotencyKey,
          expectedRevision,
        }),
      },
      ROULETTE_REQUEST_TIMEOUT_MS,
    ).catch((error) => {
      if (isAbortError(error)) {
        throw new Error("ROULETTE_GLOBAL_BET_TIMEOUT");
      }
      throw error;
    });

    return readResponse<RouletteGlobalBetUpdateResponse>(response);
  }
}
