import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import {
  createBlackjackJournalRecord,
  type BlackjackJournalRecord,
} from "./journal";
import {
  recoverBlackjackRuntime,
  resumeBlackjackRecoveredRuntime,
} from "./recovery";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import {
  createBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";

function runtime(
  eventSequence: number,
  stateVersion: number,
  withPlayer = false,
): BlackjackDurableRuntimeState {
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "recovery-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    table: {
      ...foundation,
      eventSequence,
      stateVersion,
      ...(withPlayer
        ? {
            seats: foundation.seats.map((seat) =>
              seat.seatNumber === 3
                ? { ...seat, playerId: "player-1" }
                : seat,
            ),
            players: [
              {
                playerId: "player-1",
                userId: "user-1",
                sessionId: "session-1",
                seatNumber: 3 as const,
                status: "SEATED_WAITING" as const,
                connected: true,
                disconnectedAtMs: null,
                handIds: [],
              },
            ],
          }
        : {}),
    },
    actionProtocol: createBlackjackActionProtocolState(),
    reconnectRegistry: createBlackjackReconnectRegistry(),
    wallets: [],
    reservationBooks: [],
    bettingPositions: [],
  };
}

function journalRecord(
  eventSequence: number,
  stateVersion: number,
): BlackjackJournalRecord {
  return createBlackjackJournalRecord({
    runtimeAfter: runtime(eventSequence, stateVersion, true),
    eventType: "TABLE_STATE_COMMITTED",
    actionId: "action-" + eventSequence,
    details: { eventSequence },
    createdAtMs: 1_000 + eventSequence,
  });
}

describe("blackjack server restart recovery", () => {
  it("loads snapshot then applies every later journal state in order", async () => {
    const snapshot = createBlackjackDurableSnapshot(
      runtime(1, 1, true),
      1_000,
    );
    const records = [journalRecord(2, 2), journalRecord(3, 3)];

    const recovered = await recoverBlackjackRuntime(
      "main-blackjack",
      { load: async () => snapshot },
      { loadAfter: async () => records },
      10_000,
    );

    expect(recovered).not.toBeNull();
    expect(recovered?.snapshotEventSequence).toBe(1);
    expect(recovered?.journalEventsApplied).toBe(2);
    expect(recovered?.runtime.table.eventSequence).toBe(3);
    expect(recovered?.runtime.table.stateVersion).toBe(4);
    expect(recovered?.runtime.table.phase).toBe("RECOVERING");
  });

  it("marks previously connected players disconnected with a fresh 30-second restart grace", async () => {
    const snapshot = createBlackjackDurableSnapshot(
      runtime(1, 1, true),
      1_000,
    );

    const recovered = await recoverBlackjackRuntime(
      "main-blackjack",
      { load: async () => snapshot },
      { loadAfter: async () => [] },
      50_000,
    );

    expect(recovered?.runtime.table.players[0]).toMatchObject({
      playerId: "player-1",
      status: "DISCONNECTED",
      connected: false,
      disconnectedAtMs: 50_000,
    });
    expect(recovered?.runtime.reconnectRegistry.records[0]).toMatchObject({
      playerId: "player-1",
      previousStatus: "SEATED_WAITING",
      disconnectedAtMs: 50_000,
      expiresAtMs: 80_000,
    });
  });

  it("resumes the exact pre-restart phase only after RECOVERING", async () => {
    const snapshot = createBlackjackDurableSnapshot(
      runtime(1, 5, true),
      1_000,
    );

    const recovered = await recoverBlackjackRuntime(
      "main-blackjack",
      { load: async () => snapshot },
      { loadAfter: async () => [] },
      10_000,
    );

    if (!recovered) throw new Error("expected recovery");
    const resumed = resumeBlackjackRecoveredRuntime(recovered);

    expect(recovered.resumePhase).toBe("TABLE_IDLE");
    expect(resumed.table.phase).toBe("TABLE_IDLE");
    expect(resumed.table.stateVersion).toBe(7);
  });

  it("returns null when no durable snapshot exists", async () => {
    await expect(
      recoverBlackjackRuntime(
        "main-blackjack",
        { load: async () => null },
        {
          loadAfter: async () => {
            throw new Error("journal must not load without snapshot");
          },
        },
        10_000,
      ),
    ).resolves.toBeNull();
  });

  it("rejects a journal tail that moves stateVersion backwards", async () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(1, 5), 1_000);
    const record = journalRecord(2, 4);

    await expect(
      recoverBlackjackRuntime(
        "main-blackjack",
        { load: async () => snapshot },
        { loadAfter: async () => [record] },
        10_000,
      ),
    ).rejects.toThrow(/stateVersion moved backwards/);
  });

  it("heals a legacy disconnected player that lacks durable reconnect metadata", async () => {
    const source = runtime(1, 1, true);
    const legacy: BlackjackDurableRuntimeState = {
      ...source,
      table: {
        ...source.table,
        players: source.table.players.map((player) => ({
          ...player,
          status: "DISCONNECTED" as const,
          connected: false,
          disconnectedAtMs: 1_000,
        })),
      },
    };

    const snapshot = createBlackjackDurableSnapshot(legacy, 1_000);

    const recovered=await recoverBlackjackRuntime(
      "main-blackjack",
      { load: async () => snapshot },
      { loadAfter: async () => [] },
      10_000,
    );

    expect(recovered).not.toBeNull();
    expect(recovered?.runtime.table.players[0]).toMatchObject({
      playerId:"player-1",
      status:"DISCONNECTED",
      connected:false,
      disconnectedAtMs:1_000,
    });
    expect(recovered?.runtime.reconnectRegistry.records[0]).toMatchObject({
      playerId:"player-1",
      userId:"user-1",
      sessionId:"session-1",
      previousStatus:"SEATED_WAITING",
      disconnectedAtMs:1_000,
      expiresAtMs:31_000,
    });
  });
});
