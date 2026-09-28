import { describe, expect, it } from "vitest";
import {
  BLACKJACK_MAX_SEATS,
  BLACKJACK_ROUTE,
  BLACKJACK_SHELL_MARKUP,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  bindBlackjackRealtimeView,
  buildBlackjackPlayerActionMessage,
  buildBlackjackTableViewModelFromSnapshot,
  createBlackjackPlayerActionClient,
  buildBlackjackWebSocketUrl,
  connectBlackjackRealtimeElement,
  renderBlackjackTableShell,
  type BlackjackRealtimeSocketLike,
  type BlackjackPublicSnapshotViewSource,
} from "./index";

describe("blackjack responsive table foundation", () => {
  it("owns the canonical Blackjack route identifier", () => {
    expect(BLACKJACK_ROUTE).toBe("/blackjack");
  });

  it("renders exactly five fixed player seats with Seat 3 as local foundation", () => {
    expect(BLACKJACK_MAX_SEATS).toBe(5);
    expect(BLACKJACK_TABLE_SEAT_NUMBERS).toEqual([1, 2, 3, 4, 5]);

    for (let seat = 1; seat <= BLACKJACK_MAX_SEATS; seat += 1) {
      expect(BLACKJACK_SHELL_MARKUP).toContain(`data-seat="${seat}"`);
    }

    expect(BLACKJACK_SHELL_MARKUP).toContain('data-seat="3"');
    expect(BLACKJACK_SHELL_MARKUP).toContain('data-local="true"');
  });

  it("contains dealer, shared shoe and four core player-action controls", () => {
    expect(BLACKJACK_SHELL_MARKUP).toContain("blackjack-dealer-zone");
    expect(BLACKJACK_SHELL_MARKUP).toContain("blackjack-shoe");

    for (const action of ["HIT", "STAND", "DOUBLE", "SPLIT"]) {
      expect(BLACKJACK_SHELL_MARKUP).toContain(
        `data-blackjack-action="${action}"`,
      );
    }
  });

  it("mounts the approved premium chip tray and betting controls", () => {
    for (const credits of [10, 25, 50, 100, 250, 500, 1_000]) {
      expect(BLACKJACK_SHELL_MARKUP).toContain(
        `data-blackjack-chip="${credits}"`,
      );
    }

    expect(BLACKJACK_SHELL_MARKUP).toContain(
      'data-blackjack-chip-scale="DOUBLE"',
    );
    expect(BLACKJACK_SHELL_MARKUP).toContain(
      'data-blackjack-bet-action="CLEAR"',
    );
    expect(BLACKJACK_SHELL_MARKUP).toContain(
      'data-blackjack-bet-action="READY"',
    );
  });

  it("keeps the shell explicitly marked as Blackjack-owned table UI", () => {
    expect(BLACKJACK_SHELL_MARKUP).toContain('data-game="blackjack"');
    expect(BLACKJACK_SHELL_MARKUP).toContain('data-phase="table-shell"');
    expect(BLACKJACK_SHELL_MARKUP).toContain("5 PLAYER SHARED TABLE");
  });

  it("escapes dynamic labels before inserting them into HTML", () => {
    const markup = renderBlackjackTableShell({
      phaseLabel: "<READY>",
      balanceLabel: "10 & 20",
      betLabel: '"500"',
      turnLabel: "YOU <script>",
      dealerTotalLabel: "DEALER",
      seats: [
        {
          seatNumber: 1,
          label: "<P1>",
          status: "WAITING",
          total: null,
          betLabel: null,
          isLocal: false,
        },
        {
          seatNumber: 2,
          label: "P2",
          status: "WAITING",
          total: null,
          betLabel: null,
          isLocal: false,
        },
        {
          seatNumber: 3,
          label: "YOU",
          status: "ACTIVE",
          total: 16,
          betLabel: "1K",
          isLocal: true,
        },
        {
          seatNumber: 4,
          label: "P4",
          status: "WAITING",
          total: null,
          betLabel: null,
          isLocal: false,
        },
        {
          seatNumber: 5,
          label: "P5",
          status: "WAITING",
          total: null,
          betLabel: null,
          isLocal: false,
        },
      ],
    });

    expect(markup).toContain("&lt;READY&gt;");
    expect(markup).toContain("10 &amp; 20");
    expect(markup).toContain("&quot;500&quot;");
    expect(markup).toContain("YOU &lt;script&gt;");
    expect(markup).toContain("&lt;P1&gt;");
    expect(markup).not.toContain("<script>");
  });

  it("rejects malformed view models that do not contain five seats", () => {
    expect(() =>
      renderBlackjackTableShell({
        phaseLabel: "WAITING",
        balanceLabel: "0",
        betLabel: "0",
        turnLabel: "TABLE",
        dealerTotalLabel: "DEALER",
        seats: [],
      }),
    ).toThrow(/exactly five seats/);
  });

  it("binds authoritative public snapshots into the five-seat table view", () => {
    const snapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 10_000,
      tableId: "table-view",
      phase: "PLAYER_TURNS",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: "player-1" },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: "player-local" },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [
        {
          playerId: "player-1",
          seatNumber: 1,
          status: "PLAYING",
          connected: false,
        },
        {
          playerId: "player-local",
          seatNumber: 3,
          status: "PLAYING",
          connected: true,
        },
      ],
      round: {
        phase: "PLAYER_TURNS",
        hands: [
          {
            handId: "hand-1",
            playerId: "player-1",
            seatNumber: 1,
            cards: [
              { suit: "SPADES", rank: "10" },
              { suit: "HEARTS", rank: "7" },
            ],
            betCents: 25_000,
            status: "STOOD",
          },
          {
            handId: "hand-local",
            playerId: "player-local",
            seatNumber: 3,
            cards: [
              { suit: "CLUBS", rank: "A" },
              { suit: "DIAMONDS", rank: "K" },
            ],
            betCents: 100_000,
            status: "ACTIVE",
          },
        ],
        dealer: {
          cards: [{ suit: "HEARTS", rank: "10" }, null],
          holeCardRevealed: false,
        },
        currentTurn: {
          seatNumber: 3,
          handId: "hand-local",
          startedAtMs: 5_000,
          endsAtMs: 16_000,
        },
        bettingClosesAtMs: 4_000,
      },
      stateVersion: 12,
      eventSequence: 18,
    };

    const model = buildBlackjackTableViewModelFromSnapshot(snapshot, {
      localPlayerId: "player-local",
      availableBalanceCents: 500_000,
    });

    expect(model.phaseLabel).toBe("PLAYER TURNS");
    expect(model.turnLabel).toBe("YOUR TURN · 6s");
    expect(model.dealerTotalLabel).toBe("10 + ?");
    expect(model.balanceLabel).toBe("5K");
    expect(model.betLabel).toBe("1K");

    const localSeat = model.seats.find((seat) => seat.seatNumber === 3);
    expect(localSeat).toMatchObject({
      label: "YOUR SEAT",
      status: "ACTIVE",
      total: 21,
      betLabel: "1K",
      isLocal: true,
    });

    const offlineSeat = model.seats.find((seat) => seat.seatNumber === 1);
    expect(offlineSeat?.label).toBe("PLAYER 1 · OFFLINE");
    expect(model.seats.find((seat) => seat.seatNumber === 2)?.status).toBe(
      "EMPTY",
    );
  });

  it("uses the current split hand for the seat total while summing all split stakes", () => {
    const snapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 20_000,
      tableId: "split-view",
      phase: "PLAYER_TURNS",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: "player-local" },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [
        {
          playerId: "player-local",
          seatNumber: 3,
          status: "PLAYING",
          connected: true,
        },
      ],
      round: {
        phase: "PLAYER_TURNS",
        hands: [
          {
            handId: "left",
            playerId: "player-local",
            seatNumber: 3,
            cards: [
              { suit: "CLUBS", rank: "10" },
              { suit: "DIAMONDS", rank: "10" },
            ],
            betCents: 100_000,
            status: "STOOD",
          },
          {
            handId: "right",
            playerId: "player-local",
            seatNumber: 3,
            cards: [
              { suit: "HEARTS", rank: "9" },
              { suit: "SPADES", rank: "7" },
            ],
            betCents: 100_000,
            status: "ACTIVE",
          },
        ],
        dealer: {
          cards: [
            { suit: "HEARTS", rank: "A" },
            { suit: "SPADES", rank: "6" },
          ],
          holeCardRevealed: true,
        },
        currentTurn: {
          seatNumber: 3,
          handId: "right",
          startedAtMs: 18_000,
          endsAtMs: 30_000,
        },
        bettingClosesAtMs: null,
      },
      stateVersion: 20,
      eventSequence: 30,
    };

    const model = buildBlackjackTableViewModelFromSnapshot(snapshot, {
      localPlayerId: "player-local",
    });
    const localSeat = model.seats.find((seat) => seat.seatNumber === 3);

    expect(localSeat?.total).toBe(16);
    expect(localSeat?.betLabel).toBe("2K");
    expect(model.betLabel).toBe("2K");
    expect(model.dealerTotalLabel).toBe("17");
  });

  it("rejects malformed public snapshots before rendering", () => {
    const malformed = {
      serverTimeMs: 0,
      tableId: "bad-table",
      phase: "TABLE_IDLE",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: null },
        { seatNumber: 4, playerId: null },
      ],
      players: [],
      round: null,
      stateVersion: 0,
      eventSequence: 0,
    } as unknown as BlackjackPublicSnapshotViewSource;

    expect(() =>
      buildBlackjackTableViewModelFromSnapshot(malformed),
    ).toThrow(/exactly five seats/);
  });


  it("renders only after an authoritative FULL_TABLE_SNAPSHOT baseline", () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const sent: string[] = [];
    const socket: BlackjackRealtimeSocketLike = {
      send: (data) => sent.push(data),
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
    const rendered: string[] = [];

    const idleSnapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 100,
      tableId: "rt-table",
      phase: "TABLE_IDLE",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: null },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [],
      round: null,
      stateVersion: 2,
      eventSequence: 4,
    };

    const controller = bindBlackjackRealtimeView({
      socket,
      renderModel: (model) => rendered.push(model.phaseLabel),
    });

    controller.receive({
      type: "snapshot",
      snapshot: idleSnapshot,
    });
    expect(rendered).toEqual([]);
    expect(controller.isAwaitingResync()).toBe(true);
    expect(JSON.parse(sent[0])).toEqual({ type: "sync" });

    controller.receive({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EXPLICIT_SYNC",
      snapshot: idleSnapshot,
      resetEventSequenceTo: 4,
      resetStateVersionTo: 2,
    });

    expect(rendered).toEqual(["TABLE IDLE"]);
    expect(controller.getCursor()).toEqual({
      eventSequence: 4,
      stateVersion: 2,
    });
    expect(controller.isAwaitingResync()).toBe(false);
    controller.detach();
    expect(listeners.size).toBe(0);
  });

  it("applies the exact next live snapshot but resyncs on packet gaps", () => {
    const sent: string[] = [];
    const socket: BlackjackRealtimeSocketLike = {
      send: (data) => sent.push(data),
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const rendered: number[] = [];

    const makeSnapshot = (
      eventSequence: number,
      stateVersion: number,
    ): BlackjackPublicSnapshotViewSource => ({
      serverTimeMs: eventSequence * 1_000,
      tableId: "rt-table",
      phase: "TABLE_IDLE",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: null },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [],
      round: null,
      stateVersion,
      eventSequence,
    });

    const controller = bindBlackjackRealtimeView({
      socket,
      renderModel: () => {
        const cursor = controller.getCursor();
        rendered.push(cursor?.eventSequence ?? 0);
      },
    });

    controller.receive({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "INITIAL_CONNECT",
      snapshot: makeSnapshot(10, 5),
      resetEventSequenceTo: 10,
      resetStateVersionTo: 5,
    });

    controller.receive({
      type: "snapshot",
      snapshot: makeSnapshot(11, 6),
    });
    expect(controller.getCursor()).toEqual({
      eventSequence: 11,
      stateVersion: 6,
    });

    controller.receive({
      type: "snapshot",
      snapshot: makeSnapshot(11, 6),
    });
    expect(sent).toEqual([]);

    controller.receive({
      type: "snapshot",
      snapshot: makeSnapshot(13, 7),
    });
    expect(controller.getCursor()).toEqual({
      eventSequence: 11,
      stateVersion: 6,
    });
    expect(controller.isAwaitingResync()).toBe(true);
    expect(JSON.parse(sent[0])).toEqual({
      type: "sync",
      lastEventSequence: 11,
      lastStateVersion: 6,
    });

    controller.receive({
      type: "snapshot",
      snapshot: makeSnapshot(12, 7),
    });
    expect(controller.getCursor()?.eventSequence).toBe(11);

    controller.receive({
      type: "FULL_TABLE_SNAPSHOT",
      reason: "EVENT_GAP",
      snapshot: makeSnapshot(13, 7),
      resetEventSequenceTo: 13,
      resetStateVersionTo: 7,
    });
    expect(controller.getCursor()).toEqual({
      eventSequence: 13,
      stateVersion: 7,
    });
    expect(controller.isAwaitingResync()).toBe(false);
    expect(rendered).toHaveLength(3);
  });

  it("accepts nested stale-action resync and rejects backwards live state", () => {
    const sent: string[] = [];
    const socket: BlackjackRealtimeSocketLike = {
      send: (data) => sent.push(data),
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const makeSnapshot = (
      eventSequence: number,
      stateVersion: number,
    ): BlackjackPublicSnapshotViewSource => ({
      serverTimeMs: 1_000,
      tableId: "rt-table",
      phase: "TABLE_IDLE",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: null },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [],
      round: null,
      stateVersion,
      eventSequence,
    });

    const controller = bindBlackjackRealtimeView({
      socket,
      renderModel: () => {},
    });

    controller.receive({
      type: "ACTION_REJECTED",
      actionId: "stale-1",
      error: "STALE_ACTION",
      resync: {
        type: "FULL_TABLE_SNAPSHOT",
        reason: "STATE_MISMATCH",
        snapshot: makeSnapshot(20, 10),
        resetEventSequenceTo: 20,
        resetStateVersionTo: 10,
      },
    });
    expect(controller.getCursor()).toEqual({
      eventSequence: 20,
      stateVersion: 10,
    });

    controller.receive({
      type: "snapshot",
      snapshot: makeSnapshot(21, 9),
    });
    expect(controller.getCursor()).toEqual({
      eventSequence: 20,
      stateVersion: 10,
    });
    expect(controller.isAwaitingResync()).toBe(true);
    expect(JSON.parse(sent[0])).toEqual({
      type: "sync",
      lastEventSequence: 20,
      lastStateVersion: 10,
    });
  });


  it("builds a same-origin Blackjack WebSocket URL for http and https", () => {
    expect(
      buildBlackjackWebSocketUrl({
        protocol: "https:",
        host: "casino.example",
      }),
    ).toBe("wss://casino.example/api/blackjack/ws");

    expect(
      buildBlackjackWebSocketUrl({
        protocol: "http:",
        host: "localhost:4173",
      }),
    ).toBe("ws://localhost:4173/api/blackjack/ws");

    expect(() =>
      buildBlackjackWebSocketUrl({
        protocol: "file:",
        host: "",
      }),
    ).toThrow(/http: or https:/);
  });

  it("bootstraps and cleanly closes the owned browser realtime adapter", () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const closeCalls: Array<[number | undefined, string | undefined]> = [];
    const createdUrls: string[] = [];

    const connection = connectBlackjackRealtimeElement(
      {
        innerHTML: "",
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as HTMLElement,
      {
        location: {
          protocol: "https:",
          host: "blackjack.example",
        },
        createSocket: (url) => {
          createdUrls.push(url);
          return {
            send: () => {},
            addEventListener: (_type, listener) => listeners.add(listener),
            removeEventListener: (_type, listener) => listeners.delete(listener),
            close: (code, reason) => closeCalls.push([code, reason]),
          };
        },
      },
    );

    expect(connection.url).toBe(
      "wss://blackjack.example/api/blackjack/ws",
    );
    expect(createdUrls).toEqual([connection.url]);
    expect(listeners.size).toBe(2);

    connection.close();
    connection.close();

    expect(listeners.size).toBe(0);
    expect(closeCalls).toEqual([[1000, "BLACKJACK_CLIENT_CLOSED"]]);
  });


  it("renders authoritative player and dealer card faces while preserving the hidden hole card", () => {
    const snapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 10_000,
      tableId: "card-table",
      phase: "PLAYER_TURNS",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: "player-local" },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [
        {
          playerId: "player-local",
          seatNumber: 3,
          status: "PLAYING",
          connected: true,
        },
      ],
      round: {
        phase: "PLAYER_TURNS",
        hands: [
          {
            handId: "card-hand",
            playerId: "player-local",
            seatNumber: 3,
            cards: [
              { suit: "HEARTS", rank: "A" },
              { suit: "SPADES", rank: "K" },
            ],
            betCents: 100_000,
            status: "ACTIVE",
          },
        ],
        dealer: {
          cards: [{ suit: "DIAMONDS", rank: "9" }, null],
          holeCardRevealed: false,
        },
        currentTurn: {
          seatNumber: 3,
          handId: "card-hand",
          startedAtMs: 5_000,
          endsAtMs: 15_000,
        },
        bettingClosesAtMs: null,
      },
      stateVersion: 3,
      eventSequence: 4,
    };

    const model = buildBlackjackTableViewModelFromSnapshot(snapshot, {
      localPlayerId: "player-local",
    });
    const markup = renderBlackjackTableShell(model);

    expect(markup).toContain('data-card-rank="A"');
    expect(markup).toContain('data-card-suit="HEARTS"');
    expect(markup).toContain('data-card-rank="K"');
    expect(markup).toContain('data-card-rank="9"');
    expect(markup).toContain('data-card-hidden="true"');
    expect(markup).not.toContain('data-card-rank="null"');
  });


  it("enables the authoritative local turn controls and builds the exact server action envelope", () => {
    const snapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 5_000,
      tableId: "action-table",
      phase: "PLAYER_TURNS",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: null },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: "local-player" },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [
        {
          playerId: "local-player",
          seatNumber: 3,
          status: "PLAYING",
          connected: true,
        },
      ],
      round: {
        roundId: "round-actions",
        phase: "PLAYER_TURNS",
        hands: [
          {
            handId: "hand-actions",
            playerId: "local-player",
            seatNumber: 3,
            cards: [
              { suit: "HEARTS", rank: "8" },
              { suit: "SPADES", rank: "8" },
            ],
            betCents: 100_000,
            status: "ACTIVE",
          },
        ],
        dealer: {
          cards: [{ suit: "CLUBS", rank: "10" }, null],
          holeCardRevealed: false,
        },
        currentTurn: {
          seatNumber: 3,
          handId: "hand-actions",
          startedAtMs: 1_000,
          endsAtMs: 16_000,
        },
        bettingClosesAtMs: null,
      },
      stateVersion: 9,
      eventSequence: 12,
    };

    const context = {
      localPlayerId: "local-player",
      availableBalanceCents: 200_000,
    };
    const model = buildBlackjackTableViewModelFromSnapshot(snapshot, context);

    expect(model.enabledActions).toEqual([
      "HIT",
      "STAND",
      "DOUBLE",
      "SPLIT",
    ]);

    expect(
      buildBlackjackPlayerActionMessage(
        snapshot,
        context,
        "DOUBLE",
        "action-double-1",
      ),
    ).toEqual({
      type: "DOUBLE",
      actionId: "action-double-1",
      expectedStateVersion: 9,
      roundId: "round-actions",
      handId: "hand-actions",
      seatNumber: 3,
    });
  });

  it("sends player actions only from the latest authoritative local turn", () => {
    const sent: string[] = [];
    const socket: BlackjackRealtimeSocketLike = {
      send: (data) => sent.push(data),
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const snapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 1_000,
      tableId: "send-table",
      phase: "PLAYER_TURNS",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: "local-player" },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: null },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [
        {
          playerId: "local-player",
          seatNumber: 1,
          status: "PLAYING",
          connected: true,
        },
      ],
      round: {
        roundId: "round-send",
        phase: "PLAYER_TURNS",
        hands: [
          {
            handId: "hand-send",
            playerId: "local-player",
            seatNumber: 1,
            cards: [
              { suit: "HEARTS", rank: "10" },
              { suit: "SPADES", rank: "7" },
            ],
            betCents: 25_000,
            status: "ACTIVE",
          },
        ],
        dealer: {
          cards: [{ suit: "CLUBS", rank: "9" }, null],
          holeCardRevealed: false,
        },
        currentTurn: {
          seatNumber: 1,
          handId: "hand-send",
          startedAtMs: 0,
          endsAtMs: 15_000,
        },
        bettingClosesAtMs: null,
      },
      stateVersion: 4,
      eventSequence: 6,
    };

    let actionCounter=0;
    const client=createBlackjackPlayerActionClient({
      socket,
      getSnapshot:()=>snapshot,
      getViewContext:()=>({
        localPlayerId:"local-player",
        availableBalanceCents:100_000,
      }),
      createActionId:()=>`action-${++actionCounter}`,
    });

    const hit=client.submit("HIT");

    expect(hit).toEqual({
      type:"HIT",
      actionId:"action-1",
      expectedStateVersion:4,
      roundId:"round-send",
      handId:"hand-send",
      seatNumber:1,
    });
    expect(JSON.parse(sent[0])).toEqual(hit);
    expect(client.isPending()).toBe(true);
    expect(() => client.submit("STAND")).toThrow(/already pending/);

    client.receive({
      type:"ACTION_ACCEPTED",
      actionId:"action-1",
      replayed:false,
      stateVersion:5,
      eventSequence:7,
    });
    expect(client.getPending()?.phase).toBe("ACKNOWLEDGED");
    expect(() => client.submit("STAND")).toThrow(/already pending/);

    client.receive({
      type:"snapshot",
      snapshot:{ ...snapshot, stateVersion:5, eventSequence:7 },
    });
    expect(client.isPending()).toBe(false);
    expect(client.getFeedback()).toEqual({
      status:"ACCEPTED",
      actionId:"action-1",
      actionType:"HIT",
      error:null,
    });

    const stand=client.submit("STAND");
    expect(JSON.parse(sent[1])).toEqual(stand);
    expect(sent).toHaveLength(2);
    client.detach();

    expect(() =>
      buildBlackjackPlayerActionMessage(
        snapshot,
        { localPlayerId: "another-player", availableBalanceCents: 100_000 },
        "HIT",
        "forged",
      ),
    ).toThrow(/not currently available/);
  });


  it("releases a pending action on rejection/protocol error and surfaces safe feedback", () => {
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const sent: string[] = [];
    const socket: BlackjackRealtimeSocketLike = {
      send:(data)=>sent.push(data),
      addEventListener:(_type,listener)=>listeners.add(listener),
      removeEventListener:(_type,listener)=>listeners.delete(listener),
    };

    const snapshot: BlackjackPublicSnapshotViewSource = {
      serverTimeMs: 1_000,
      tableId: "reject-table",
      phase: "PLAYER_TURNS",
      maxSeats: 5,
      seats: [
        { seatNumber: 1, playerId: "local-player" },
        { seatNumber: 2, playerId: null },
        { seatNumber: 3, playerId: null },
        { seatNumber: 4, playerId: null },
        { seatNumber: 5, playerId: null },
      ],
      players: [{
        playerId:"local-player",
        seatNumber:1,
        status:"PLAYING",
        connected:true,
      }],
      round: {
        roundId:"round-reject",
        phase:"PLAYER_TURNS",
        hands:[{
          handId:"hand-reject",
          playerId:"local-player",
          seatNumber:1,
          cards:[
            { suit:"HEARTS", rank:"10" },
            { suit:"SPADES", rank:"6" },
          ],
          betCents:10_000,
          status:"ACTIVE",
        }],
        dealer:{
          cards:[{ suit:"CLUBS", rank:"9" },null],
          holeCardRevealed:false,
        },
        currentTurn:{
          seatNumber:1,
          handId:"hand-reject",
          startedAtMs:0,
          endsAtMs:15_000,
        },
        bettingClosesAtMs:null,
      },
      stateVersion:2,
      eventSequence:3,
    };

    const client=createBlackjackPlayerActionClient({
      socket,
      getSnapshot:()=>snapshot,
      getViewContext:()=>({
        localPlayerId:"local-player",
        availableBalanceCents:100_000,
      }),
      createActionId:()=>"reject-1",
    });

    client.submit("HIT");
    expect(client.isPending()).toBe(true);
    client.receive({
      type:"ACTION_REJECTED",
      actionId:"reject-1",
      error:"STALE_ACTION",
    });
    expect(client.isPending()).toBe(false);
    expect(client.getFeedback()).toEqual({
      status:"REJECTED",
      actionId:"reject-1",
      actionType:"HIT",
      error:"STALE_ACTION",
    });

    client.clearFeedback();
    expect(client.getFeedback()).toBeNull();
    client.detach();
    expect(listeners.size).toBe(0);
  });

  it("renders pending and rejected action feedback without exposing protocol internals", () => {
    const base = {
      phaseLabel:"PLAYER TURNS",
      balanceLabel:"1K",
      betLabel:"100",
      turnLabel:"YOUR TURN · 10s",
      dealerTotalLabel:"10 + ?",
      seats:[
        { seatNumber:1 as const,label:"YOUR SEAT",status:"ACTIVE" as const,total:16,betLabel:"100",isLocal:true },
        { seatNumber:2 as const,label:"OPEN SEAT",status:"EMPTY" as const,total:null,betLabel:null,isLocal:false },
        { seatNumber:3 as const,label:"OPEN SEAT",status:"EMPTY" as const,total:null,betLabel:null,isLocal:false },
        { seatNumber:4 as const,label:"OPEN SEAT",status:"EMPTY" as const,total:null,betLabel:null,isLocal:false },
        { seatNumber:5 as const,label:"OPEN SEAT",status:"EMPTY" as const,total:null,betLabel:null,isLocal:false },
      ],
    };

    const processing=renderBlackjackTableShell({
      ...base,
      actionStatusLabel:"HIT · PROCESSING",
      actionStatusTone:"neutral",
      enabledActions:[],
    });
    expect(processing).toContain("HIT · PROCESSING");
    expect(processing).toContain('data-action-tone="neutral"');

    const rejected=renderBlackjackTableShell({
      ...base,
      actionStatusLabel:"TABLE UPDATED · TRY AGAIN",
      actionStatusTone:"error",
      enabledActions:["HIT","STAND"],
    });
    expect(rejected).toContain("TABLE UPDATED · TRY AGAIN");
    expect(rejected).toContain('data-action-tone="error"');
  });

});
