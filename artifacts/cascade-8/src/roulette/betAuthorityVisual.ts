import type {
  RouletteBetPlacement,
} from "./betState";
import {
  clearRouletteAuthorityStore,
  getRouletteAuthorityStoreSnapshot,
  setRouletteAuthorityStore,
} from "./betAuthorityStore";

export function getRouletteBetAuthoritySnapshot() {
  const snapshot =
    getRouletteAuthorityStoreSnapshot();

  return {
    roundId: snapshot.roundId,
    bets: snapshot.bets as RouletteBetPlacement[] | null,
    revision: snapshot.revision,
    optimistic: snapshot.optimistic,
  };
}

export function clearRouletteBetAuthority() {
  clearRouletteAuthorityStore();
}

export function setRouletteBetAuthority(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
  revision: number,
  optimistic: boolean,
) {
  setRouletteAuthorityStore(
    roundId,
    bets,
    revision,
    optimistic,
  );
}
