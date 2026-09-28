import { describe, expect, it } from "vitest";
import { createBlackjackActionProtocolState } from "./actionProtocol";
import {
  createBlackjackDurableSnapshot,
  verifyBlackjackDurableSnapshot,
  type BlackjackDurableRuntimeState,
} from "./snapshotState";
import { createBlackjackReconnectRegistry } from "./reconnect";
import { createBlackjackReservationBook } from "./reservations";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function runtime(): BlackjackDurableRuntimeState {
  const table = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createUnshuffledBlackjackShoe({
      shoeId: "snapshot-shoe",
      createdAtMs: 1,
    }),
  });

  return {
    table,
    actionProtocol: createBlackjackActionProtocolState(),
    reconnectRegistry: createBlackjackReconnectRegistry(),
    wallets: [],
    reservationBooks: [],
    bettingPositions: [],
  };
}

describe("blackjack durable snapshot state", () => {
  it("round-trips the complete authoritative runtime with checksum protection", () => {
    const source = runtime();
    const snapshot = createBlackjackDurableSnapshot(source, 10_000);
    const restored = verifyBlackjackDurableSnapshot(snapshot);

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      tableId: "main-blackjack",
      stateVersion: 0,
      eventSequence: 0,
      savedAtMs: 10_000,
    });
    expect(snapshot.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(restored).toEqual(source);
    expect(restored).not.toBe(source);
  });

  it("rejects metadata or payload tampering", () => {
    const snapshot = createBlackjackDurableSnapshot(runtime(), 10_000);

    expect(() =>
      verifyBlackjackDurableSnapshot({
        ...snapshot,
        stateVersion: snapshot.stateVersion + 1,
      }),
    ).toThrow(/metadata does not match/);

    expect(() =>
      verifyBlackjackDurableSnapshot({
        ...snapshot,
        checksum: "0".repeat(64),
      }),
    ).toThrow(/checksum mismatch/);
  });

  it("rejects a corrupted shoe cursor before persistence", () => {
    const source = runtime();
    const corrupt: BlackjackDurableRuntimeState = {
      ...source,
      table: {
        ...source.table,
        shoe: {
          ...source.table.shoe,
          nextIndex: 313,
        },
      },
    };

    expect(() => createBlackjackDurableSnapshot(corrupt, 10_000)).toThrow(
      /shoe cursor/,
    );
  });

  it("rejects action receipts claiming a future stateVersion", () => {
    const source = runtime();
    const corrupt: BlackjackDurableRuntimeState = {
      ...source,
      actionProtocol: {
        receipts: [
          {
            actionId: "action-future",
            actorPlayerId: "player-1",
            type: "LEAVE_SEAT",
            tableId: "main-blackjack",
            expectedStateVersion: 0,
            roundId: null,
            handId: null,
            seatNumber: 1,
            payloadFingerprint: "leave",
            resultingStateVersion: 1,
          },
        ],
      },
    };

    expect(() => createBlackjackDurableSnapshot(corrupt, 10_000)).toThrow(
      /receipt stateVersion/,
    );
  });

  it("rejects wallet and reservation-book drift", () => {
    const source = runtime();
    const wallet = createBlackjackWalletLedgerState({
      userId: "user-1",
      totalBalanceCents: 10_000,
    });
    const book = createBlackjackReservationBook("user-1");

    const corrupt: BlackjackDurableRuntimeState = {
      ...source,
      wallets: [
        {
          ...wallet,
          availableBalanceCents: 9_000,
          reservedBalanceCents: 1_000,
        },
      ],
      reservationBooks: [book],
    };

    expect(() => createBlackjackDurableSnapshot(corrupt, 10_000)).toThrow(
      /reservation mismatch/,
    );
  });

  it("rejects reconnect records that do not match a disconnected seated player", () => {
    const source = runtime();
    const corrupt: BlackjackDurableRuntimeState = {
      ...source,
      reconnectRegistry: {
        records: [
          {
            playerId: "ghost",
            userId: "user-ghost",
            sessionId: "session-ghost",
            previousStatus: "PLAYING",
            disconnectedAtMs: 1,
            expiresAtMs: 30_001,
          },
        ],
      },
    };

    expect(() => createBlackjackDurableSnapshot(corrupt, 10_000)).toThrow(
      /reconnect record/,
    );
  });
});
