import {
  getRouletteBetTotals,
  getRouletteTotalStake,
  moveRouletteBetPlacements,
  type RouletteBetPlacement,
  type RouletteChipValue,
} from "./betState";

export type RouletteBetStoreState = {
  roundId: string | null;
  selectedChip: RouletteChipValue;
  placements: RouletteBetPlacement[];
  previousRoundPlacements: RouletteBetPlacement[];
  confirmedRevision: number;
  optimisticVersion: number;
};

export type RouletteServerBetState = {
  roundId: string;
  revision: number;
  placements: readonly RouletteBetPlacement[];
};

function clonePlacements(
  placements: readonly RouletteBetPlacement[],
): RouletteBetPlacement[] {
  return placements.map((placement) => ({ ...placement }));
}

export function createRouletteBetStoreState(): RouletteBetStoreState {
  return {
    roundId: null,
    selectedChip: 10,
    placements: [],
    previousRoundPlacements: [],
    confirmedRevision: 0,
    optimisticVersion: 0,
  };
}

export function rouletteStoreSelectChip(
  state: RouletteBetStoreState,
  chip: RouletteChipValue,
): RouletteBetStoreState {
  return { ...state, selectedChip: chip };
}

function withMutation(
  state: RouletteBetStoreState,
  placements: readonly RouletteBetPlacement[],
): RouletteBetStoreState {
  return {
    ...state,
    placements: clonePlacements(placements),
    optimisticVersion: state.optimisticVersion + 1,
  };
}

export function rouletteStorePlace(
  state: RouletteBetStoreState,
  betId: string,
): RouletteBetStoreState {
  if (!betId) return state;
  return withMutation(state, [
    ...state.placements,
    { betId, amount: state.selectedChip },
  ]);
}

export function rouletteStoreMove(
  state: RouletteBetStoreState,
  fromBetId: string,
  toBetId: string,
): RouletteBetStoreState {
  if (!fromBetId || !toBetId || fromBetId === toBetId) return state;

  const beforeStake = getRouletteTotalStake(state.placements);
  const moved = moveRouletteBetPlacements(
    state.placements,
    fromBetId,
    toBetId,
  );

  if (getRouletteTotalStake(moved) !== beforeStake) {
    throw new Error("ROULETTE_MOVE_STAKE_CHANGED");
  }

  return withMutation(state, moved);
}

export function rouletteStoreDouble(
  state: RouletteBetStoreState,
): RouletteBetStoreState {
  if (state.placements.length === 0) return state;
  return withMutation(
    state,
    state.placements.map((placement) => ({
      ...placement,
      amount: placement.amount * 2,
    })),
  );
}

export function rouletteStoreUndo(
  state: RouletteBetStoreState,
): RouletteBetStoreState {
  if (state.placements.length === 0) return state;
  return withMutation(state, state.placements.slice(0, -1));
}

export function rouletteStoreClear(
  state: RouletteBetStoreState,
): RouletteBetStoreState {
  if (state.placements.length === 0) return state;
  return withMutation(state, []);
}

export function rouletteStoreSnapshotRound(
  state: RouletteBetStoreState,
): RouletteBetStoreState {
  return {
    ...state,
    previousRoundPlacements: clonePlacements(state.placements),
  };
}

export function rouletteStoreRebet(
  state: RouletteBetStoreState,
): RouletteBetStoreState {
  if (state.previousRoundPlacements.length === 0) return state;
  return withMutation(state, state.previousRoundPlacements);
}

export function rouletteStoreBeginRound(
  state: RouletteBetStoreState,
  roundId: string,
): RouletteBetStoreState {
  if (state.roundId === roundId) return state;
  return {
    ...state,
    roundId,
    placements: [],
    confirmedRevision: 0,
    optimisticVersion: 0,
  };
}

export function shouldAcceptRouletteServerBet(
  state: RouletteBetStoreState,
  server: RouletteServerBetState,
) {
  if (state.roundId !== server.roundId) return true;
  return server.revision >= state.confirmedRevision;
}

export function rouletteStoreAcceptServerBet(
  state: RouletteBetStoreState,
  server: RouletteServerBetState,
): RouletteBetStoreState {
  if (!shouldAcceptRouletteServerBet(state, server)) return state;

  return {
    ...state,
    roundId: server.roundId,
    placements: clonePlacements(server.placements),
    confirmedRevision: server.revision,
  };
}

export function rouletteStoreConfirmWrite(
  state: RouletteBetStoreState,
  server: RouletteServerBetState,
): RouletteBetStoreState {
  if (state.roundId !== null && state.roundId !== server.roundId) {
    return state;
  }

  if (server.revision < state.confirmedRevision) {
    return state;
  }

  return {
    ...state,
    roundId: server.roundId,
    placements: clonePlacements(server.placements),
    confirmedRevision: server.revision,
  };
}

export function getRouletteStoreTotals(state: RouletteBetStoreState) {
  return getRouletteBetTotals(state.placements);
}
