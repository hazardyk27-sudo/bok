import { describe, expect, it, vi } from "vitest";
import type { BlackjackTable } from "./domain";
import {
  BlackjackStaleActionError,
  applyBlackjackVersionedAction,
  createBlackjackActionProtocolState,
  type BlackjackActionEnvelope,
} from "./actionProtocol";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function table(): BlackjackTable {
  return createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "protocol-shoe",
      createdAtMs: 1,
    }),
  });
}

function envelope(
  overrides: Partial<BlackjackActionEnvelope> = {},
): BlackjackActionEnvelope {
  return {
    actionId: "action-1",
    type: "LEAVE_SEAT",
    tableId: "main-blackjack",
    expectedStateVersion: 0,
    roundId: null,
    handId: null,
    seatNumber: 1,
    payloadFingerprint: "leave-seat:v1",
    ...overrides,
  };
}

describe("blackjack action stateVersion protocol", () => {
  it("commits a successful mutation with exactly one stateVersion increment", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    const result = applyBlackjackVersionedAction(
      source,
      protocol,
      envelope(),
      (current) => ({
        ...current,
        phase: "BETTING",
      }),
    );

    expect(source.stateVersion).toBe(0);
    expect(result.table.stateVersion).toBe(1);
    expect(result.table.phase).toBe("BETTING");
    expect(result.receipt).toMatchObject({
      actionId: "action-1",
      expectedStateVersion: 0,
      resultingStateVersion: 1,
    });
    expect(result.protocol.receipts).toHaveLength(1);
    expect(result.replayed).toBe(false);
  });

  it("rejects stale state before the mutation executes", () => {
    const source = {
      ...table(),
      stateVersion: 4,
    };
    const mutate = vi.fn((current: BlackjackTable) => current);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        createBlackjackActionProtocolState(),
        envelope({ expectedStateVersion: 3 }),
        mutate,
      ),
    ).toThrow(BlackjackStaleActionError);

    expect(mutate).not.toHaveBeenCalled();
  });

  it("replays the same actionId without executing the mutation twice", () => {
    const mutate = vi.fn((current: BlackjackTable) => ({
      ...current,
      phase: "BETTING" as const,
    }));

    const first = applyBlackjackVersionedAction(
      table(),
      createBlackjackActionProtocolState(),
      envelope(),
      mutate,
    );

    const replay = applyBlackjackVersionedAction(
      first.table,
      first.protocol,
      envelope(),
      mutate,
    );

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(replay.replayed).toBe(true);
    expect(replay.table).toBe(first.table);
    expect(replay.protocol).toBe(first.protocol);
    expect(replay.receipt.resultingStateVersion).toBe(1);
  });

  it("rejects actionId reuse with a different payload", () => {
    const first = applyBlackjackVersionedAction(
      table(),
      createBlackjackActionProtocolState(),
      envelope(),
      (current) => current,
    );

    expect(() =>
      applyBlackjackVersionedAction(
        first.table,
        first.protocol,
        envelope({ seatNumber: 2, payloadFingerprint: "leave-seat:v2" }),
        (current) => current,
      ),
    ).toThrow(/actionId conflict/);
  });

  it("treats payload fingerprint as part of actionId idempotency semantics", () => {
    const first = applyBlackjackVersionedAction(
      table(),
      createBlackjackActionProtocolState(),
      envelope({ payloadFingerprint: "bet:1000" }),
      (current) => current,
    );

    expect(() =>
      applyBlackjackVersionedAction(
        first.table,
        first.protocol,
        envelope({ payloadFingerprint: "bet:2000" }),
        (current) => current,
      ),
    ).toThrow(/actionId conflict/);
  });

  it("enforces runtime seat and action-specific round/hand/seat shapes", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ seatNumber: 9 as never }),
        (current) => current,
      ),
    ).toThrow(/seatNumber must be between 1 and 5/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({
          type: "HIT",
          roundId: null,
          handId: null,
          seatNumber: 1,
          payloadFingerprint: "hit:h1",
        }),
        (current) => current,
      ),
    ).toThrow(/HIT requires roundId/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({
          type: "PLACE_BET",
          roundId: null,
          handId: null,
          seatNumber: 1,
          payloadFingerprint: "bet:1000",
        }),
        (current) => current,
      ),
    ).toThrow(/PLACE_BET requires roundId/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({
          type: "LEAVE_SEAT",
          roundId: null,
          handId: null,
          seatNumber: null,
          payloadFingerprint: "leave",
        }),
        (current) => current,
      ),
    ).toThrow(/LEAVE_SEAT requires seatNumber/);
  });

  it("rejects foreign tables, rounds, hands and seat ownership before mutation", () => {
    const source = table();
    const protocol = createBlackjackActionProtocolState();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ tableId: "other-table" }),
        (current) => current,
      ),
    ).toThrow(/another table/);

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        protocol,
        envelope({ roundId: "missing-round" }),
        (current) => current,
      ),
    ).toThrow(/stale or foreign round/);
  });

  it("rejects mutation handlers that try to own stateVersion themselves", () => {
    const source = table();

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        createBlackjackActionProtocolState(),
        envelope(),
        (current) => ({
          ...current,
          stateVersion: current.stateVersion + 1,
        }),
      ),
    ).toThrow(/protocol owns version advancement/);
  });

  it("guards stateVersion safe integer exhaustion", () => {
    const source = {
      ...table(),
      stateVersion: Number.MAX_SAFE_INTEGER,
    };

    expect(() =>
      applyBlackjackVersionedAction(
        source,
        createBlackjackActionProtocolState(),
        envelope({ expectedStateVersion: Number.MAX_SAFE_INTEGER }),
        (current) => current,
      ),
    ).toThrow(/cannot advance safely/);
  });
});
