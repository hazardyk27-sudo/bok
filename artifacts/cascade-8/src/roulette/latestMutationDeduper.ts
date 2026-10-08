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
    activeLatestMutations.delete(record);
    if (pendingLatestMutation === record) {
      pendingLatestMutation = null;
    }
  }).catch(() => {
    // The caller owns the request error. This chain only clears tracking state.
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
    const sharedLatest =
      consumeMatchingRouletteExternalLatestMutation(
        roundId,
        bets,
      );

    if (sharedLatest) {
      const authority =
        getRouletteBetAuthoritySnapshot();
      setRouletteBetAuthority(
        roundId,
        bets,
        authority.roundId === roundId
          ? authority.revision
          : expectedRevision,
        true,
      );
      return sharedLatest;
    }

    return originalUpdate.call(
      this,
      roundId,
      bets,
      idempotencyKey,
      expectedRevision,
    );
  };
}
