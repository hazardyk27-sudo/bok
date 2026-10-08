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

  // The runtime bubble handler must consume this in the same DOM event task.
  // Keep a macrotask safety cleanup so an interrupted event can never leak into
  // a later click, while still allowing capture code to verify consumption in a
  // microtask after bubbling has finished.
  window.setTimeout(() => {
    if (pending?.token === token) {
      pending = null;
    }
  }, 0);

  return token;
}

export function isRouletteCapturedPlaceIntentPending(
  token: number,
) {
  return pending?.token === token;
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
