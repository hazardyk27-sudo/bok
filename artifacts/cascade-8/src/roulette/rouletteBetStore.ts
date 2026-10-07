import type {
  RouletteBetPlacement,
  RouletteChipValue,
} from "./betState";

export type RouletteBetStoreSnapshot = {
  roundId: string | null;
  selectedChip: RouletteChipValue;
  placements: RouletteBetPlacement[];
  previousRoundPlacements: RouletteBetPlacement[];
  confirmedRevision: number;
  optimistic: boolean;
  mutationVersion: number;
};

type RouletteBetStoreListener = (
  snapshot: RouletteBetStoreSnapshot,
) => void;

function clonePlacements(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.map((placement) => ({
    ...placement,
  }));
}

function totalStake(
  placements: readonly RouletteBetPlacement[],
) {
  return placements.reduce(
    (sum, placement) => sum + placement.amount,
    0,
  );
}

function assertValidPlacements(
  placements: readonly RouletteBetPlacement[],
) {
  for (const placement of placements) {
    if (
      !placement.betId ||
      !Number.isSafeInteger(placement.amount) ||
      placement.amount <= 0
    ) {
      throw new Error("INVALID_ROULETTE_BET_AMOUNT");
    }
  }
}

export class RouletteBetStore {
  private roundId: string | null = null;
  private selectedChip: RouletteChipValue = 10;
  private placements: RouletteBetPlacement[] = [];
  private previousRoundPlacements: RouletteBetPlacement[] = [];
  private confirmedRevision = 0;
  private optimistic = false;
  private mutationVersion = 0;
  private readonly listeners = new Set<RouletteBetStoreListener>();

  getSnapshot(): RouletteBetStoreSnapshot {
    return {
      roundId: this.roundId,
      selectedChip: this.selectedChip,
      placements: clonePlacements(this.placements),
      previousRoundPlacements: clonePlacements(this.previousRoundPlacements),
      confirmedRevision: this.confirmedRevision,
      optimistic: this.optimistic,
      mutationVersion: this.mutationVersion,
    };
  }

  subscribe(listener: RouletteBetStoreListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private applyLocalPlacements(
    placements: readonly RouletteBetPlacement[],
  ) {
    assertValidPlacements(placements);
    this.placements = clonePlacements(placements);
    this.optimistic = true;
    this.mutationVersion += 1;
    this.emit();
  }

  selectChip(chip: RouletteChipValue) {
    if (!Number.isFinite(chip) || chip <= 0) return;
    this.selectedChip = chip;
    this.emit();
  }

  beginRound(
    roundId: string,
    placements: readonly RouletteBetPlacement[],
    revision: number,
  ) {
    if (!roundId) {
      throw new Error("ROULETTE_ROUND_ID_REQUIRED");
    }
    assertValidPlacements(placements);
    this.roundId = roundId;
    this.placements = clonePlacements(placements);
    this.confirmedRevision = Math.max(0, Math.trunc(revision));
    this.optimistic = false;
    this.emit();
  }

  applyServerSnapshot(
    roundId: string,
    placements: readonly RouletteBetPlacement[],
    revision: number,
  ) {
    if (!roundId) return false;
    assertValidPlacements(placements);
    const safeRevision = Math.max(0, Math.trunc(revision));

    if (this.roundId !== roundId) {
      this.beginRound(roundId, placements, safeRevision);
      return true;
    }

    if (safeRevision < this.confirmedRevision) {
      return false;
    }

    if (
      this.optimistic &&
      safeRevision <= this.confirmedRevision
    ) {
      return false;
    }

    this.placements = clonePlacements(placements);
    this.confirmedRevision = safeRevision;
    this.optimistic = false;
    this.emit();
    return true;
  }

  confirmServerSnapshot(
    roundId: string,
    placements: readonly RouletteBetPlacement[],
    revision: number,
  ) {
    if (this.roundId !== roundId) return false;
    assertValidPlacements(placements);
    const safeRevision = Math.max(0, Math.trunc(revision));
    if (safeRevision < this.confirmedRevision) {
      return false;
    }
    this.placements = clonePlacements(placements);
    this.confirmedRevision = safeRevision;
    this.optimistic = false;
    this.emit();
    return true;
  }

  place(betId: string, amount = this.selectedChip) {
    if (!betId || !Number.isSafeInteger(amount) || amount <= 0) {
      return false;
    }
    this.applyLocalPlacements([
      ...this.placements,
      { betId, amount },
    ]);
    return true;
  }

  move(fromBetId: string, toBetId: string) {
    if (
      !fromBetId ||
      !toBetId ||
      fromBetId === toBetId ||
      !this.placements.some((placement) => placement.betId === fromBetId)
    ) {
      return false;
    }

    const beforeStake = totalStake(this.placements);
    const moved = this.placements.map((placement) => ({
      ...placement,
      betId:
        placement.betId === fromBetId
          ? toBetId
          : placement.betId,
    }));

    if (totalStake(moved) !== beforeStake) {
      throw new Error("ROULETTE_DRAG_STAKE_MISMATCH");
    }

    this.applyLocalPlacements(moved);
    return true;
  }

  double() {
    if (this.placements.length === 0) return false;
    const doubled = this.placements.map((placement) => ({
      ...placement,
      amount: placement.amount * 2,
    }));
    this.applyLocalPlacements(doubled);
    return true;
  }

  undo() {
    if (this.placements.length === 0) return false;
    this.applyLocalPlacements(this.placements.slice(0, -1));
    return true;
  }

  clear() {
    if (this.placements.length === 0) return false;
    this.placements = [];
    this.optimistic = true;
    this.mutationVersion += 1;
    this.emit();
    return true;
  }

  commitRoundSnapshot() {
    this.previousRoundPlacements = clonePlacements(this.placements);
    this.emit();
  }

  rebet() {
    if (this.previousRoundPlacements.length === 0) return false;
    this.applyLocalPlacements(this.previousRoundPlacements);
    return true;
  }

  replaceLocalPlacements(
    placements: readonly RouletteBetPlacement[],
  ) {
    this.applyLocalPlacements(placements);
  }

  resetCurrentRound() {
    this.roundId = null;
    this.placements = [];
    this.confirmedRevision = 0;
    this.optimistic = false;
    this.mutationVersion = 0;
    this.emit();
  }

  resetAll() {
    this.roundId = null;
    this.selectedChip = 10;
    this.placements = [];
    this.previousRoundPlacements = [];
    this.confirmedRevision = 0;
    this.optimistic = false;
    this.mutationVersion = 0;
    this.emit();
  }
}

export const rouletteBetStore = new RouletteBetStore();
