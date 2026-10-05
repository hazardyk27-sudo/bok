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

let authoritativeDragPlacements: RouletteBetPlacement[] | null = null;

function cloneRoulettePlacements(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.map((placement) => ({
    ...placement,
  }));
}

export function setRouletteAuthoritativeDragPlacements(
  placements: readonly RouletteBetPlacement[],
) {
  authoritativeDragPlacements =
    cloneRoulettePlacements(placements);
}

export function getRouletteAuthoritativeDragPlacements() {
  return authoritativeDragPlacements
    ? cloneRoulettePlacements(
        authoritativeDragPlacements,
      )
    : null;
}

export function clearRouletteAuthoritativeDragPlacements() {
  authoritativeDragPlacements = null;
}

export function createRouletteBetState(): RouletteBetState {
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

  return {
    ...state,
    placements: [
      ...state.placements,
      {
        betId,
        amount: state.selectedChip,
      },
    ],
  };
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
    return placements.map((placement) => ({
      ...placement,
    }));
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
  if (state.placements.length === 0) {
    return state;
  }

  return {
    ...state,
    placements: state.placements.slice(0, -1),
  };
}

export function clearRouletteBets(
  state: RouletteBetState,
): RouletteBetState {
  if (state.placements.length === 0) {
    return state;
  }

  return {
    ...state,
    placements: [],
  };
}

export function doubleRouletteBets(
  state: RouletteBetState,
): RouletteBetState {
  if (state.placements.length === 0) {
    return state;
  }

  return {
    ...state,
    placements:
      state.placements.map(
        (placement) => ({
          ...placement,
          amount:
            placement.amount * 2,
        }),
      ),
  };
}

export function snapshotRouletteRound(
  state: RouletteBetState,
): RouletteBetState {
  const placements =
    authoritativeDragPlacements ??
    state.placements;

  const canonicalPlacements =
    cloneRoulettePlacements(
      placements,
    );

  return {
    ...state,
    placements:
      cloneRoulettePlacements(
        canonicalPlacements,
      ),
    previousRoundPlacements:
      cloneRoulettePlacements(
        canonicalPlacements,
      ),
  };
}

export function rebetRouletteRound(
  state: RouletteBetState,
): RouletteBetState {
  if (
    state.previousRoundPlacements.length === 0
  ) {
    return state;
  }

  return {
    ...state,
    placements:
      state.previousRoundPlacements.map(
        (placement) => ({
          ...placement,
        }),
      ),
  };
}

export function getRouletteBetTotals(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce<Record<string, number>>(
    (totals, placement) => {
      totals[placement.betId] =
        (totals[placement.betId] ?? 0) +
        placement.amount;
      return totals;
    },
    {},
  );
}

export function expandRouletteBetPlacementsToChipValues(
  placements: readonly RouletteBetPlacement[],
): RouletteBetPlacement[] {
  // New UI denominations come first. 25/5/1 remain replay-only so a wager
  // created immediately before this rollout can still be reconstructed.
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
      !Number.isSafeInteger(
        placement.amount,
      ) ||
      placement.amount <= 0
    ) {
      throw new Error(
        "INVALID_ROULETTE_BET_AMOUNT",
      );
    }

    let remaining =
      placement.amount;
    const expanded:
      RouletteBetPlacement[] = [];

    for (const chip of denominations) {
      const count =
        Math.floor(
          remaining / chip,
        );

      for (
        let index = 0;
        index < count;
        index += 1
      ) {
        expanded.push({
          betId:
            placement.betId,
          amount: chip,
        });
      }

      remaining -=
        count * chip;
    }

    if (remaining !== 0) {
      throw new Error(
        "INVALID_ROULETTE_BET_AMOUNT",
      );
    }

    return expanded;
  });
}

export function compactRouletteBetPlacements(
  placements: readonly RouletteBetPlacement[],
): RouletteBetPlacement[] {
  const totals =
    getRouletteBetTotals(placements);
  const seen = new Set<string>();

  return placements.flatMap((placement) => {
    if (seen.has(placement.betId)) {
      return [];
    }

    seen.add(placement.betId);
    const amount =
      totals[placement.betId] ?? 0;

    return amount > 0
      ? [{
          betId: placement.betId,
          amount,
        }]
      : [];
  });
}

// Kept for the legacy placed-chip runtime palette. The Part 3 visual layer
// recolors the final chip by total wager range, so this remains replay-safe.
export function getRouletteDisplayChipValue(
  amount: number,
): RouletteChipValue {
  if (amount >= 500) return 500;
  if (amount >= 100) return 100;
  if (amount >= 25) return 25;
  if (amount >= 10) return 10;
  if (amount >= 5) return 5;
  return 1;
}

export function getRouletteLastChipByBet(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce<
    Record<string, number>
  >((lastByBet, placement) => {
    lastByBet[placement.betId] =
      placement.amount;
    return lastByBet;
  }, {});
}

export function getRouletteTotalStake(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce(
    (total, placement) =>
      total + placement.amount,
    0,
  );
}

export function isRouletteChipValue(
  value: number,
): value is RouletteChipValue {
  return ROULETTE_CHIP_VALUES.includes(value);
}
