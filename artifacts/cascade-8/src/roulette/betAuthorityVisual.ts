import {
  clearRouletteAuthoritativeDragPlacements,
  setRouletteAuthoritativeDragPlacements,
  type RouletteBetPlacement,
} from "./betState";
import { cloneRouletteAuthorityBets } from "./betAuthorityState";

let authorityRoundId: string | null = null;
let authorityBets: RouletteBetPlacement[] | null = null;
let authorityRevision = 0;
let authorityOptimistic = false;

export function getRouletteBetAuthoritySnapshot() {
  return {
    roundId: authorityRoundId,
    bets: authorityBets
      ? cloneRouletteAuthorityBets(authorityBets)
      : null,
    revision: authorityRevision,
    optimistic: authorityOptimistic,
  };
}

export function clearRouletteBetAuthority() {
  authorityRoundId = null;
  authorityBets = null;
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
  authorityBets = cloneRouletteAuthorityBets(bets);
  authorityRevision = Math.max(0, revision);
  authorityOptimistic = optimistic;
  setRouletteAuthoritativeDragPlacements(authorityBets);
}
