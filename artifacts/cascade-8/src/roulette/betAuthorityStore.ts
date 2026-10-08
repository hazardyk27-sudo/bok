export type RouletteAuthorityPlacement = {
  betId: string;
  amount: number;
};

export type RouletteAuthorityStoreSnapshot = {
  roundId: string | null;
  bets: RouletteAuthorityPlacement[] | null;
  revision: number;
  optimistic: boolean;
};

let authorityStore: RouletteAuthorityStoreSnapshot = {
  roundId: null,
  bets: null,
  revision: 0,
  optimistic: false,
};

function cloneBets(
  bets: readonly RouletteAuthorityPlacement[] | null,
) {
  return bets
    ? bets.map((bet) => ({ ...bet }))
    : null;
}

export function getRouletteAuthorityStoreSnapshot(): RouletteAuthorityStoreSnapshot {
  return {
    ...authorityStore,
    bets: cloneBets(authorityStore.bets),
  };
}

export function getRouletteAuthorityStoreBets() {
  return cloneBets(authorityStore.bets);
}

export function setRouletteAuthorityStore(
  roundId: string,
  bets: readonly RouletteAuthorityPlacement[],
  revision: number,
  optimistic: boolean,
) {
  authorityStore = {
    roundId,
    bets: cloneBets(bets),
    revision: Math.max(0, revision),
    optimistic,
  };
}

export function setRouletteAuthorityStoreBets(
  bets: readonly RouletteAuthorityPlacement[],
) {
  authorityStore = {
    ...authorityStore,
    bets: cloneBets(bets),
  };
}

export function clearRouletteAuthorityStore() {
  authorityStore = {
    roundId: null,
    bets: null,
    revision: 0,
    optimistic: false,
  };
}
