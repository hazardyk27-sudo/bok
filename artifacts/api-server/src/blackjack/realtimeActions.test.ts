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

  it("binds PLACE_BET to the authenticated actor and derives financial IDs server-side", () => {
    const parsed = parseBlackjackRealtimePlayerAction(
      {
        type: "PLACE_BET",
        actionId: "bet-1",
        expectedStateVersion: 3,
        roundId: "round-bet",
        handId: "forged-hand",
        seatNumber: 2,
        chipValueCents: 100_000,
        reservationId: "forged",
        reserveTransactionId: "forged",
      },
      {
        playerId: "player-2",
        tableId: "main-blackjack",
        nowMs: 500,
      },
    );

    expect(parsed.envelope).toMatchObject({
      actionId: "bet-1",
      actorPlayerId: "player-2",
      type: "PLACE_BET",
      tableId: "main-blackjack",
      expectedStateVersion: 3,
      roundId: "round-bet",
      handId: null,
      seatNumber: 2,
    });
    expect(parsed.chipValueCents).toBe(100_000);
    expect(parsed.reservationId).toBe(
      "blackjack:main-blackjack:bet-1:bet-reservation",
    );
    expect(parsed.reserveTransactionId).toBe(
      "blackjack:main-blackjack:bet-1:bet-reserve-tx",
    );
  });

  it("derives CLEAR_BET transaction IDs and accepts READY without hand scope", () => {
    const clear = parseBlackjackRealtimePlayerAction(
      {
        type: "CLEAR_BET",
        actionId: "clear-1",
        expectedStateVersion: 4,
        roundId: "round-bet",
        seatNumber: 3,
      },
      {
        playerId: "player-3",
        tableId: "main-blackjack",
        nowMs: 600,
      },
    );
    expect(clear.envelope.handId).toBeNull();
    expect(clear.clearTransactionId).toBe(
      "blackjack:main-blackjack:clear-1:clear-bet-tx",
    );

    const ready = parseBlackjackRealtimePlayerAction(
      {
        type: "READY",
        actionId: "ready-1",
        expectedStateVersion: 5,
        roundId: "round-bet",
        seatNumber: 3,
      },
      {
        playerId: "player-3",
        tableId: "main-blackjack",
        nowMs: 700,
      },
    );
    expect(ready.envelope.handId).toBeNull();
    expect(ready.envelope.type).toBe("READY");
  });


  it("rejects unsupported, malformed and invalid-seat actions", () => {
    expect(() =>
      parseBlackjackRealtimePlayerAction(
        {
          type: "LEAVE_SEAT",
          actionId: "a",
          expectedStateVersion: 0,
          roundId: "r",
          handId: null,
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
