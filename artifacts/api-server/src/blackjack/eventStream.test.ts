import { describe, expect, it } from "vitest";
import type { BlackjackTable } from "./domain";
import {
  checkBlackjackIncomingEventSequence,
  commitBlackjackServerEvent,
} from "./eventStream";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";

const BLACKJACK_TARGETED_PROMOTION_GATE = process.argv.some((argument) =>
  argument.replaceAll("\\", "/").endsWith(
    "src/blackjack/eventStream.test.ts",
  ),
);

if (BLACKJACK_TARGETED_PROMOTION_GATE) {
  await import("./actionCoordinator.test");
  await import("./bettingClose.test");
  await import("./bettingCoordinator.test");
  await import("./botSimulation.test");
  await import("./clientSync.test");
  await import("./connectionLifecycle.test");
  await import("./connectionPolicy.test");
  await import("./emptyTableLifecycle.test");
  await import("./initialDealFlow.test");
  await import("./journal.test");
  await import("./journalRepository.test");
  await import("./multiclientSync.test");
  await import("./multiplayerGate.test");
  await import("./nextRound.test");
  await import("./privatePlayerState.test");
  await import("./realtimeActions.test");
  await import("./reconnect.test");
  await import("./recovery.test");
  await import("./roundRealtime.test");
  await import("./roundRuntime.test");
  await import("./roundScheduler.test");
  await import("./runtimeAuthorityGate.test");
  await import("./runtimeRecovery.test");
  await import("./seatClaim.test");
  await import("./seatLeave.test");
  await import("./seatRaceGate.test");
  await import("./seatRealtimeMultiplayerGate.test");
  await import("./serverRuntime.test");
  await import("./snapshotRepository.test");
  await import("./snapshotState.test");
  await import("./syncProtocol.test");
  await import("./websocketActions.test");
}

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
