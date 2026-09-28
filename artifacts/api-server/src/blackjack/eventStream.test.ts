import { describe, expect, it } from "vitest";
import type { BlackjackTable } from "./domain";
import {
  checkBlackjackIncomingEventSequence,
  commitBlackjackServerEvent,
} from "./eventStream";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

function table(): BlackjackTable {
  return createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "event-shoe",
      createdAtMs: 1,
    }),
  });
}

describe("blackjack event sequence stream", () => {
  it("commits monotonically increasing server eventSequence values", () => {
    const source = table();

    const first = commitBlackjackServerEvent(source, {
      type: "TABLE_STATE_COMMITTED",
      actionId: "action-1",
      createdAtMs: 10,
    });
    const second = commitBlackjackServerEvent(first.table, {
      type: "TURN_STARTED",
      actionId: "action-1",
      createdAtMs: 11,
    });

    expect(source.eventSequence).toBe(0);
    expect(first.event.eventSequence).toBe(1);
    expect(first.table.eventSequence).toBe(1);
    expect(second.event.eventSequence).toBe(2);
    expect(second.table.eventSequence).toBe(2);
  });

  it("records the authoritative stateVersion that produced the event", () => {
    const source = {
      ...table(),
      stateVersion: 7,
    };

    const committed = commitBlackjackServerEvent(source, {
      type: "CARD_DEALT",
      actionId: "action-7",
      createdAtMs: 20,
    });

    expect(committed.event).toMatchObject({
      eventSequence: 1,
      stateVersion: 7,
      type: "CARD_DEALT",
      actionId: "action-7",
    });
  });

  it("identifies the exact next event as safe to apply", () => {
    expect(checkBlackjackIncomingEventSequence(10, 11)).toEqual({
      status: "NEXT",
      eventSequence: 11,
    });
  });

  it("identifies duplicate or reordered old events without applying them", () => {
    expect(checkBlackjackIncomingEventSequence(10, 10)).toEqual({
      status: "DUPLICATE_OR_OLD",
      eventSequence: 10,
    });
    expect(checkBlackjackIncomingEventSequence(10, 8)).toEqual({
      status: "DUPLICATE_OR_OLD",
      eventSequence: 8,
    });
  });

  it("requires resync whenever an event gap is detected", () => {
    expect(checkBlackjackIncomingEventSequence(10, 12)).toEqual({
      status: "RESYNC_REQUIRED",
      expectedEventSequence: 11,
      receivedEventSequence: 12,
    });

    expect(checkBlackjackIncomingEventSequence(0, 50)).toEqual({
      status: "RESYNC_REQUIRED",
      expectedEventSequence: 1,
      receivedEventSequence: 50,
    });
  });

  it("rejects unsafe event sequence exhaustion and invalid metadata", () => {
    expect(() =>
      commitBlackjackServerEvent(
        {
          ...table(),
          eventSequence: Number.MAX_SAFE_INTEGER,
        },
        {
          type: "TABLE_STATE_COMMITTED",
          actionId: "action-overflow",
          createdAtMs: 1,
        },
      ),
    ).toThrow(/cannot advance safely/);

    expect(() =>
      commitBlackjackServerEvent(table(), {
        type: "TABLE_STATE_COMMITTED",
        actionId: "   ",
        createdAtMs: 1,
      }),
    ).toThrow(/actionId/);

    expect(
      checkBlackjackIncomingEventSequence(
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ),
    ).toEqual({
      status: "DUPLICATE_OR_OLD",
      eventSequence: Number.MAX_SAFE_INTEGER,
    });

    expect(() =>
      checkBlackjackIncomingEventSequence(-1, 0),
    ).toThrow(/lastAppliedEventSequence/);
  });
});
