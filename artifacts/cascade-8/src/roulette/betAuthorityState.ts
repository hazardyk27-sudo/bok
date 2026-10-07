import type { RouletteBetPlacement } from "./betState";

export type RouletteAuthorityIntent =
  | { kind: "place"; betId: string; amount: number }
  | { kind: "double" }
  | { kind: "undo" }
  | { kind: "clear" }
  | { kind: "rebet" }
  | { kind: "unknown" };

export function cloneRouletteAuthorityBets(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({ ...bet }));
}

export function getRouletteAuthorityStake(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.reduce((sum, bet) => sum + bet.amount, 0);
}

export function resolveRouletteAuthorityMutation(
  current: readonly RouletteBetPlacement[],
  incoming: readonly RouletteBetPlacement[],
  intent: RouletteAuthorityIntent,
): RouletteBetPlacement[] {
  switch (intent.kind) {
    case "place":
      return [
        ...cloneRouletteAuthorityBets(current),
        { betId: intent.betId, amount: intent.amount },
      ];
    case "double":
      return current.map((bet) => ({
        ...bet,
        amount: bet.amount * 2,
      }));
    case "undo":
      return current.length > 0
        ? cloneRouletteAuthorityBets(current.slice(0, -1))
        : [];
    case "clear":
      return [];
    case "rebet":
    case "unknown":
      return cloneRouletteAuthorityBets(incoming);
  }
}

export function resolveRouletteDragMutation(
  current: readonly RouletteBetPlacement[],
  incoming: readonly RouletteBetPlacement[],
) {
  if (
    current.length > 0 &&
    Math.abs(
      getRouletteAuthorityStake(current) -
        getRouletteAuthorityStake(incoming),
    ) > 1e-9
  ) {
    throw new Error("ROULETTE_DRAG_STAKE_MISMATCH");
  }

  return cloneRouletteAuthorityBets(incoming);
}
