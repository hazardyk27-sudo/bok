export const ROULETTE_CHIP_VALUES = [
  1,
  5,
  10,
  25,
  100,
  500,
] as const;

export type RouletteChipValue =
  (typeof ROULETTE_CHIP_VALUES)[number];

export type RouletteBetPlacement = {
  betId: string;
  amount: RouletteChipValue;
};

export type RouletteBetState = {
  selectedChip: RouletteChipValue;
  placements: RouletteBetPlacement[];
  previousRoundPlacements: RouletteBetPlacement[];
};

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
  if (
    state.placements.length === 0 ||
    state.placements.length > 250
  ) {
    return state;
  }

  return {
    ...state,
    placements: [
      ...state.placements,
      ...state.placements.map((placement) => ({
        ...placement,
      })),
    ],
  };
}

export function snapshotRouletteRound(
  state: RouletteBetState,
): RouletteBetState {
  return {
    ...state,
    previousRoundPlacements:
      state.placements.map((placement) => ({
        ...placement,
      })),
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

export function getRouletteLastChipByBet(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce<
    Record<string, RouletteChipValue>
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
  return (
    ROULETTE_CHIP_VALUES as readonly number[]
  ).includes(value);
}
