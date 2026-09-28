import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import {
  BlackjackPlayerActionCoordinator,
} from "./actionCoordinator";
import type {
  BlackjackCard,
  BlackjackRound,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import {
  createBlackjackReservationBook,
} from "./reservations";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
  type BlackjackRealtimeSource,
} from "./realtime";
import {
  createBlackjackCoordinatorRealtimeActionHandler,
} from "./realtimeActions";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function shoeForRealtimeAction(): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId: "ws-action-shoe",
    createdAtMs: 1,
  });
  const cards = [...source.cards];

  function moveRank(rank: BlackjackCard["rank"], target: number) {
    const index = cards.findIndex(
      (card, candidateIndex) =>
        candidateIndex >= target && card.rank === rank,
    );
    if (index < 0) throw new Error("required rank missing");
    [cards[target], cards[index]] = [cards[index], cards[target]];
  }

  moveRank("5", 0);
  moveRank("5", 1);
  moveRank("10", 2);
  moveRank("7", 3);
  moveRank("6", 4);

  return {
    ...source,
    cards,
    nextIndex: 4,
  };
}

function actionTable(): BlackjackTable {
  const shoe = shoeForRealtimeAction();
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe,
  });

  const round: BlackjackRound = {
    roundId: "round-ws",
    roundNumber: 1,
    phase: "PLAYER_TURNS",
    activeSeatOrder: [1],
    hands: [
      {
        handId: "hand-ws-1",
        playerId: "player-1",
        seatNumber: 1,
        cards: [shoe.cards[0], shoe.cards[1]],
        betCents: 1_000,
        status: "ACTIVE",
        origin: "INITIAL",
        splitDepth: 0,
        isSplitAce: false,
        isDoubled: false,
        result: null,
        payoutCents: 0,
      },
    ],
    dealer: {
      cards: [shoe.cards[2], shoe.cards[3]],
      holeCardRevealed: false,
    },
    currentTurn: {
      seatNumber: 1,
      handId: "hand-ws-1",
      startedAtMs: 0,
      endsAtMs: 15_000,
    },
    startedAtMs: 0,
    bettingClosesAtMs: 0,
    finishedAtMs: null,
  };

  return {
    ...foundation,
    phase: "PLAYER_TURNS",
    seats: foundation.seats.map((seat) =>
      seat.seatNumber === 1
        ? { ...seat, playerId: "player-1" }
        : seat.seatNumber === 2
          ? { ...seat, playerId: "player-2" }
          : seat,
    ),
    players: [
      {
        playerId: "player-1",
        userId: "user-1",
        sessionId: "session-1",
        seatNumber: 1,
        status: "PLAYING",
        connected: true,
        disconnectedAtMs: null,
        handIds: ["hand-ws-1"],
      },
      {
        playerId: "player-2",
        userId: "user-2",
        sessionId: "session-2",
        seatNumber: 2,
        status: "SEATED_WAITING",
        connected: true,
        disconnectedAtMs: null,
        handIds: [],
      },
    ],
    round,
  };
}

function coordinator() {
  return new BlackjackPlayerActionCoordinator({
    table: actionTable(),
    accounts: [
      {
        playerId: "player-1",
        userId: "user-1",
        wallet: createBlackjackWalletLedgerState({
          userId: "user-1",
          totalBalanceCents: 100_000,
        }),
        book: createBlackjackReservationBook("user-1"),
      },
      {
        playerId: "player-2",
        userId: "user-2",
        wallet: createBlackjackWalletLedgerState({
          userId: "user-2",
          totalBalanceCents: 100_000,
        }),
        book: createBlackjackReservationBook("user-2"),
      },
    ],
  });
}

function collectMessages(
  socket: WebSocket,
  count: number,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const messages: unknown[] = [];

    const cleanup = () => {
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (raw: RawData) => {
      try {
        messages.push(JSON.parse(raw.toString()));
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      if (messages.length === count) {
        cleanup();
        resolve(messages);
      }
    };

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return collectMessages(socket, 1).then(([message]) => message);
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Blackjack action test server did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("blackjack authenticated WebSocket player actions", () => {
  let runtime: BlackjackRealtimeRuntime | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  const clients: WebSocket[] = [];

  afterEach(async () => {
    for (const client of clients) client.terminate();
    clients.length = 0;
    runtime?.close();
    if (server?.listening) await closeServer(server);
    runtime = undefined;
    server = undefined;
  });

  it("executes one authenticated HIT and broadcasts the same authoritative state to both clients", async () => {
    const game = coordinator();
    let clock = 1_000;

    const source: BlackjackRealtimeSource = {
      getSnapshot: () =>
        buildBlackjackPublicSnapshot(game.getTable(), clock),
      subscribe: () => () => undefined,
    };

    server = createServer();
    runtime = attachBlackjackWebSocket(server, source, {
      nowMs: () => clock,
      createConnectionId: (() => {
        let next = 0;
        return () => "ws-action-connection-" + ++next;
      })(),
      resolveIdentity: (request) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const player = url.searchParams.get("player");
        if (player === "1") {
          return {
            userId: "user-1",
            playerId: "player-1",
            sessionId: "session-1",
          };
        }
        if (player === "2") {
          return {
            userId: "user-2",
            playerId: "player-2",
            sessionId: "session-2",
          };
        }
        return null;
      },
      handlePlayerAction:
        createBlackjackCoordinatorRealtimeActionHandler(game),
    });

    const port = await listen(server);
    const actor = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?player=1`,
    );
    const observer = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?player=2`,
    );
    clients.push(actor, observer);

    const [actorInitial, observerInitial] = await Promise.all([
      nextMessage(actor),
      nextMessage(observer),
    ]);
    expect(actorInitial).toEqual(observerInitial);

    const beforeIndex = game.getTable().shoe.nextIndex;
    clock = 2_000;

    const actorMessages = collectMessages(actor, 2);
    const observerMessage = nextMessage(observer);

    actor.send(
      JSON.stringify({
        type: "HIT",
        actionId: "hit-ws-1",
        expectedStateVersion: 0,
        roundId: "round-ws",
        handId: "hand-ws-1",
        seatNumber: 1,
      }),
    );

    const [actorReceived, observerReceived] = await Promise.all([
      actorMessages,
      observerMessage,
    ]);

    expect(actorReceived[0]).toEqual({
      type: "ACTION_ACCEPTED",
      actionId: "hit-ws-1",
      replayed: false,
      stateVersion: 1,
      eventSequence: 1,
    });

    const actorBroadcast = actorReceived[1] as {
      type: string;
      snapshot: ReturnType<typeof buildBlackjackPublicSnapshot>;
    };
    expect(actorBroadcast.type).toBe("snapshot");
    expect(observerReceived).toEqual(actorBroadcast);
    expect(actorBroadcast.snapshot.stateVersion).toBe(1);
    expect(actorBroadcast.snapshot.eventSequence).toBe(1);
    expect(actorBroadcast.snapshot.shoe.cardsRemaining).toBe(307);
    expect(
      actorBroadcast.snapshot.round?.hands[0].cards,
    ).toHaveLength(3);

    expect(game.getTable().shoe.nextIndex).toBe(beforeIndex + 1);
    expect(game.getProtocol().receipts).toHaveLength(1);
  });

  it("makes an exact WebSocket retry a no-op without consuming a second card", async () => {
    const game = coordinator();
    let clock = 1_000;

    const source: BlackjackRealtimeSource = {
      getSnapshot: () =>
        buildBlackjackPublicSnapshot(game.getTable(), clock),
      subscribe: () => () => undefined,
    };

    server = createServer();
    runtime = attachBlackjackWebSocket(server, source, {
      nowMs: () => clock,
      createConnectionId: () => "retry-connection",
      resolveIdentity: () => ({
        userId: "user-1",
        playerId: "player-1",
        sessionId: "session-1",
      }),
      handlePlayerAction:
        createBlackjackCoordinatorRealtimeActionHandler(game),
    });

    const port = await listen(server);
    const actor = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    clients.push(actor);
    await nextMessage(actor);

    const action = JSON.stringify({
      type: "HIT",
      actionId: "hit-retry",
      expectedStateVersion: 0,
      roundId: "round-ws",
      handId: "hand-ws-1",
      seatNumber: 1,
    });

    clock = 2_000;
    const firstMessages = collectMessages(actor, 2);
    actor.send(action);
    const first = await firstMessages;
    expect(first[0]).toMatchObject({
      type: "ACTION_ACCEPTED",
      replayed: false,
    });

    const afterFirstIndex = game.getTable().shoe.nextIndex;

    clock = 3_000;
    const replayAck = nextMessage(actor);
    actor.send(action);

    await expect(replayAck).resolves.toEqual({
      type: "ACTION_ACCEPTED",
      actionId: "hit-retry",
      replayed: true,
      stateVersion: 1,
      eventSequence: 1,
    });
    expect(game.getTable().shoe.nextIndex).toBe(afterFirstIndex);
    expect(game.getTable().stateVersion).toBe(1);
    expect(game.getTable().eventSequence).toBe(1);
    expect(game.getProtocol().receipts).toHaveLength(1);
  });

  it("rejects a stale action with an authoritative resync snapshot", async () => {
    const game = coordinator();
    let clock = 1_000;

    const source: BlackjackRealtimeSource = {
      getSnapshot: () =>
        buildBlackjackPublicSnapshot(game.getTable(), clock),
      subscribe: () => () => undefined,
    };

    server = createServer();
    runtime = attachBlackjackWebSocket(server, source, {
      nowMs: () => clock,
      createConnectionId: () => "stale-connection",
      resolveIdentity: () => ({
        userId: "user-1",
        playerId: "player-1",
        sessionId: "session-1",
      }),
      handlePlayerAction:
        createBlackjackCoordinatorRealtimeActionHandler(game),
    });

    const port = await listen(server);
    const actor = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    clients.push(actor);
    await nextMessage(actor);

    clock = 2_000;
    const committed = collectMessages(actor, 2);
    actor.send(
      JSON.stringify({
        type: "HIT",
        actionId: "first-hit",
        expectedStateVersion: 0,
        roundId: "round-ws",
        handId: "hand-ws-1",
        seatNumber: 1,
      }),
    );
    await committed;

    const beforeIndex = game.getTable().shoe.nextIndex;
    clock = 3_000;

    const rejected = nextMessage(actor);
    actor.send(
      JSON.stringify({
        type: "STAND",
        actionId: "stale-stand",
        expectedStateVersion: 0,
        roundId: "round-ws",
        handId: "hand-ws-1",
        seatNumber: 1,
      }),
    );

    const response = await rejected as {
      type: string;
      error: string;
      resync: {
        type: string;
        snapshot: ReturnType<typeof buildBlackjackPublicSnapshot>;
      };
    };

    expect(response.type).toBe("ACTION_REJECTED");
    expect(response.error).toBe("STALE_ACTION");
    expect(response.resync.type).toBe("FULL_TABLE_SNAPSHOT");
    expect(response.resync.snapshot.stateVersion).toBe(1);
    expect(response.resync.snapshot.eventSequence).toBe(1);
    expect(game.getTable().shoe.nextIndex).toBe(beforeIndex);
  });

  it("rejects a forged cross-seat action from another authenticated player without mutation", async () => {
    const game = coordinator();
    let clock = 1_000;

    const source: BlackjackRealtimeSource = {
      getSnapshot: () =>
        buildBlackjackPublicSnapshot(game.getTable(), clock),
      subscribe: () => () => undefined,
    };

    server = createServer();
    runtime = attachBlackjackWebSocket(server, source, {
      nowMs: () => clock,
      createConnectionId: () => "forged-connection",
      resolveIdentity: () => ({
        userId: "user-2",
        playerId: "player-2",
        sessionId: "session-2",
      }),
      handlePlayerAction:
        createBlackjackCoordinatorRealtimeActionHandler(game),
    });

    const port = await listen(server);
    const attacker = new WebSocket(
      `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}`,
    );
    clients.push(attacker);
    await nextMessage(attacker);

    const beforeIndex = game.getTable().shoe.nextIndex;
    const rejected = nextMessage(attacker);

    attacker.send(
      JSON.stringify({
        type: "HIT",
        actionId: "forged-hit",
        actorPlayerId: "player-1",
        expectedStateVersion: 0,
        roundId: "round-ws",
        handId: "hand-ws-1",
        seatNumber: 1,
      }),
    );

    await expect(rejected).resolves.toEqual({
      type: "ACTION_REJECTED",
      actionId: "forged-hit",
      error: "INVALID_ACTION",
    });

    expect(game.getTable().shoe.nextIndex).toBe(beforeIndex);
    expect(game.getTable().stateVersion).toBe(0);
    expect(game.getTable().eventSequence).toBe(0);
    expect(game.getProtocol().receipts).toHaveLength(0);
  });
});
