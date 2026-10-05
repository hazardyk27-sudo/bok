import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
} from "./betState";
import {
  RouletteWalletClient,
  type RouletteBootstrapResponse,
  type RouletteGlobalBetSnapshot,
  type RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

const V6_MOVE_PREFIX = "roulette_move_v6_";
const LATEST_MOVE_PREFIX = "roulette_move_latest_";
const MAX_LATEST_SYNC_ATTEMPTS = 6;
const VIRTUAL_STATE_IDLE_MS = 900;

type WriterState = {
  virtualBet: RouletteGlobalBetSnapshot;
  actualBet: RouletteGlobalBetSnapshot | null;
  balanceCents: number;
  clearTimer: number;
};

type ActualSnapshot = {
  globalBet: RouletteGlobalBetSnapshot | null;
  balanceCents: number;
};

type SyncLatestOptions = {
  roundId: string;
  initialActual: ActualSnapshot;
  readLatestBets: () => RouletteBetPlacement[];
  refreshActual: () => Promise<ActualSnapshot>;
  writeActual: (
    bets: readonly RouletteBetPlacement[],
    expectedRevision: number,
  ) => Promise<RouletteGlobalBetUpdateResponse>;
  maxAttempts?: number;
};

let installed = false;
let mountedApp: HTMLDivElement | null = null;

const writerStates = new WeakMap<RouletteWalletClient, WriterState>();
const lastActualBootstraps = new WeakMap<
  RouletteWalletClient,
  RouletteBootstrapResponse
>();

function cloneBets(bets: readonly RouletteBetPlacement[]) {
  return bets.map((bet) => ({ ...bet }));
}

function cloneGlobalBet(
  globalBet: RouletteGlobalBetSnapshot,
): RouletteGlobalBetSnapshot {
  return {
    ...globalBet,
    bets: cloneBets(globalBet.bets),
  };
}

function totalStake(bets: readonly RouletteBetPlacement[]) {
  return bets.reduce((sum, bet) => sum + bet.amount, 0);
}

export function areRouletteBetPlacementsEqual(
  left: readonly RouletteBetPlacement[],
  right: readonly RouletteBetPlacement[],
) {
  const a = getRouletteBetTotals(left);
  const b = getRouletteBetTotals(right);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0));
}

export function readRouletteVisibleBets(
  root: ParentNode,
): RouletteBetPlacement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-bet-id]"))
    .flatMap((cell) => {
      const betId = cell.dataset.betId;
      const chip = cell.querySelector<HTMLElement>(
        ".roulette-placed-chip[data-bet-amount]",
      );
      const amount = Number(chip?.dataset.betAmount);
      return betId && Number.isFinite(amount) && amount > 0
        ? [{ betId, amount }]
        : [];
    });
}

export function createRouletteVirtualBet(
  base: RouletteGlobalBetSnapshot,
  bets: readonly RouletteBetPlacement[],
  expectedRevision: number,
): RouletteGlobalBetSnapshot {
  return {
    ...base,
    bets: cloneBets(bets),
    stakeCents: Math.round(totalStake(bets) * 100),
    revision: Math.max(base.revision, expectedRevision) + 1,
    updatedAtMs: Date.now(),
  };
}

export async function syncRouletteLatestVisibleState({
  roundId,
  initialActual,
  readLatestBets,
  refreshActual,
  writeActual,
  maxAttempts = MAX_LATEST_SYNC_ATTEMPTS,
}: SyncLatestOptions): Promise<ActualSnapshot> {
  let actual = initialActual;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!actual.globalBet || actual.globalBet.roundId !== roundId) {
      actual = await refreshActual();
    }

    const globalBet = actual.globalBet;
    if (!globalBet || globalBet.roundId !== roundId) {
      throw new Error("ROULETTE_DRAG_BET_UNAVAILABLE");
    }

    const latestBets = readLatestBets();
    if (latestBets.length === 0 && globalBet.bets.length > 0) {
      throw new Error("ROULETTE_DRAG_VISIBLE_STATE_UNAVAILABLE");
    }

    if (areRouletteBetPlacementsEqual(globalBet.bets, latestBets)) {
      return actual;
    }

    try {
      const response = await writeActual(latestBets, globalBet.revision);
      actual = {
        globalBet: response.globalBet
          ? cloneGlobalBet(response.globalBet)
          : null,
        balanceCents: response.balanceCents,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message !== "ROULETTE_GLOBAL_BET_STALE") {
        throw error;
      }
      actual = await refreshActual();
    }
  }

  const latestBets = readLatestBets();
  if (
    actual.globalBet &&
    actual.globalBet.roundId === roundId &&
    areRouletteBetPlacementsEqual(actual.globalBet.bets, latestBets)
  ) {
    return actual;
  }

  throw new Error("ROULETTE_DRAG_LATEST_STATE_UNCONFIRMED");
}

function clearWriterState(client: RouletteWalletClient) {
  const state = writerStates.get(client);
  if (state) {
    globalThis.clearTimeout(state.clearTimer);
  }
  writerStates.delete(client);
}

function scheduleWriterStateClear(client: RouletteWalletClient) {
  const state = writerStates.get(client);
  if (!state) return;

  globalThis.clearTimeout(state.clearTimer);
  state.clearTimer = globalThis.setTimeout(() => {
    if (writerStates.get(client) === state) {
      writerStates.delete(client);
    }
  }, VIRTUAL_STATE_IDLE_MS) as unknown as number;
}

function visibleBetsForState(
  app: HTMLDivElement,
  fallback: readonly RouletteBetPlacement[],
) {
  const visible = readRouletteVisibleBets(app);
  const fallbackStake = totalStake(fallback);
  const visibleStake = totalStake(visible);

  return visible.length > 0 && Math.abs(visibleStake - fallbackStake) < 1e-9
    ? visible
    : cloneBets(fallback);
}

export function installRouletteChipDragLatestWriter(app: HTMLDivElement) {
  mountedApp = app;
  if (installed) return;
  installed = true;

  const originalBootstrap = RouletteWalletClient.prototype.bootstrap;
  const originalUpdate = RouletteWalletClient.prototype.updateGlobalBet;

  RouletteWalletClient.prototype.bootstrap = async function () {
    const actual = await originalBootstrap.call(this);
    lastActualBootstraps.set(this, actual);

    const state = writerStates.get(this);
    if (!state) return actual;

    state.actualBet = actual.globalBet
      ? cloneGlobalBet(actual.globalBet)
      : null;
    state.balanceCents = actual.wallet.balanceCents;

    const activeRoundId = actual.globalTable?.roundId ?? null;
    if (!activeRoundId || state.virtualBet.roundId !== activeRoundId) {
      clearWriterState(this);
      return actual;
    }

    return {
      ...actual,
      globalBet: cloneGlobalBet(state.virtualBet),
    };
  };

  RouletteWalletClient.prototype.updateGlobalBet = async function (
    roundId,
    bets,
    idempotencyKey,
    expectedRevision,
  ) {
    if (!idempotencyKey.startsWith(V6_MOVE_PREFIX)) {
      return originalUpdate.call(
        this,
        roundId,
        bets,
        idempotencyKey,
        expectedRevision,
      );
    }

    const lastBootstrap = lastActualBootstraps.get(this);
    const existingState = writerStates.get(this);
    const baseBet =
      existingState?.virtualBet ??
      (lastBootstrap?.globalBet ? cloneGlobalBet(lastBootstrap.globalBet) : null);

    if (!baseBet || baseBet.roundId !== roundId || !mountedApp?.isConnected) {
      return originalUpdate.call(
        this,
        roundId,
        bets,
        idempotencyKey,
        expectedRevision,
      );
    }

    const state: WriterState = existingState ?? {
      virtualBet: cloneGlobalBet(baseBet),
      actualBet: lastBootstrap?.globalBet
        ? cloneGlobalBet(lastBootstrap.globalBet)
        : null,
      balanceCents: lastBootstrap?.wallet.balanceCents ?? 0,
      clearTimer: 0,
    };

    state.virtualBet = createRouletteVirtualBet(
      state.virtualBet,
      bets,
      expectedRevision,
    );
    writerStates.set(this, state);
    scheduleWriterStateClear(this);

    const appForWrite = mountedApp;
    const fallbackBets = cloneBets(state.virtualBet.bets);

    const refreshActual = async (): Promise<ActualSnapshot> => {
      const bootstrap = await originalBootstrap.call(this);
      lastActualBootstraps.set(this, bootstrap);
      state.actualBet = bootstrap.globalBet
        ? cloneGlobalBet(bootstrap.globalBet)
        : null;
      state.balanceCents = bootstrap.wallet.balanceCents;
      return {
        globalBet: state.actualBet ? cloneGlobalBet(state.actualBet) : null,
        balanceCents: state.balanceCents,
      };
    };

    const actual = await syncRouletteLatestVisibleState({
      roundId,
      initialActual: {
        globalBet: state.actualBet ? cloneGlobalBet(state.actualBet) : null,
        balanceCents: state.balanceCents,
      },
      readLatestBets: () => visibleBetsForState(appForWrite, fallbackBets),
      refreshActual,
      writeActual: async (latestBets, actualRevision) =>
        originalUpdate.call(
          this,
          roundId,
          latestBets,
          `${LATEST_MOVE_PREFIX}${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`,
          actualRevision,
        ),
    });

    state.actualBet = actual.globalBet
      ? cloneGlobalBet(actual.globalBet)
      : null;
    state.balanceCents = actual.balanceCents;
    scheduleWriterStateClear(this);

    return {
      globalBet: cloneGlobalBet(state.virtualBet),
      balanceCents: state.balanceCents,
    };
  };
}
