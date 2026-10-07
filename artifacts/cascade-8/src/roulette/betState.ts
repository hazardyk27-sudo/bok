export const ROULETTE_CHIP_VALUES: readonly number[] = [
  10,
  50,
  100,
  500,
  2_000,
  5_000,
];

export type RouletteChipValue = number;

export type RouletteBetPlacement = {
  betId: string;
  amount: number;
};

export type RouletteBetState = {
  selectedChip: RouletteChipValue;
  placements: RouletteBetPlacement[];
  previousRoundPlacements: RouletteBetPlacement[];
};

// Transitional compatibility name kept for old tests/imports. This is now the
// one shared local wager topology used by every reducer, not a drag-only cache.
let authoritativePlacements: RouletteBetPlacement[] | null = null;

function cloneRoulettePlacements(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.map((placement) => ({
    ...placement,
  }));
}

function getRouletteEffectivePlacements(
  state: RouletteBetState,
) {
  return authoritativePlacements ?? state.placements;
}

function withAuthoritativePlacements(
  state: RouletteBetState,
  placements: readonly RouletteBetPlacement[],
): RouletteBetState {
  const canonical = cloneRoulettePlacements(placements);
  authoritativePlacements = cloneRoulettePlacements(canonical);
  return {
    ...state,
    placements: canonical,
  };
}

export function setRouletteAuthoritativeDragPlacements(
  placements: readonly RouletteBetPlacement[],
) {
  authoritativePlacements = cloneRoulettePlacements(placements);
}

export function getRouletteAuthoritativeDragPlacements() {
  return authoritativePlacements
    ? cloneRoulettePlacements(authoritativePlacements)
    : null;
}

export function clearRouletteAuthoritativeDragPlacements() {
  authoritativePlacements = null;
}

export function createRouletteBetState(): RouletteBetState {
  // A new runtime/test state is a new local authority boundary. Server
  // bootstrap will hydrate it immediately after mount; stale placements from a
  // prior mount/test must never leak into the new state.
  authoritativePlacements = null;
  return {
    selectedChip: 10,
    placements: [],
    previousRoundPlacements: [],
  };
}

export function selectRouletteChip(
  state: RouletteBetState,
  chip: RouletteChipValue,
): RouletteBetState {
  return {
    ...state,
    selectedChip: chip,
  };
}

export function placeRouletteBet(
  state: RouletteBetState,
  betId: string,
): RouletteBetState {
  if (!betId) return state;

  const placements = getRouletteEffectivePlacements(state);
  return withAuthoritativePlacements(state, [
    ...cloneRoulettePlacements(placements),
    {
      betId,
      amount: state.selectedChip,
    },
  ]);
}

export function moveRouletteBetPlacements(
  placements: readonly RouletteBetPlacement[],
  fromBetId: string,
  toBetId: string,
): RouletteBetPlacement[] {
  if (
    !fromBetId ||
    !toBetId ||
    fromBetId === toBetId
  ) {
    return cloneRoulettePlacements(placements);
  }

  return placements.map((placement) => ({
    ...placement,
    betId:
      placement.betId === fromBetId
        ? toBetId
        : placement.betId,
  }));
}

export function undoRouletteBet(
  state: RouletteBetState,
): RouletteBetState {
  const placements = getRouletteEffectivePlacements(state);
  return withAuthoritativePlacements(
    state,
    placements.length === 0
      ? []
      : placements.slice(0, -1),
  );
}

export function clearRouletteBets(
  state: RouletteBetState,
): RouletteBetState {
  return withAuthoritativePlacements(state, []);
}

export function doubleRouletteBets(
  state: RouletteBetState,
): RouletteBetState {
  const placements = getRouletteEffectivePlacements(state);
  if (placements.length === 0) {
    return withAuthoritativePlacements(state, []);
  }

  return withAuthoritativePlacements(
    state,
    placements.map((placement) => ({
      ...placement,
      amount: placement.amount * 2,
    })),
  );
}

export function snapshotRouletteRound(
  state: RouletteBetState,
): RouletteBetState {
  const canonicalPlacements = cloneRoulettePlacements(
    getRouletteEffectivePlacements(state),
  );
  authoritativePlacements = cloneRoulettePlacements(canonicalPlacements);

  return {
    ...state,
    placements: cloneRoulettePlacements(canonicalPlacements),
    previousRoundPlacements: cloneRoulettePlacements(canonicalPlacements),
  };
}

export function rebetRouletteRound(
  state: RouletteBetState,
): RouletteBetState {
  if (state.previousRoundPlacements.length === 0) {
    return state;
  }

  return withAuthoritativePlacements(
    state,
    state.previousRoundPlacements,
  );
}

export function getRouletteBetTotals(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce<Record<string, number>>(
    (totals, placement) => {
      totals[placement.betId] =
        (totals[placement.betId] ?? 0) + placement.amount;
      return totals;
    },
    {},
  );
}

export function expandRouletteBetPlacementsToChipValues(
  placements: readonly RouletteBetPlacement[],
): RouletteBetPlacement[] {
  const denominations = [
    5_000,
    2_000,
    500,
    100,
    50,
    25,
    10,
    5,
    1,
  ] as const;

  return placements.flatMap((placement) => {
    if (
      !Number.isSafeInteger(placement.amount) ||
      placement.amount <= 0
    ) {
      throw new Error("INVALID_ROULETTE_BET_AMOUNT");
    }

    let remaining = placement.amount;
    const expanded: RouletteBetPlacement[] = [];

    for (const chip of denominations) {
      const count = Math.floor(remaining / chip);
      for (let index = 0; index < count; index += 1) {
        expanded.push({
          betId: placement.betId,
          amount: chip,
        });
      }
      remaining -= count * chip;
    }

    if (remaining !== 0) {
      throw new Error("INVALID_ROULETTE_BET_AMOUNT");
    }

    return expanded;
  });
}

export function compactRouletteBetPlacements(
  placements: readonly RouletteBetPlacement[],
): RouletteBetPlacement[] {
  const totals = getRouletteBetTotals(placements);
  const seen = new Set<string>();

  return placements.flatMap((placement) => {
    if (seen.has(placement.betId)) {
      return [];
    }

    seen.add(placement.betId);
    const amount = totals[placement.betId] ?? 0;

    return amount > 0
      ? [{
          betId: placement.betId,
          amount,
        }]
      : [];
  });
}

/**
 * Compatibility bridge for the legacy runtime's `chip-*` classes.
 *
 * The keys here are NOT wager denominations anymore; they are palette slots in
 * the old renderer. Keep this mapping identical to `getRouletteChipTier()` so
 * the legacy fallback can never disagree with the canonical aggregate face:
 * white -> 1, blue -> 10, green -> 25, red -> 5, black -> 100, purple -> 500.
 * The canonical renderer strips these classes entirely; this bridge exists only
 * as a fail-safe until the old runtime markup is fully removed.
 */
export function getRouletteDisplayChipValue(
  amount: number,
): RouletteChipValue {
  if (amount >= 5_000) return 500;
  if (amount >= 2_000) return 100;
  if (amount >= 500) return 5;
  if (amount >= 100) return 25;
  if (amount >= 50) return 10;
  return 1;
}

export function getRouletteLastChipByBet(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce<Record<string, number>>(
    (lastByBet, placement) => {
      lastByBet[placement.betId] = placement.amount;
      return lastByBet;
    },
    {},
  );
}

export function getRouletteTotalStake(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce(
    (total, placement) => total + placement.amount,
    0,
  );
}

export function isRouletteChipValue(
  value: number,
): value is RouletteChipValue {
  return ROULETTE_CHIP_VALUES.includes(value);
}
