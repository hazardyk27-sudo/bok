import { describe, expect, it } from "vitest";
import type {
  BlackjackPlayer,
  BlackjackTable,
  BlackjackTablePhase,
} from "./domain";
import {
  cleanupBlackjackDisconnectedPlayerAfterRound,
  leaveBlackjackSeat,
  seatBlackjackPlayer,
} from "./participation";
import { createBlackjackTableFoundation } from "./seats";
import { createShuffledBlackjackShoe } from "./shuffle";

function table(phase: BlackjackTablePhase): BlackjackTable {
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe: createShuffledBlackjackShoe({
      shoeId: `participation-${phase}`,
      createdAtMs: 1,
    }),
  });

  return Object.freeze({ ...foundation, phase });
}

describe("blackjack join / seat / leave", () => {
  it("seats a player into an empty seat during BETTING as immediately eligible", () => {
    const original = table("BETTING");
    const seated = seatBlackjackPlayer(original, {
      playerId: "player-1",
      userId: "user-1",
      sessionId: "session-1",
      seatNumber: 3,
    });

    expect(original.players).toHaveLength(0);
    expect(original.seats[2].playerId).toBeNull();

    expect(seated.players).toHaveLength(1);
    expect(seated.players[0]).toMatchObject({
      playerId: "player-1",
      userId: "user-1",
      sessionId: "session-1",
      seatNumber: 3,
      status: "BETTING",
      connected: true,
      disconnectedAtMs: null,
      handIds: [],
    });
    expect(seated.seats[2].playerId).toBe("player-1");
    expect(seated.stateVersion).toBe(original.stateVersion + 1);
  });

  it("seats a player joining a live round as SEATED_WAITING for next round", () => {
    const livePhases: BlackjackTablePhase[] = [
      "BETTING_LOCKED",
      "INITIAL_DEAL",
      "PLAYER_TURNS",
      "DEALER_TURN",
      "SETTLEMENT",
    ];

    for (const phase of livePhases) {
      const seated = seatBlackjackPlayer(table(phase), {
        playerId: `player-${phase}`,
        userId: `user-${phase}`,
        sessionId: `session-${phase}`,
        seatNumber: 5,
      });

      expect(seated.players[0].status).toBe("SEATED_WAITING");
      expect(seated.players[0].handIds).toEqual([]);
    }
  });

  it("rejects occupied seats and duplicate account/player/session identities", () => {
    const first = seatBlackjackPlayer(table("BETTING"), {
      playerId: "player-1",
      userId: "user-1",
      sessionId: "session-1",
      seatNumber: 1,
    });

    expect(() =>
      seatBlackjackPlayer(first, {
        playerId: "player-2",
        userId: "user-2",
        sessionId: "session-2",
        seatNumber: 1,
      }),
    ).toThrow(/already occupied/);

    expect(() =>
      seatBlackjackPlayer(first, {
        playerId: "player-1",
        userId: "user-x",
        sessionId: "session-x",
        seatNumber: 2,
      }),
    ).toThrow(/playerId is already seated/);

    expect(() =>
      seatBlackjackPlayer(first, {
        playerId: "player-x",
        userId: "user-1",
        sessionId: "session-x",
        seatNumber: 2,
      }),
    ).toThrow(/user is already seated/);

    expect(() =>
      seatBlackjackPlayer(first, {
        playerId: "player-x",
        userId: "user-x",
        sessionId: "session-1",
        seatNumber: 2,
      }),
    ).toThrow(/session is already seated/);
  });

  it("locks seat mutations while RECOVERING", () => {
    expect(() =>
      seatBlackjackPlayer(table("RECOVERING"), {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-1",
        seatNumber: 1,
      }),
    ).toThrow(/RECOVERING/);
  });

  it("lets an uncommitted BETTING player leave and free the seat immediately", () => {
    const seated = seatBlackjackPlayer(table("BETTING"), {
      playerId: "betting-player",
      userId: "betting-user",
      sessionId: "betting-session",
      seatNumber: 3,
    });

    const left = leaveBlackjackSeat(seated, {
      playerId: "betting-player",
      nowMs: 90,
    });

    expect(left.players).toHaveLength(0);
    expect(left.seats[2].playerId).toBeNull();
    expect(left.stateVersion).toBe(seated.stateVersion + 1);
  });

  it("lets a next-round waiting player leave immediately even during a live round", () => {
    const seated = seatBlackjackPlayer(table("PLAYER_TURNS"), {
      playerId: "waiting-player",
      userId: "waiting-user",
      sessionId: "waiting-session",
      seatNumber: 4,
    });

    const left = leaveBlackjackSeat(seated, {
      playerId: "waiting-player",
      nowMs: 100,
    });

    expect(left.players).toHaveLength(0);
    expect(left.seats[3].playerId).toBeNull();
    expect(left.stateVersion).toBe(seated.stateVersion + 1);
  });

  it("preserves an active player's seat and hand ownership when leaving mid-round", () => {
    const seated = seatBlackjackPlayer(table("PLAYER_TURNS"), {
      playerId: "active-player",
      userId: "active-user",
      sessionId: "active-session",
      seatNumber: 2,
    });

    const activePlayer: BlackjackPlayer = {
      ...seated.players[0],
      status: "PLAYING",
      handIds: ["hand-1"],
    };
    const activeTable: BlackjackTable = {
      ...seated,
      players: [activePlayer],
    };

    const disconnected = leaveBlackjackSeat(activeTable, {
      playerId: "active-player",
      nowMs: 500,
    });

    expect(disconnected.seats[1].playerId).toBe("active-player");
    expect(disconnected.players[0]).toMatchObject({
      status: "DISCONNECTED",
      connected: false,
      disconnectedAtMs: 500,
      handIds: ["hand-1"],
    });
  });

  it("cleans a disconnected occupied seat only after the round boundary", () => {
    const seated = seatBlackjackPlayer(table("PLAYER_TURNS"), {
      playerId: "active-player",
      userId: "active-user",
      sessionId: "active-session",
      seatNumber: 2,
    });
    const activeTable: BlackjackTable = {
      ...seated,
      players: [
        {
          ...seated.players[0],
          status: "PLAYING",
          handIds: ["hand-1"],
        },
      ],
    };
    const disconnected = leaveBlackjackSeat(activeTable, {
      playerId: "active-player",
      nowMs: 500,
    });

    expect(() =>
      cleanupBlackjackDisconnectedPlayerAfterRound(
        disconnected,
        "active-player",
      ),
    ).toThrow(/only after the round/);

    const roundEnded: BlackjackTable = {
      ...disconnected,
      phase: "ROUND_END",
    };
    const cleaned = cleanupBlackjackDisconnectedPlayerAfterRound(
      roundEnded,
      "active-player",
    );

    expect(cleaned.players).toHaveLength(0);
    expect(cleaned.seats[1].playerId).toBeNull();
  });
});
