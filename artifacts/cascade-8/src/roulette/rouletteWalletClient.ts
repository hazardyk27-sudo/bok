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

/*
 * Kept as an exported historical shape for isolated replay regression tests.
 * The live client no longer requests player-specific spins.
 */
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

const API_BASE =
  "/api/roulette";
export const ROULETTE_REQUEST_TIMEOUT_MS =
  8_000;
const ROULETTE_DRAG_GUARD_TTL_MS =
  3_000;

let lastObservedGlobalBet:
  RouletteGlobalBetSnapshot | null =
    null;
let activeBetMoveGuard:
  RouletteBetMoveGuard | null =
    null;
let clearMoveGuardTimer = 0;

function clonePlacements(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({
    ...bet,
  }));
}

function totalStake(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.reduce(
    (sum, bet) => sum + bet.amount,
    0,
  );
}

export function deriveRouletteBetMoveGuard(
  roundId: string,
  before: readonly RouletteBetPlacement[],
  after: readonly RouletteBetPlacement[],
  nowMs = Date.now(),
): RouletteBetMoveGuard | null {
  if (
    !roundId ||
    totalStake(before) !==
      totalStake(after)
  ) {
    return null;
  }

  const beforeTotals =
    getRouletteBetTotals(before);
  const afterTotals =
    getRouletteBetTotals(after);
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

  if (
    decreased.length !== 1 ||
    increased.length !== 1
  ) {
    return null;
  }

  const fromBetId = decreased[0]!;
  const toBetId = increased[0]!;
  const movedAmount =
    beforeTotals[fromBetId] ?? 0;

  if (
    movedAmount <= 0 ||
    (afterTotals[fromBetId] ?? 0) !== 0 ||
    (afterTotals[toBetId] ?? 0) !==
      (beforeTotals[toBetId] ?? 0) +
        movedAmount
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
    expiresAtMs:
      nowMs +
      ROULETTE_DRAG_GUARD_TTL_MS,
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

function cleanupExpiredMoveGuard() {
  if (
    activeBetMoveGuard &&
    activeBetMoveGuard.expiresAtMs <=
      Date.now()
  ) {
    activeBetMoveGuard = null;
  }
}

function rememberObservedGlobalBet(
  globalBet:
    | RouletteGlobalBetSnapshot
    | null,
) {
  if (!globalBet) return;

  lastObservedGlobalBet = {
    ...globalBet,
    bets:
      clonePlacements(
        globalBet.bets,
      ),
  };

  cleanupExpiredMoveGuard();
  const guard = activeBetMoveGuard;
  if (
    !guard ||
    guard.roundId !==
      globalBet.roundId ||
    guard.confirmedRevision === null ||
    globalBet.revision <
      guard.confirmedRevision
  ) {
    return;
  }

  const guarded =
    applyRouletteBetMoveGuard(
      guard,
      globalBet.roundId,
      globalBet.bets,
    );
  const observedTotals =
    getRouletteBetTotals(
      globalBet.bets,
    );
  const guardedTotals =
    getRouletteBetTotals(guarded);
  const keys = new Set([
    ...Object.keys(observedTotals),
    ...Object.keys(guardedTotals),
  ]);
  const alreadyMoved = [...keys]
    .every(
      (key) =>
        (observedTotals[key] ?? 0) ===
        (guardedTotals[key] ?? 0),
    );

  if (!alreadyMoved) return;

  window.clearTimeout(
    clearMoveGuardTimer,
  );
  clearMoveGuardTimer =
    window.setTimeout(() => {
      if (
        activeBetMoveGuard === guard
      ) {
        activeBetMoveGuard = null;
      }
    }, 0);
}

async function readResponse<T>(
  response: Response,
): Promise<T> {
  const body =
    await response
      .json()
      .catch(() => ({})) as {
        error?: unknown;
      };

  if (!response.ok) {
    throw new Error(
      typeof body?.error ===
        "string"
        ? body.error
        : "ROULETTE_CONNECTION_FAILED",
    );
  }

  return body as T;
}

function isAbortError(
  error: unknown,
) {
  return (
    error instanceof Error &&
    error.name === "AbortError"
  );
}

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number,
) {
  const controller =
    new AbortController();
  const timeoutId =
    globalThis.setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(
      input,
      {
        ...init,
        signal:
          controller.signal,
      },
    );
  } finally {
    globalThis.clearTimeout(
      timeoutId,
    );
  }
}

export class RouletteWalletClient {
  async bootstrap():
    Promise<RouletteBootstrapResponse> {
    const response =
      await fetch(
        `${API_BASE}/state`,
        {
          credentials:
            "same-origin",
          cache: "no-store",
        },
      );
    const body =
      await readResponse<{
        simulationVersion?: unknown;
        serverTimeMs?: unknown;
        globalTable?:
          | RouletteGlobalTableSnapshot
          | null;
        recentResults?: unknown;
        globalBet?:
          | RouletteGlobalBetSnapshot
          | null;
        wallet:
          RouletteWallet;
      }>(response);
    const headerVersion =
      response.headers?.get?.(
        "X-Roulette-Simulation-Version",
      );
    const globalBet =
      body.globalBet ?? null;

    rememberObservedGlobalBet(
      globalBet,
    );

    return {
      simulationVersion:
        typeof body
          .simulationVersion ===
        "string"
          ? body
              .simulationVersion
          : headerVersion ??
            "",
      serverTimeMs:
        typeof body
          .serverTimeMs ===
        "number"
          ? body
              .serverTimeMs
          : Number.NaN,
      globalTable:
        body.globalTable ??
        null,
      recentResults:
        Array.isArray(
          body.recentResults,
        )
          ? body.recentResults.filter(
              (value): value is number =>
                typeof value ===
                  "number" &&
                Number.isInteger(
                  value,
                ) &&
                value >= 0 &&
                value <= 36,
            )
          : [],
      globalBet,
      wallet:
        body.wallet,
    };
  }

  async updateGlobalBet(
    roundId: string,
    bets:
      readonly RouletteBetPlacement[],
    idempotencyKey: string,
    expectedRevision: number,
  ): Promise<RouletteGlobalBetUpdateResponse> {
    cleanupExpiredMoveGuard();

    if (
      idempotencyKey.startsWith(
        "roulette_drag_",
      ) &&
      lastObservedGlobalBet
        ?.roundId === roundId
    ) {
      const derived =
        deriveRouletteBetMoveGuard(
          roundId,
          lastObservedGlobalBet.bets,
          bets,
        );
      if (derived) {
        activeBetMoveGuard =
          derived;
      }
    }

    const guardedBets =
      applyRouletteBetMoveGuard(
        activeBetMoveGuard,
        roundId,
        bets,
      );

    try {
      const response =
        await fetchWithTimeout(
          `${API_BASE}/global-bets`,
          {
            method: "PUT",
            credentials:
              "same-origin",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                roundId,
                bets:
                  guardedBets,
                idempotencyKey,
                expectedRevision,
              }),
          },
          ROULETTE_REQUEST_TIMEOUT_MS,
        ).catch(
          (error) => {
            if (
              isAbortError(
                error,
              )
            ) {
              throw new Error(
                "ROULETTE_GLOBAL_BET_TIMEOUT",
              );
            }

            throw error;
          },
        );

      const result =
        await readResponse<RouletteGlobalBetUpdateResponse>(
          response,
        );

      if (result.globalBet) {
        rememberObservedGlobalBet(
          result.globalBet,
        );
      }

      if (
        idempotencyKey.startsWith(
          "roulette_drag_",
        ) &&
        activeBetMoveGuard
          ?.roundId === roundId &&
        result.globalBet
      ) {
        activeBetMoveGuard = {
          ...activeBetMoveGuard,
          confirmedRevision:
            result.globalBet.revision,
        };
      }

      return result;
    } catch (error) {
      if (
        idempotencyKey.startsWith(
          "roulette_drag_",
        ) &&
        activeBetMoveGuard
          ?.roundId === roundId
      ) {
        activeBetMoveGuard = null;
      }
      throw error;
    }
  }
}
