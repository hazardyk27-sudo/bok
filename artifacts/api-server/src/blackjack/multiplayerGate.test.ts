import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import { BlackjackPlayerActionCoordinator } from "./actionCoordinator";
import type {
  BlackjackCard,
  BlackjackHand,
  BlackjackRound,
  BlackjackSeatNumber,
  BlackjackShoe,
  BlackjackTable,
} from "./domain";
import { buildBlackjackPublicSnapshot } from "./publicSnapshot";
import { createBlackjackReservationBook } from "./reservations";
import {
  BLACKJACK_WS_PATH,
  attachBlackjackWebSocket,
  type BlackjackRealtimeRuntime,
  type BlackjackRealtimeSource,
} from "./realtime";
import { createBlackjackCoordinatorRealtimeActionHandler } from "./realtimeActions";
import { createBlackjackTableFoundation } from "./seats";
import { createUnshuffledBlackjackShoe } from "./shoe";
import { createBlackjackWalletLedgerState } from "./walletLedger";

function gateShoe(): BlackjackShoe {
  const source = createUnshuffledBlackjackShoe({
    shoeId: "multiplayer-gate-shoe",
    createdAtMs: 1,
  });
  const cards = [...source.cards];

  function moveRank(rank: BlackjackCard["rank"], target: number) {
    const index = cards.findIndex(
      (card, candidateIndex) =>
        candidateIndex >= target && card.rank === rank,
    );
    if (index < 0) throw new Error("multiplayer gate rank missing");
    [cards[target], cards[index]] = [cards[index], cards[target]];
  }

  const opening: readonly BlackjackCard["rank"][] = [
    "5", "5",
    "5", "6",
    "10", "7",
    "10", "8",
    "9", "7",
    "10", "6",
    "6", "8", "5",
  ];

  opening.forEach((rank, index) => moveRank(rank, index));

  return {
    ...source,
    cards,
    nextIndex: 12,
  };
}

function hand(
  shoe: BlackjackShoe,
  seatNumber: BlackjackSeatNumber,
  firstIndex: number,
  status: BlackjackHand["status"],
): BlackjackHand {
  return {
    handId: "gate-hand-" + seatNumber,
    playerId: "gate-player-" + seatNumber,
    seatNumber,
    cards: [shoe.cards[firstIndex], shoe.cards[firstIndex + 1]],
    betCents: 1_000,
    status,
    origin: "INITIAL",
    splitDepth: 0,
    isSplitAce: false,
    isDoubled: false,
    result: null,
    payoutCents: 0,
  };
}

function gateTable(): BlackjackTable {
  const shoe = gateShoe();
  const foundation = createBlackjackTableFoundation({
    tableId: "main-blackjack",
    shoe,
  });

  const hands: readonly BlackjackHand[] = [
    hand(shoe, 1, 0, "ACTIVE"),
    hand(shoe, 2, 2, "WAITING"),
    hand(shoe, 3, 4, "WAITING"),
    hand(shoe, 4, 6, "WAITING"),
    hand(shoe, 5, 8, "WAITING"),
  ];

  const round: BlackjackRound = {
    roundId: "multiplayer-gate-round",
    roundNumber: 1,
    phase: "PLAYER_TURNS",
    activeSeatOrder: [1, 2, 3, 4, 5],
    hands,
    dealer: {
      cards: [shoe.cards[10], shoe.cards[11]],
      holeCardRevealed: false,
    },
    currentTurn: {
      seatNumber: 1,
      handId: "gate-hand-1",
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
    seats: foundation.seats.map((seat) => ({
      ...seat,
      playerId: "gate-player-" + seat.seatNumber,
    })),
    players: foundation.seats.map((seat) => ({
      playerId: "gate-player-" + seat.seatNumber,
      userId: "gate-user-" + seat.seatNumber,
      sessionId: "gate-session-" + seat.seatNumber,
      seatNumber: seat.seatNumber,
      status: "PLAYING" as const,
      connected: true,
      disconnectedAtMs: null,
      handIds: ["gate-hand-" + seat.seatNumber],
    })),
    round,
  };
}

function gateCoordinator() {
  return new BlackjackPlayerActionCoordinator({
    table: gateTable(),
    accounts: Array.from({ length: 5 }, (_, index) => {
      const seat = index + 1;
      const userId = "gate-user-" + seat;
      return {
        playerId: "gate-player-" + seat,
        userId,
        wallet: createBlackjackWalletLedgerState({
          userId,
          totalBalanceCents: 100_000,
        }),
        book: createBlackjackReservationBook(userId),
      };
    }),
  });
}

function collectMessages(socket: WebSocket, count: number): Promise<unknown[]> {
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
        reject(new Error("Blackjack multiplayer gate server did not bind"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

type GateAction = Readonly<{
  seat: BlackjackSeatNumber;
  type: "HIT" | "STAND" | "DOUBLE";
  actionId: string;
  expectedStateVersion: number;
}>;

describe("blackjack five-client Multiplayer Gate", () => {
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

  it("keeps five authenticated clients synchronized through one shared-shoe turn sequence", async () => {
    const game = gateCoordinator();
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
        return () => "gate-connection-" + ++next;
      })(),
      resolveIdentity: (request) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const rawSeat = Number(url.searchParams.get("seat"));
        if (![1, 2, 3, 4, 5].includes(rawSeat)) return null;
        return {
          userId: "gate-user-" + rawSeat,
          playerId: "gate-player-" + rawSeat,
          sessionId: "gate-session-" + rawSeat,
        };
      },
      handlePlayerAction:
        createBlackjackCoordinatorRealtimeActionHandler(game),
    });

    const port = await listen(server);

    for (let seat = 1; seat <= 5; seat += 1) {
      clients.push(
        new WebSocket(
          `ws://127.0.0.1:${port}${BLACKJACK_WS_PATH}?seat=${seat}`,
        ),
      );
    }

    const initial = await Promise.all(clients.map(nextMessage));
    for (const message of initial.slice(1)) {
      expect(message).toEqual(initial[0]);
    }

    expect(runtime.connectionCount()).toBe(5);
    expect(runtime.authenticatedConnectionCount()).toBe(5);

    const initialSnapshot = initial[0] as {
      type: string;
      snapshot: ReturnType<typeof buildBlackjackPublicSnapshot>;
    };
    expect(initialSnapshot.snapshot.shoe.cardsRemaining).toBe(300);
    expect(initialSnapshot.snapshot.round?.dealer.cards[1]).toBeNull();

    const actions: readonly GateAction[] = [
      {
        seat: 1,
        type: "HIT",
        actionId: "gate-hit-1",
        expectedStateVersion: 0,
      },
      {
        seat: 1,
        type: "STAND",
        actionId: "gate-stand-1",
        expectedStateVersion: 1,
      },
      {
        seat: 2,
        type: "DOUBLE",
        actionId: "gate-double-2",
        expectedStateVersion: 2,
      },
      {
        seat: 3,
        type: "STAND",
        actionId: "gate-stand-3",
        expectedStateVersion: 3,
      },
      {
        seat: 4,
        type: "STAND",
        actionId: "gate-stand-4",
        expectedStateVersion: 4,
      },
      {
        seat: 5,
        type: "HIT",
        actionId: "gate-hit-5",
        expectedStateVersion: 5,
      },
    ];

    let lastBroadcast:
      | {
          type: string;
          snapshot: ReturnType<typeof buildBlackjackPublicSnapshot>;
        }
      | null = null;

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      clock += 1_000;

      const actorIndex = action.seat - 1;
      const actorMessages = collectMessages(clients[actorIndex], 2);
      const observerPromises = clients.map((client, clientIndex) =>
        clientIndex === actorIndex ? null : nextMessage(client),
      );

      clients[actorIndex].send(
        JSON.stringify({
          type: action.type,
          actionId: action.actionId,
          expectedStateVersion: action.expectedStateVersion,
          roundId: "multiplayer-gate-round",
          handId: "gate-hand-" + action.seat,
          seatNumber: action.seat,
        }),
      );

      const actorReceived = await actorMessages;
      const actorAck = actorReceived[0] as Record<string, unknown>;
      const actorBroadcast = actorReceived[1] as {
        type: string;
        snapshot: ReturnType<typeof buildBlackjackPublicSnapshot>;
      };

      expect(actorAck).toEqual({
        type: "ACTION_ACCEPTED",
        actionId: action.actionId,
        replayed: false,
        stateVersion: index + 1,
        eventSequence: index + 1,
      });
      expect(actorBroadcast.type).toBe("snapshot");

      const observerMessages = await Promise.all(
        observerPromises
          .filter((promise): promise is Promise<unknown> => promise !== null),
      );

      for (const observerMessage of observerMessages) {
        expect(observerMessage).toEqual(actorBroadcast);
      }

      expect(actorBroadcast.snapshot.stateVersion).toBe(index + 1);
      expect(actorBroadcast.snapshot.eventSequence).toBe(index + 1);
      lastBroadcast = actorBroadcast;
    }

    expect(lastBroadcast).not.toBeNull();
    expect(game.getTable().stateVersion).toBe(6);
    expect(game.getTable().eventSequence).toBe(6);
    expect(game.getProtocol().receipts).toHaveLength(6);

    // Three real draws: Seat 1 HIT, Seat 2 DOUBLE, Seat 5 HIT.
    expect(game.getTable().shoe.nextIndex).toBe(15);
    expect(lastBroadcast?.snapshot.shoe.cardsRemaining).toBe(297);

    expect(game.getTable().round?.hands[0].cards).toHaveLength(3);
    expect(game.getTable().round?.hands[1]).toMatchObject({
      betCents: 2_000,
      isDoubled: true,
      status: "STOOD",
    });
    expect(game.getTable().round?.hands[4].cards).toHaveLength(3);

    expect(game.getTable().phase).toBe("DEALER_TURN");
    expect(game.getTable().round?.phase).toBe("DEALER_TURN");
    expect(game.getTable().round?.currentTurn).toBeNull();

    const seat2Account = game.getAccount("gate-player-2");
    expect(seat2Account.wallet.reservedBalanceCents).toBe(1_000);
    expect(seat2Account.book.reservations).toHaveLength(1);

    for (const client of clients) {
      expect(client.readyState).toBe(WebSocket.OPEN);
    }
  });
});
