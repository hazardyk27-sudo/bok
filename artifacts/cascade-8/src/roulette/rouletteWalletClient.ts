import type {
  RouletteRoundSettlement,
} from "./betRules";
import {
  getRouletteBetTotals,
  moveRouletteBetPlacements,
  type RouletteBetPlacement,
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

export type RouletteBetMoveGuard = {
  roundId: string;
  fromBetId: string;
  toBetId: string;
  confirmedRevision: number | null;
  expiresAtMs: number;
};

const API_BASE = "/api/roulette";
export const ROULETTE_REQUEST_TIMEOUT_MS = 8_000;
const ROULETTE_DRAG_GUARD_TTL_MS = 3_000;

function clonePlacements(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({ ...bet }));
}

function totalStake(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.reduce(
    (sum, bet) => sum + bet.amount,
    0,
  );
}

// Kept as pure regression helpers only. The live client no longer owns a
// second mutable move-guard state; wager topology is owned by betAuthority.
export function deriveRouletteBetMoveGuard(
  roundId: string,
  before: readonly RouletteBetPlacement[],
  after: readonly RouletteBetPlacement[],
  nowMs = Date.now(),
): RouletteBetMoveGuard | null {
  if (!roundId || totalStake(before) !== totalStake(after)) {
    return null;
  }

  const beforeTotals = getRouletteBetTotals(before);
  const afterTotals = getRouletteBetTotals(after);
  const keys = new Set([
    ...Object.keys(beforeTotals),
    ...Object.keys(afterTotals),
  ]);
  const decreased: string[] = [];
  const increased: string[] = [];

  for (const key of keys) {
    const delta =
      (afterTotals[key] ?? 0) -
      (beforeTotals[key] ?? 0);
    if (delta < 0) decreased.push(key);
    if (delta > 0) increased.push(key);
  }

  if (decreased.length !== 1 || increased.length !== 1) {
    return null;
  }

  const fromBetId = decreased[0]!;
  const toBetId = increased[0]!;
  const movedAmount = beforeTotals[fromBetId] ?? 0;

  if (
    movedAmount <= 0 ||
    (afterTotals[fromBetId] ?? 0) !== 0 ||
    (afterTotals[toBetId] ?? 0) !==
      (beforeTotals[toBetId] ?? 0) + movedAmount
  ) {
    return null;
  }

  for (const key of keys) {
    if (
      key !== fromBetId &&
      key !== toBetId &&
      (beforeTotals[key] ?? 0) !==
        (afterTotals[key] ?? 0)
    ) {
      return null;
    }
  }

  return {
    roundId,
    fromBetId,
    toBetId,
    confirmedRevision: null,
    expiresAtMs: nowMs + ROULETTE_DRAG_GUARD_TTL_MS,
  };
}

export function applyRouletteBetMoveGuard(
  guard: RouletteBetMoveGuard | null,
  roundId: string,
  bets: readonly RouletteBetPlacement[],
  nowMs = Date.now(),
) {
  if (
    !guard ||
    guard.roundId !== roundId ||
    guard.expiresAtMs <= nowMs
  ) {
    return clonePlacements(bets);
  }

  return moveRouletteBetPlacements(
    bets,
    guard.fromBetId,
    guard.toBetId,
  );
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

export class RouletteWalletClient {
  async bootstrap(): Promise<RouletteBootstrapResponse> {
    const response = await fetch(
      `${API_BASE}/state`,
      {
        credentials: "same-origin",
        cache: "no-store",
      },
    );
    const body = await readResponse<{
      simulationVersion?: unknown;
      serverTimeMs?: unknown;
      globalTable?: RouletteGlobalTableSnapshot | null;
      recentResults?: unknown;
      globalBet?: RouletteGlobalBetSnapshot | null;
      wallet: RouletteWallet;
    }>(response);
    const headerVersion = response.headers?.get?.(
      "X-Roulette-Simulation-Version",
    );

    return {
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
