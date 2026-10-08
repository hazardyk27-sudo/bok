import {
  RouletteWalletClient,
  type RouletteBootstrapResponse,
  type RouletteGlobalBetSnapshot,
  type RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";
import type { RouletteBetPlacement } from "./betState";
import {
  cloneRouletteAuthorityBets,
  getRouletteAuthorityStake,
} from "./betAuthorityState";
import {
  clearRouletteBetAuthority,
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";

let installed = false;
let lastAcceptedGlobalBet: RouletteGlobalBetSnapshot | null = null;
let writeTail: Promise<void> = Promise.resolve();
let mutationSequence = 0;

function cloneGlobalBet(
  globalBet: RouletteGlobalBetSnapshot,
): RouletteGlobalBetSnapshot {
  return {
    ...globalBet,
    bets: cloneRouletteAuthorityBets(globalBet.bets),
  };
}

function cloneBootstrap(
  response: RouletteBootstrapResponse,
  globalBet: RouletteGlobalBetSnapshot | null,
): RouletteBootstrapResponse {
  return {
    ...response,
    globalBet: globalBet ? cloneGlobalBet(globalBet) : null,
  };
}

function syntheticAuthorityBet(
  roundId: string,
  bets: NonNullable<ReturnType<typeof getRouletteBetAuthoritySnapshot>["bets"]>,
  revision: number,
  base: RouletteGlobalBetSnapshot | null,
): RouletteGlobalBetSnapshot {
  return {
    id: base?.id ?? `optimistic-${roundId}`,
    roundId,
    bets: cloneRouletteAuthorityBets(bets),
    stakeCents: Math.round(getRouletteAuthorityStake(bets) * 100),
    payoutCents: base?.payoutCents ?? 0,
    revision: Math.max(0, revision, base?.revision ?? 0),
    settlement: base?.settlement ?? null,
    settledAtMs: base?.settledAtMs ?? null,
    updatedAtMs: Date.now(),
  };
}

function betTotals(
  bets: readonly RouletteBetPlacement[],
) {
  const totals = new Map<string, number>();
  for (const bet of bets) {
    totals.set(
      bet.betId,
      (totals.get(bet.betId) ?? 0) + bet.amount,
    );
  }
  return totals;
}

function sameWagerTopology(
  left: readonly RouletteBetPlacement[],
  right: readonly RouletteBetPlacement[],
) {
  const a = betTotals(left);
  const b = betTotals(right);
  if (a.size !== b.size) return false;
  for (const [betId, amount] of a) {
    if ((b.get(betId) ?? 0) !== amount) return false;
  }
  return true;
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

  if (authority.optimistic) {
    return false;
  }

  if (serverRevision === null) {
    return false;
  }

  return serverRevision >= authority.revision;
}

export function selectRouletteRuntimeBootstrapBet(
  authority: ReturnType<typeof getRouletteBetAuthoritySnapshot>,
  roundId: string,
  serverBet: RouletteGlobalBetSnapshot | null,
  acceptedBet: RouletteGlobalBetSnapshot | null,
) {
  if (authority.roundId !== roundId) {
    return serverBet ? cloneGlobalBet(serverBet) : null;
  }

  const acceptedSameRound =
    acceptedBet?.roundId === roundId
      ? acceptedBet
      : null;
  const serverSameRound =
    serverBet?.roundId === roundId
      ? serverBet
      : null;

  if (
    authority.bets &&
    (
      authority.optimistic ||
      !shouldAcceptRouletteAuthorityBootstrap(
        authority,
        roundId,
        serverSameRound?.revision ?? null,
      )
    )
  ) {
    return syntheticAuthorityBet(
      roundId,
      authority.bets,
      authority.revision,
      acceptedSameRound ?? serverSameRound,
    );
  }

  if (serverSameRound) {
    return cloneGlobalBet(serverSameRound);
  }

  if (authority.bets) {
    return syntheticAuthorityBet(
      roundId,
      authority.bets,
      authority.revision,
      acceptedSameRound,
    );
  }

  return acceptedSameRound
    ? cloneGlobalBet(acceptedSameRound)
    : null;
}

function enqueueWrite<T>(task: () => Promise<T>) {
  const run = writeTail.then(task, task);
  writeTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function joinRouletteAuthorityWriteBarrier(
  previous: Promise<unknown>,
  external: Promise<unknown>,
): Promise<void> {
  return Promise.allSettled([
    previous,
    external,
  ]).then(() => undefined);
}

export function registerRouletteExternalMutationBarrier(
  external: Promise<unknown>,
) {
  writeTail = joinRouletteAuthorityWriteBarrier(
    writeTail,
    external,
  );
}

function revisionForWrite(
  roundId: string,
  requestedRevision: number,
) {
  if (lastAcceptedGlobalBet?.roundId === roundId) {
    return lastAcceptedGlobalBet.revision;
  }

  const authority = getRouletteBetAuthoritySnapshot();
  if (authority.roundId === roundId) {
    return Math.max(requestedRevision, authority.revision);
  }

  return Math.max(0, requestedRevision);
}

function acceptConfirmedWrite(
  roundId: string,
  plan: readonly RouletteBetPlacement[],
  response: RouletteGlobalBetUpdateResponse,
  sequence: number,
) {
  if (response.globalBet?.roundId === roundId) {
    if (
      !lastAcceptedGlobalBet ||
      lastAcceptedGlobalBet.roundId !== roundId ||
      response.globalBet.revision >= lastAcceptedGlobalBet.revision
    ) {
      lastAcceptedGlobalBet = cloneGlobalBet(response.globalBet);
    }

    const authority = getRouletteBetAuthoritySnapshot();
    const stillRepresentsThisWrite =
      authority.bets !== null &&
      sameWagerTopology(authority.bets, plan);

    if (
      sequence === mutationSequence &&
      authority.roundId === roundId &&
      stillRepresentsThisWrite
    ) {
      setRouletteBetAuthority(
        roundId,
        response.globalBet.bets,
        response.globalBet.revision,
        false,
      );
    }
    return;
  }

  if (
    !lastAcceptedGlobalBet ||
    lastAcceptedGlobalBet.roundId === roundId
  ) {
    lastAcceptedGlobalBet = null;
  }
  const authority = getRouletteBetAuthoritySnapshot();
  const stillRepresentsThisWrite =
    authority.bets !== null &&
    sameWagerTopology(authority.bets, plan);

  if (
    sequence === mutationSequence &&
    authority.roundId === roundId &&
    stillRepresentsThisWrite
  ) {
    setRouletteBetAuthority(
      roundId,
      [],
      authority.revision + 1,
      false,
    );
  }
}

export function reserveRouletteExternalLatestMutation() {
  mutationSequence += 1;
  return mutationSequence;
}

export function confirmRouletteExternalLatestMutation(
  roundId: string,
  plan: readonly RouletteBetPlacement[],
  response: RouletteGlobalBetUpdateResponse,
  sequence: number,
) {
  acceptConfirmedWrite(
    roundId,
    plan,
    response,
    sequence,
  );
}

async function recoverCurrentMutation(
  client: RouletteWalletClient,
  originalBootstrap: () => Promise<RouletteBootstrapResponse>,
  roundId: string,
  sequence: number,
) {
  if (sequence !== mutationSequence) return;

  try {
    const fresh = await originalBootstrap.call(client);
    if (fresh.globalTable?.roundId !== roundId) {
      clearRouletteBetAuthority();
      lastAcceptedGlobalBet = null;
      return;
    }

    if (fresh.globalBet?.roundId === roundId) {
      lastAcceptedGlobalBet = cloneGlobalBet(fresh.globalBet);
      setRouletteBetAuthority(
        roundId,
        fresh.globalBet.bets,
        fresh.globalBet.revision,
        false,
      );
    } else {
      lastAcceptedGlobalBet = null;
      setRouletteBetAuthority(roundId, [], 0, false);
    }
  } catch {
    // Keep the visible local wager. A transient read failure is safer than
    // erasing a bet that may already have reached the server.
  }
}

export function installRouletteBetAuthority(_app: HTMLDivElement) {
  if (installed) return;
  installed = true;

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

    let authority = getRouletteBetAuthoritySnapshot();

    if (authority.roundId !== roundId) {
      setRouletteBetAuthority(
        roundId,
        serverBet?.bets ?? [],
        serverBet?.revision ?? 0,
        false,
      );
      lastAcceptedGlobalBet = serverBet
        ? cloneGlobalBet(serverBet)
        : null;
      return cloneBootstrap(response, serverBet);
    }

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
      authority = getRouletteBetAuthoritySnapshot();
    }

    const runtimeBet = selectRouletteRuntimeBootstrapBet(
      authority,
      roundId,
      serverBet,
      lastAcceptedGlobalBet,
    );

    return cloneBootstrap(response, runtimeBet);
  };

  RouletteWalletClient.prototype.updateGlobalBet = function (
    roundId,
    bets,
    idempotencyKey,
    expectedRevision,
  ) {
    const sequence = ++mutationSequence;
    const plan = cloneRouletteAuthorityBets(bets);
    const beforeWrite = getRouletteBetAuthoritySnapshot();

    setRouletteBetAuthority(
      roundId,
      plan,
      beforeWrite.roundId === roundId
        ? beforeWrite.revision
        : expectedRevision,
      true,
    );

    return enqueueWrite(async () => {
      let revision = revisionForWrite(roundId, expectedRevision);

      try {
        const response = await originalUpdate.call(
          this,
          roundId,
          plan,
          idempotencyKey,
          revision,
        );
        acceptConfirmedWrite(roundId, plan, response, sequence);
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message !== "ROULETTE_GLOBAL_BET_STALE") {
          await recoverCurrentMutation(
            this,
            originalBootstrap,
            roundId,
            sequence,
          );
          throw error;
        }

        if (sequence !== mutationSequence) {
          throw error;
        }
      }

      const fresh = await originalBootstrap.call(this);
      const freshRoundId = fresh.globalTable?.roundId ?? null;
      if (freshRoundId !== roundId) {
        await recoverCurrentMutation(
          this,
          originalBootstrap,
          roundId,
          sequence,
        );
        throw new Error("ROULETTE_GLOBAL_BETTING_CLOSED");
      }

      if (fresh.globalBet?.roundId === roundId) {
        lastAcceptedGlobalBet = cloneGlobalBet(fresh.globalBet);
        revision = fresh.globalBet.revision;
      } else {
        lastAcceptedGlobalBet = null;
        revision = 0;
      }

      try {
        const response = await originalUpdate.call(
          this,
          roundId,
          plan,
          idempotencyKey,
          revision,
        );
        acceptConfirmedWrite(roundId, plan, response, sequence);
        return response;
      } catch (error) {
        await recoverCurrentMutation(
          this,
          originalBootstrap,
          roundId,
          sequence,
        );
        throw error;
      }
    });
  };
}
