import { RouletteWalletClient } from "./rouletteWalletClient";
import type { RouletteGlobalBetSnapshot } from "./rouletteWalletClient";
import {
  cloneRouletteAuthorityBets,
  resolveRouletteAuthorityMutation,
  resolveRouletteDragMutation,
  type RouletteAuthorityIntent,
} from "./betAuthorityState";
import {
  clearRouletteBetAuthority,
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";

const V6_MOVE_PREFIX = "roulette_move_v6_";
const LATEST_MOVE_PREFIX = "roulette_move_latest_";

type MutationPlan = {
  roundId: string;
  bets: ReturnType<typeof cloneRouletteAuthorityBets>;
};

let installed = false;
let pendingIntent: RouletteAuthorityIntent = { kind: "unknown" };
let intentToken = 0;
const mutationPlans = new Map<string, MutationPlan>();
let lastAcceptedGlobalBet: RouletteGlobalBetSnapshot | null = null;

function cloneGlobalBet(
  globalBet: RouletteGlobalBetSnapshot,
): RouletteGlobalBetSnapshot {
  return {
    ...globalBet,
    bets: cloneRouletteAuthorityBets(globalBet.bets),
  };
}

export function shouldAcceptRouletteAuthorityBootstrap(
  authority: {
    roundId: string | null;
    revision: number;
    optimistic: boolean;
  },
  roundId: string,
  serverRevision: number | null,
) {
  if (authority.roundId !== roundId) {
    return true;
  }

  if (serverRevision === null) {
    return false;
  }

  if (serverRevision > authority.revision) {
    return true;
  }

  return (
    !authority.optimistic &&
    serverRevision === authority.revision
  );
}

export function selectRouletteRuntimeBootstrapBet(
  authority: {
    roundId: string | null;
    revision: number;
    optimistic: boolean;
  },
  roundId: string,
  serverBet: RouletteGlobalBetSnapshot | null,
  acceptedBet: RouletteGlobalBetSnapshot | null,
) {
  if (
    shouldAcceptRouletteAuthorityBootstrap(
      authority,
      roundId,
      serverBet?.revision ?? null,
    )
  ) {
    return serverBet ? cloneGlobalBet(serverBet) : null;
  }

  if (acceptedBet?.roundId === roundId) {
    return cloneGlobalBet(acceptedBet);
  }

  return serverBet ? cloneGlobalBet(serverBet) : null;
}

function selectedChipAmount(app: HTMLDivElement) {
  const selected = app.querySelector<HTMLElement>(
    ".roulette-chip-option[data-chip-value][aria-pressed=\"true\"]",
  );
  const selectedValue = Number(selected?.dataset.chipValue);
  if (Number.isFinite(selectedValue) && selectedValue > 0) {
    return selectedValue;
  }

  const toggle = app.querySelector<HTMLElement>("[data-mobile-chip-toggle]");
  const toggleValue = Number(
    toggle?.dataset.selectedChipValue ?? toggle?.dataset.selectedChip,
  );
  return Number.isFinite(toggleValue) && toggleValue > 0 ? toggleValue : 10;
}

function queueIntent(intent: RouletteAuthorityIntent) {
  const token = ++intentToken;
  pendingIntent = intent;
  queueMicrotask(() => {
    if (intentToken === token) {
      pendingIntent = { kind: "unknown" };
    }
  });
}

function consumeIntent() {
  const intent = pendingIntent;
  pendingIntent = { kind: "unknown" };
  intentToken += 1;
  return intent;
}

function installIntentCapture(app: HTMLDivElement) {
  app.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("[data-double-bet]")) {
        queueIntent({ kind: "double" });
        return;
      }
      if (target.closest("[data-undo-bet]")) {
        queueIntent({ kind: "undo" });
        return;
      }
      if (target.closest("[data-clear-bets]")) {
        queueIntent({ kind: "clear" });
        return;
      }
      if (target.closest("[data-rebet]")) {
        queueIntent({ kind: "rebet" });
        return;
      }

      const cell = target.closest<HTMLElement>("[data-bet-id]");
      const betId = cell?.dataset.betId;
      if (betId) {
        queueIntent({
          kind: "place",
          betId,
          amount: selectedChipAmount(app),
        });
      }
    },
    true,
  );
}

export function installRouletteBetAuthority(app: HTMLDivElement) {
  if (installed) return;
  installed = true;
  installIntentCapture(app);

  const originalBootstrap = RouletteWalletClient.prototype.bootstrap;
  const originalUpdate = RouletteWalletClient.prototype.updateGlobalBet;

  RouletteWalletClient.prototype.bootstrap = async function () {
    const response = await originalBootstrap.call(this);
    const roundId = response.globalTable?.roundId ?? null;
    const serverBet = response.globalBet;

    if (!roundId) {
      clearRouletteBetAuthority();
      lastAcceptedGlobalBet = null;
      return response;
    }

    const authority = getRouletteBetAuthoritySnapshot();

    if (authority.roundId !== roundId) {
      setRouletteBetAuthority(
        roundId,
        serverBet?.bets ?? [],
        serverBet?.revision ?? 0,
        false,
      );
      lastAcceptedGlobalBet = serverBet ? cloneGlobalBet(serverBet) : null;
      return response;
    }

    const runtimeBet = selectRouletteRuntimeBootstrapBet(
      authority,
      roundId,
      serverBet,
      lastAcceptedGlobalBet,
    );

    if (
      serverBet &&
      shouldAcceptRouletteAuthorityBootstrap(
        authority,
        roundId,
        serverBet.revision,
      )
    ) {
      setRouletteBetAuthority(
        roundId,
        serverBet.bets,
        serverBet.revision,
        false,
      );
      lastAcceptedGlobalBet = cloneGlobalBet(serverBet);
    }

    if (runtimeBet === serverBet) {
      return response;
    }

    return {
      ...response,
      globalBet: runtimeBet,
    };
  };

  RouletteWalletClient.prototype.updateGlobalBet = async function (
    roundId,
    bets,
    idempotencyKey,
    expectedRevision,
  ) {
    const dragWrite =
      idempotencyKey.startsWith(V6_MOVE_PREFIX) ||
      idempotencyKey.startsWith(LATEST_MOVE_PREFIX);

    let plan = mutationPlans.get(idempotencyKey);
    if (!plan) {
      const authority = getRouletteBetAuthoritySnapshot();
      const current =
        authority.roundId === roundId && authority.bets
          ? authority.bets
          : bets;
      const desired = dragWrite
        ? resolveRouletteDragMutation(current, bets)
        : resolveRouletteAuthorityMutation(current, bets, consumeIntent());
      plan = {
        roundId,
        bets: cloneRouletteAuthorityBets(desired),
      };
      mutationPlans.set(idempotencyKey, plan);
    }

    const beforeWrite = getRouletteBetAuthoritySnapshot();
    setRouletteBetAuthority(
      roundId,
      plan.bets,
      beforeWrite.roundId === roundId
        ? beforeWrite.revision
        : expectedRevision,
      true,
    );

    try {
      const response = await originalUpdate.call(
        this,
        roundId,
        plan.bets,
        idempotencyKey,
        expectedRevision,
      );
      mutationPlans.delete(idempotencyKey);

      if (response.globalBet?.roundId === roundId) {
        setRouletteBetAuthority(
          roundId,
          response.globalBet.bets,
          response.globalBet.revision,
          false,
        );
        lastAcceptedGlobalBet = cloneGlobalBet(response.globalBet);
      } else if (plan.bets.length === 0) {
        setRouletteBetAuthority(
          roundId,
          [],
          expectedRevision + 1,
          false,
        );
        lastAcceptedGlobalBet = null;
      }

      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message !== "ROULETTE_GLOBAL_BET_STALE") {
        mutationPlans.delete(idempotencyKey);
        try {
          const fresh = await originalBootstrap.call(this);
          const freshRoundId = fresh.globalTable?.roundId ?? null;
          const freshBet = fresh.globalBet;
          const currentAuthority = getRouletteBetAuthoritySnapshot();

          if (
            freshRoundId === roundId &&
            freshBet &&
            shouldAcceptRouletteAuthorityBootstrap(
              currentAuthority,
              roundId,
              freshBet.revision,
            )
          ) {
            setRouletteBetAuthority(
              roundId,
              freshBet.bets,
              freshBet.revision,
              false,
            );
            lastAcceptedGlobalBet = cloneGlobalBet(freshBet);
          } else if (freshRoundId !== roundId) {
            clearRouletteBetAuthority();
            lastAcceptedGlobalBet = null;
          }
        } catch {
          // Keep the last accepted authority. A network failure must not erase
          // a wager that the user can still see and that may already be saved.
        }
      }
      throw error;
    }
  };
}
