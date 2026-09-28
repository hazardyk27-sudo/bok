import { describe, expect, it } from "vitest";
import {
  parseBlackjackRealtimePlayerAction,
} from "./realtimeActions";

describe("blackjack realtime player action parsing", () => {
  it("binds actor identity on the server instead of trusting client fields", () => {
    const parsed = parseBlackjackRealtimePlayerAction(
      {
        type: "HIT",
        actionId: "action-1",
        actorPlayerId: "forged-player",
        expectedStateVersion: 7,
        roundId: "round-1",
        handId: "hand-1",
        seatNumber: 3,
      },
      {
        playerId: "authenticated-player",
        tableId: "main-blackjack",
        nowMs: 1_000,
      },
    );

    expect(parsed.envelope).toMatchObject({
      actionId: "action-1",
      actorPlayerId: "authenticated-player",
      type: "HIT",
      tableId: "main-blackjack",
      expectedStateVersion: 7,
      roundId: "round-1",
      handId: "hand-1",
      seatNumber: 3,
    });
  });

  it("derives DOUBLE financial IDs on the server from actionId", () => {
    const parsed = parseBlackjackRealtimePlayerAction(
      {
        type: "DOUBLE",
        actionId: "double-9",
        expectedStateVersion: 2,
        roundId: "round-1",
        handId: "hand-1",
        seatNumber: 1,
        reservationId: "client-forged",
        reserveTransactionId: "client-forged",
      },
      {
        playerId: "player-1",
        tableId: "main-blackjack",
        nowMs: 2_000,
      },
    );

    expect(parsed.reservationId).toBe(
      "blackjack:main-blackjack:double-9:reservation",
    );
    expect(parsed.reserveTransactionId).toBe(
      "blackjack:main-blackjack:double-9:reserve-tx",
    );
  });

  it("produces the same fingerprint for retries of the same semantic action", () => {
    const input = {
      type: "STAND",
      actionId: "stand-1",
      expectedStateVersion: 5,
      roundId: "round-1",
      handId: "hand-1",
      seatNumber: 1,
    };

    const first = parseBlackjackRealtimePlayerAction(input, {
      playerId: "player-1",
      tableId: "main-blackjack",
      nowMs: 10,
    });
    const retry = parseBlackjackRealtimePlayerAction(input, {
      playerId: "player-1",
      tableId: "main-blackjack",
      nowMs: 999,
    });

    expect(first.envelope.payloadFingerprint).toBe(
      retry.envelope.payloadFingerprint,
    );
  });

  it("rejects unsupported, malformed and invalid-seat actions", () => {
    expect(() =>
      parseBlackjackRealtimePlayerAction(
        {
          type: "READY",
          actionId: "a",
          expectedStateVersion: 0,
          roundId: "r",
          handId: "h",
          seatNumber: 1,
        },
        {
          playerId: "p",
          tableId: "t",
          nowMs: 1,
        },
      ),
    ).toThrow(/unsupported/);

    expect(() =>
      parseBlackjackRealtimePlayerAction(
        {
          type: "HIT",
          actionId: "",
          expectedStateVersion: 0,
          roundId: "r",
          handId: "h",
          seatNumber: 1,
        },
        {
          playerId: "p",
          tableId: "t",
          nowMs: 1,
        },
      ),
    ).toThrow(/actionId/);

    expect(() =>
      parseBlackjackRealtimePlayerAction(
        {
          type: "HIT",
          actionId: "a",
          expectedStateVersion: 0,
          roundId: "r",
          handId: "h",
          seatNumber: 9,
        },
        {
          playerId: "p",
          tableId: "t",
          nowMs: 1,
        },
      ),
    ).toThrow(/seatNumber/);
  });
});
