import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
} from "./betState";
import {
  registerRouletteExternalMutationBarrier,
} from "./betAuthority";
import {
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import {
  RouletteWalletClient,
  type RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";

const RUNTIME_MUTATION_PREFIX =
  "roulette_gbet_";

type PendingLatestMutation = {
  roundId: string;
  bets: RouletteBetPlacement[];
  promise: Promise<RouletteGlobalBetUpdateResponse>;
};

let installed = false;
let pendingLatestMutation: PendingLatestMutation | null = null;
const activeLatestMutations = new Set<PendingLatestMutation>();

function cloneBets(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({ ...bet }));
}

function sameBetTotals(
  left: readonly RouletteBetPlacement[],
  right: readonly RouletteBetPlacement[],
) {
  const a = getRouletteBetTotals(left);
  const b = getRouletteBetTotals(right);
  const keys = new Set([
    ...Object.keys(a),
    ...Object.keys(b),
  ]);

  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) {
      return false;
    }
  }

  return true;
}

export function hasRouletteActiveExternalLatestMutation(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
) {
  for (const mutation of activeLatestMutations) {
    if (
      mutation.roundId === roundId &&
      sameBetTotals(mutation.bets, bets)
    ) {
      return true;
    }
  }

  return false;
}

export function selectRouletteRuntimeMutationBets(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
  idempotencyKey: string,
) {
  if (!idempotencyKey.startsWith(RUNTIME_MUTATION_PREFIX)) {
    return cloneBets(bets);
  }

  const authority =
    getRouletteBetAuthoritySnapshot();

  if (
    authority.roundId === roundId &&
    authority.bets !== null
  ) {
    return cloneBets(authority.bets);
  }

  return cloneBets(bets);
}

export function discardRoulettePendingExternalLatestMutationIfSuperseded(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
) {
  const pending = pendingLatestMutation;

  if (!pending) return false;

  if (
    pending.roundId === roundId &&
    sameBetTotals(pending.bets, bets)
  ) {
    return false;
  }

  pendingLatestMutation = null;
  return true;
}

export function releaseRouletteFailedExternalLatestMutation(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
) {
  const authority =
    getRouletteBetAuthoritySnapshot();

  if (
    authority.roundId !== roundId ||
    !authority.optimistic ||
    !authority.bets ||
    !sameBetTotals(authority.bets, bets)
  ) {
    return false;
  }

  setRouletteBetAuthority(
    roundId,
    authority.bets,
    authority.revision,
    false,
  );
  return true;
}

export function registerRouletteExternalLatestMutation(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
  promise: Promise<RouletteGlobalBetUpdateResponse>,
) {
  const record: PendingLatestMutation = {
    roundId,
    bets: cloneBets(bets),
    promise,
  };

  // A newer fast action supersedes the dedupe slot, while every active request
  // remains tracked independently until its network promise settles.
  pendingLatestMutation = record;
  activeLatestMutations.add(record);

  // The request already started at capture time, so it keeps the deadline
  // advantage. Registering the same promise as an authority queue barrier means
  // any later normal mutation (clear/undo/place/drag) cannot reach the server
  // until every earlier fast x2 barrier ahead of it has settled.
  registerRouletteExternalMutationBarrier(
    promise,
  );

  void promise.catch(() => {
    releaseRouletteFailedExternalLatestMutation(
      roundId,
      record.bets,
    );
  });

  void promise.finally(() => {
    // Do not clear pendingLatestMutation here. The fast HTTP response can finish
    // before a delayed runtime queue reaches the matching roulette_gbet job. The
    // resolved/rejected promise must remain reusable until that runtime job
    // consumes it or a later runtime topology proves it was superseded.
    activeLatestMutations.delete(record);
  }).catch(() => {
    // The caller owns the request error. This chain only clears active tracking.
  });
}

export function consumeMatchingRouletteExternalLatestMutation(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
) {
  const pending = pendingLatestMutation;

  if (
    !pending ||
    pending.roundId !== roundId ||
    !sameBetTotals(pending.bets, bets)
  ) {
    return null;
  }

  pendingLatestMutation = null;
  return pending.promise;
}

export function clearRouletteExternalLatestMutationForTests() {
  pendingLatestMutation = null;
  activeLatestMutations.clear();
}

export function installRouletteLatestMutationDeduper() {
  if (installed) return;
  installed = true;

  const originalUpdate =
    RouletteWalletClient.prototype.updateGlobalBet;

  RouletteWalletClient.prototype.updateGlobalBet = function (
    roundId,
    bets,
    idempotencyKey,
    expectedRevision,
  ) {
    // Runtime queue jobs are snapshots. Rebase them at actual send time onto the
    // unified authority so a delayed pre-drag/pre-undo job cannot restore stale
    // topology after a newer local action.
    const effectiveBets =
      selectRouletteRuntimeMutationBets(
        roundId,
        bets,
        idempotencyKey,
      );

    const sharedLatest =
      consumeMatchingRouletteExternalLatestMutation(
        roundId,
        effectiveBets,
      );

    if (sharedLatest) {
      const authority =
        getRouletteBetAuthoritySnapshot();
      setRouletteBetAuthority(
        roundId,
        effectiveBets,
        authority.roundId === roundId
          ? authority.revision
          : expectedRevision,
        true,
      );
      return sharedLatest;
    }

    if (idempotencyKey.startsWith(RUNTIME_MUTATION_PREFIX)) {
      // The first runtime queue job after a fast registration is the canonical
      // consumer opportunity. If its commit-time authority no longer matches the
      // fast plan, that plan was superseded and must never be matched later by
      // coincidence.
      discardRoulettePendingExternalLatestMutationIfSuperseded(
        roundId,
        effectiveBets,
      );
    }

    return originalUpdate.call(
      this,
      roundId,
      effectiveBets,
      idempotencyKey,
      expectedRevision,
    );
  };
}
