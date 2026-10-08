import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
} from "./betState";
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

  void promise.finally(() => {
    if (pendingLatestMutation === record) {
      pendingLatestMutation = null;
    }
  }).catch(() => {
    // The caller owns the request error. This chain only clears the dedupe slot.
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
