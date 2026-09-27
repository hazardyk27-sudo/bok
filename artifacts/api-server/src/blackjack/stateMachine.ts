import type {
  BlackjackTable,
  BlackjackTablePhase,
} from "./domain";

const NORMAL_TRANSITIONS: Record<
  BlackjackTablePhase,
  readonly BlackjackTablePhase[]
> = {
  TABLE_IDLE: ["SHUFFLING", "BETTING"],
  SHUFFLING: ["BETTING"],
  BETTING: ["BETTING_LOCKED"],
  BETTING_LOCKED: ["INITIAL_DEAL"],
  INITIAL_DEAL: ["PLAYER_TURNS", "DEALER_TURN"],
  PLAYER_TURNS: ["DEALER_TURN"],
  DEALER_TURN: ["SETTLEMENT"],
  SETTLEMENT: ["ROUND_END"],
  ROUND_END: ["BETTING", "SHUFFLING"],
  RECOVERING: [],
};

function assertStateVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new RangeError(
      "Blackjack stateVersion must be a non-negative safe integer",
    );
  }
  if (version >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError("Blackjack stateVersion cannot advance safely");
  }
}

export function canTransitionBlackjackTablePhase(
  from: BlackjackTablePhase,
  to: BlackjackTablePhase,
): boolean {
  if (from === to) return false;
  return NORMAL_TRANSITIONS[from].includes(to);
}

export function assertBlackjackTablePhaseTransition(
  from: BlackjackTablePhase,
  to: BlackjackTablePhase,
): void {
  if (!canTransitionBlackjackTablePhase(from, to)) {
    throw new Error(`Illegal Blackjack table transition: ${from} -> ${to}`);
  }
}

export function transitionBlackjackTablePhase(
  table: BlackjackTable,
  to: BlackjackTablePhase,
): BlackjackTable {
  assertStateVersion(table.stateVersion);
  assertBlackjackTablePhaseTransition(table.phase, to);

  return Object.freeze({
    ...table,
    phase: to,
    stateVersion: table.stateVersion + 1,
  });
}

export function enterBlackjackRecovery(
  table: BlackjackTable,
): BlackjackTable {
  if (table.phase === "RECOVERING") return table;

  assertStateVersion(table.stateVersion);

  return Object.freeze({
    ...table,
    phase: "RECOVERING" as const,
    stateVersion: table.stateVersion + 1,
  });
}

export function restoreBlackjackTableFromRecovery(
  table: BlackjackTable,
  restoredPhase: Exclude<BlackjackTablePhase, "RECOVERING">,
): BlackjackTable {
  if (table.phase !== "RECOVERING") {
    throw new Error(
      "Blackjack recovery restore requires the table to be RECOVERING",
    );
  }

  assertStateVersion(table.stateVersion);

  return Object.freeze({
    ...table,
    phase: restoredPhase,
    stateVersion: table.stateVersion + 1,
  });
}
