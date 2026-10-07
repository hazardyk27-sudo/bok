import {
  clearRouletteAuthoritativeDragPlacements,
  getRouletteAuthoritativeDragPlacements,
  setRouletteAuthoritativeDragPlacements,
  type RouletteBetPlacement,
} from "./betState";

let authorityRoundId: string | null = null;
let authorityRevision = 0;
let authorityOptimistic = false;

export function getRouletteBetAuthoritySnapshot() {
  return {
    roundId: authorityRoundId,
    bets: getRouletteAuthoritativeDragPlacements(),
    revision: authorityRevision,
    optimistic: authorityOptimistic,
  };
}

export function clearRouletteBetAuthority() {
  authorityRoundId = null;
  authorityRevision = 0;
  authorityOptimistic = false;
  clearRouletteAuthoritativeDragPlacements();
}

export function setRouletteBetAuthority(
  roundId: string,
  bets: readonly RouletteBetPlacement[],
  revision: number,
  optimistic: boolean,
) {
  authorityRoundId = roundId;
  authorityRevision = Math.max(0, revision);
  authorityOptimistic = optimistic;
  setRouletteAuthoritativeDragPlacements(bets);
}
