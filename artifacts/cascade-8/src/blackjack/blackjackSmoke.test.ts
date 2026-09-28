import { describe, expect, it } from "vitest";
import {
  BLACKJACK_MAX_SEATS,
  BLACKJACK_ROUTE,
  BLACKJACK_SHELL_MARKUP,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  buildBlackjackTableViewModelFromSnapshot,
  renderBlackjackTableShell,
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

});
