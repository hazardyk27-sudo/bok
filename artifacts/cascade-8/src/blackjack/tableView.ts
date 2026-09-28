import { BLACKJACK_DEFAULT_BETTING_PANEL, renderBlackjackBettingPanel } from "./bettingView";

export const BLACKJACK_TABLE_SEAT_NUMBERS = [1, 2, 3, 4, 5] as const;

export type BlackjackTableSeatViewModel = Readonly<{
  seatNumber: 1 | 2 | 3 | 4 | 5;
  label: string;
  status: "EMPTY" | "WAITING" | "ACTIVE" | "STOOD" | "BUST" | "BLACKJACK";
  total: number | null;
  betLabel: string | null;
  isLocal: boolean;
}>;

export type BlackjackTableViewModel = Readonly<{
  phaseLabel: string;
  balanceLabel: string;
  betLabel: string;
  turnLabel: string;
  dealerTotalLabel: string;
  seats: readonly BlackjackTableSeatViewModel[];
}>;

export const BLACKJACK_DEFAULT_TABLE_VIEW: BlackjackTableViewModel =
  Object.freeze({
    phaseLabel: "WAITING FOR TABLE",
    balanceLabel: "10,000",
    betLabel: "0",
    turnLabel: "MULTIPLAYER TABLE",
    dealerTotalLabel: "DEALER",
    seats: Object.freeze(
      BLACKJACK_TABLE_SEAT_NUMBERS.map((seatNumber) =>
        Object.freeze({
          seatNumber,
          label: seatNumber === 3 ? "YOUR SEAT" : "OPEN SEAT",
          status: "EMPTY" as const,
          total: null,
          betLabel: null,
          isLocal: seatNumber === 3,
        }),
      ),
    ),
  });

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSeat(seat: BlackjackTableSeatViewModel): string {
  const total =
    seat.total === null
      ? ""
      : `<strong class="blackjack-seat-total">${seat.total}</strong>`;
  const bet =
    seat.betLabel === null
      ? ""
      : `<span class="blackjack-seat-bet">BET ${escapeHtml(seat.betLabel)}</span>`;

  return `
    <article
      class="blackjack-seat blackjack-seat-${seat.seatNumber}${seat.isLocal ? " is-local" : ""}"
      data-seat="${seat.seatNumber}"
      data-status="${seat.status}"
      data-local="${seat.isLocal ? "true" : "false"}"
      aria-label="Blackjack seat ${seat.seatNumber}"
    >
      <div class="blackjack-seat-cards" aria-hidden="true">
        <span class="blackjack-card-placeholder"></span>
        <span class="blackjack-card-placeholder"></span>
      </div>
      <div class="blackjack-seat-copy">
        <span class="blackjack-seat-label">${escapeHtml(seat.label)}</span>
        ${total}
        ${bet}
      </div>
    </article>
  `;
}

export function renderBlackjackTableShell(
  model: BlackjackTableViewModel = BLACKJACK_DEFAULT_TABLE_VIEW,
): string {
  const orderedSeats = [...model.seats].sort(
    (left, right) => left.seatNumber - right.seatNumber,
  );

  if (orderedSeats.length !== 5) {
    throw new Error("Blackjack table view requires exactly five seats");
  }

  return `
    <main class="blackjack-root" data-game="blackjack" data-phase="table-shell">
      <header class="blackjack-topbar">
        <a class="blackjack-back" href="/" aria-label="Return to game menu">←</a>
        <div class="blackjack-brand">
          <span class="blackjack-brand-kicker">THE NIGHT TABLE</span>
          <strong>BLACKJACK</strong>
        </div>
        <div class="blackjack-topbar-status">
          <span class="blackjack-live-dot" aria-hidden="true"></span>
          <span>${escapeHtml(model.turnLabel)}</span>
        </div>
      </header>

      <section class="blackjack-stage" aria-label="Blackjack multiplayer table">
        <div class="blackjack-table-frame">
          <div class="blackjack-table-felt">
            <div class="blackjack-felt-line" aria-hidden="true"></div>

            <section class="blackjack-dealer-zone" aria-label="Dealer">
              <span class="blackjack-dealer-kicker">DEALER</span>
              <div class="blackjack-shoe" aria-label="Card shoe">
                <i></i><i></i><i></i>
              </div>
              <div class="blackjack-dealer-cards" aria-hidden="true">
                <span class="blackjack-card-placeholder is-dealer"></span>
                <span class="blackjack-card-placeholder is-hole"></span>
              </div>
              <strong class="blackjack-dealer-total">${escapeHtml(model.dealerTotalLabel)}</strong>
            </section>

            <div class="blackjack-seat-arc" aria-label="Five player seats">
              ${orderedSeats.map(renderSeat).join("")}
            </div>

            <div class="blackjack-table-rule">
              <span>BLACKJACK PAYS 3:2</span>
              <span>DEALER STANDS ON 17</span>
            </div>
          </div>
        </div>
      </section>

      <section class="blackjack-hud" aria-label="Blackjack controls">
        <div class="blackjack-status-strip">
          <div>
            <span>PHASE</span>
            <strong>${escapeHtml(model.phaseLabel)}</strong>
          </div>
          <div>
            <span>BALANCE</span>
            <strong>${escapeHtml(model.balanceLabel)}</strong>
          </div>
          <div>
            <span>BET</span>
            <strong>${escapeHtml(model.betLabel)}</strong>
          </div>
        </div>

        ${renderBlackjackBettingPanel({
          ...BLACKJACK_DEFAULT_BETTING_PANEL,
          totalBetLabel: model.betLabel,
        })}

        <div class="blackjack-actions" aria-label="Player actions">
          <button type="button" data-blackjack-action="HIT" disabled>HIT</button>
          <button type="button" data-blackjack-action="STAND" disabled>STAND</button>
          <button type="button" data-blackjack-action="DOUBLE" disabled>DOUBLE</button>
          <button type="button" data-blackjack-action="SPLIT" disabled>SPLIT</button>
        </div>
      </section>

      <footer class="blackjack-footnote">
        <span>VIRTUAL CREDITS ONLY</span>
        <span aria-hidden="true">•</span>
        <span>5 PLAYER SHARED TABLE</span>
      </footer>
    </main>
  `;
}
