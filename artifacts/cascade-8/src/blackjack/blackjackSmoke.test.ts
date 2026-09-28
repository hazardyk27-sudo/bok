import { describe, expect, it } from "vitest";
import {
  BLACKJACK_MAX_SEATS,
  BLACKJACK_ROUTE,
  BLACKJACK_SHELL_MARKUP,
  BLACKJACK_TABLE_SEAT_NUMBERS,
  renderBlackjackTableShell,
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
});
