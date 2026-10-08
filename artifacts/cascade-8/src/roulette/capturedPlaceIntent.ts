import type { RouletteBetPlacement } from "./betState";

type CapturedPlaceIntent = {
  token: number;
  betId: string;
  plan: RouletteBetPlacement[];
};

let sequence = 0;
let pending: CapturedPlaceIntent | null = null;

function cloneBets(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({ ...bet }));
}

export function registerRouletteCapturedPlaceIntent(
  betId: string,
  plan: readonly RouletteBetPlacement[],
) {
  const token = ++sequence;
  pending = {
    token,
    betId,
    plan: cloneBets(plan),
  };

  // A captured intent belongs only to the current DOM event task. If the
  // runtime bubble handler does not consume it, never let a later click reuse it.
  queueMicrotask(() => {
    if (pending?.token === token) {
      pending = null;
    }
  });
}

export function consumeRouletteCapturedPlaceIntent(
  betId: string,
) {
  const intent = pending;
  if (!intent || intent.betId !== betId) {
    return null;
  }

  pending = null;
  return cloneBets(intent.plan);
}

export function clearRouletteCapturedPlaceIntentForTests() {
  pending = null;
}
