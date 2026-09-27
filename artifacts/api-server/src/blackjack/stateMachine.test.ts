import { describe, expect, it } from "vitest";
import {
  createEmptyBlackjackSeats,
  type BlackjackTable,
  type BlackjackTablePhase,
} from "./domain";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  assertBlackjackTablePhaseTransition,
  canTransitionBlackjackTablePhase,
  enterBlackjackRecovery,
  restoreBlackjackTableFromRecovery,
  transitionBlackjackTablePhase,
} from "./stateMachine";

function table(
  phase: BlackjackTablePhase = "TABLE_IDLE",
  stateVersion = 0,
): BlackjackTable {
  return {
    tableId: "main-blackjack",
    phase,
    maxSeats: 5,
    seats: createEmptyBlackjackSeats(),
    players: [],
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "state-machine-shoe",
      createdAtMs: 1,
    }),
    round: null,
    stateVersion,
    eventSequence: 0,
  };
}

describe("blackjack table state machine", () => {
  it("accepts the canonical normal round lifecycle", () => {
    const path: BlackjackTablePhase[] = [
      "TABLE_IDLE",
      "SHUFFLING",
      "BETTING",
      "BETTING_LOCKED",
      "INITIAL_DEAL",
      "PLAYER_TURNS",
      "DEALER_TURN",
      "SETTLEMENT",
      "ROUND_END",
      "SHUFFLING",
      "BETTING",
    ];

    for (let index = 0; index < path.length - 1; index += 1) {
      expect(canTransitionBlackjackTablePhase(path[index], path[index + 1])).toBe(
        true,
      );
    }
  });

  it("allows direct idle-to-betting and initial-deal-to-dealer shortcuts", () => {
    expect(canTransitionBlackjackTablePhase("TABLE_IDLE", "BETTING")).toBe(true);
    expect(
      canTransitionBlackjackTablePhase("INITIAL_DEAL", "DEALER_TURN"),
    ).toBe(true);
  });

  it("rejects illegal jumps, backwards transitions and same-phase duplicates", () => {
    const illegal: Array<[BlackjackTablePhase, BlackjackTablePhase]> = [
      ["BETTING", "DEALER_TURN"],
      ["PLAYER_TURNS", "BETTING"],
      ["SETTLEMENT", "PLAYER_TURNS"],
      ["BETTING", "BETTING"],
      ["ROUND_END", "DEALER_TURN"],
      ["BETTING", "RECOVERING"],
    ];

    for (const [from, to] of illegal) {
      expect(canTransitionBlackjackTablePhase(from, to)).toBe(false);
      expect(() => assertBlackjackTablePhaseTransition(from, to)).toThrow(
        /Illegal Blackjack table transition/,
      );
    }
  });

  it("advances stateVersion exactly once without mutating the source table", () => {
    const original = table("BETTING", 41);
    const next = transitionBlackjackTablePhase(original, "BETTING_LOCKED");

    expect(original.phase).toBe("BETTING");
    expect(original.stateVersion).toBe(41);
    expect(next.phase).toBe("BETTING_LOCKED");
    expect(next.stateVersion).toBe(42);
    expect(next.eventSequence).toBe(original.eventSequence);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("keeps recovery outside the normal transition graph", () => {
    const playing = table("PLAYER_TURNS", 10);
    const recovering = enterBlackjackRecovery(playing);

    expect(recovering.phase).toBe("RECOVERING");
    expect(recovering.stateVersion).toBe(11);
    expect(canTransitionBlackjackTablePhase("RECOVERING", "PLAYER_TURNS")).toBe(
      false,
    );

    const restored = restoreBlackjackTableFromRecovery(
      recovering,
      "PLAYER_TURNS",
    );

    expect(restored.phase).toBe("PLAYER_TURNS");
    expect(restored.stateVersion).toBe(12);
  });

  it("makes repeated recovery entry idempotent", () => {
    const recovering = enterBlackjackRecovery(table("DEALER_TURN", 5));

    expect(enterBlackjackRecovery(recovering)).toBe(recovering);
  });

  it("rejects recovery restore outside RECOVERING", () => {
    expect(() =>
      restoreBlackjackTableFromRecovery(table("BETTING"), "BETTING"),
    ).toThrow(/RECOVERING/);
  });

  it("refuses to overflow or accept corrupt state versions", () => {
    expect(() =>
      transitionBlackjackTablePhase(
        table("BETTING", Number.MAX_SAFE_INTEGER),
        "BETTING_LOCKED",
      ),
    ).toThrow(/stateVersion/);

    expect(() =>
      transitionBlackjackTablePhase(table("BETTING", -1), "BETTING_LOCKED"),
    ).toThrow(/stateVersion/);
  });
});
