import {
  BLACKJACK_DEFAULT_BETTING_PANEL,
  renderBlackjackBettingPanel,
  type BlackjackBettingPanelViewModel,
} from "./bettingView";

export const BLACKJACK_TABLE_SEAT_NUMBERS = [1, 2, 3, 4, 5] as const;

export type BlackjackCardViewModel = Readonly<{
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "CLUBS" | "DIAMONDS" | "HEARTS" | "SPADES";
}>;

export type BlackjackTableSeatViewModel = Readonly<{
  seatNumber: 1 | 2 | 3 | 4 | 5;
  label: string;
  status: "EMPTY" | "WAITING" | "ACTIVE" | "STOOD" | "BUST" | "BLACKJACK";
  total: number | null;
  betLabel: string | null;
  isLocal: boolean;
  canClaim?: boolean;
  canLeave?: boolean;
  isSelectedForClaim?: boolean;
  cards?: readonly BlackjackCardViewModel[];
}>;

export type BlackjackTableAction = "HIT" | "STAND" | "DOUBLE" | "SPLIT";
export type BlackjackInteractionMode =
  | "SEAT"
  | "BETTING"
  | "TURN"
  | "WAIT";
export type BlackjackDrawer = "BET" | "INFO";

export type BlackjackTableViewModel = Readonly<{
  phaseLabel: string;
  balanceLabel: string;
  betLabel: string;
  turnLabel: string;
  dealerTotalLabel: string;
  dealerCards?: readonly (BlackjackCardViewModel | null)[];
  enabledActions?: readonly BlackjackTableAction[];
  actionStatusLabel?: string | null;
  actionStatusTone?: "neutral" | "success" | "error";
  interactionMode?: BlackjackInteractionMode;
  interactionPrompt?: string;
  selectedSeatForClaim?: 1 | 2 | 3 | 4 | 5 | null;
  seatClaimPending?: boolean;
  openDrawer?: BlackjackDrawer | null;
  canOpenBetDrawer?: boolean;
  occupiedSeatsLabel?: string;
  connectionStatus?: Readonly<{
    label: string;
    tone: "connecting" | "live" | "reconnecting" | "error";
  }>;
  roundResult?: Readonly<{
    title: string;
    detail: string;
    tone: "win" | "push" | "loss";
  }> | null;
  bettingPanel?: BlackjackBettingPanelViewModel;
  seats: readonly BlackjackTableSeatViewModel[];
}>;

export const BLACKJACK_DEFAULT_TABLE_VIEW: BlackjackTableViewModel =
  Object.freeze({
    phaseLabel: "WAITING FOR TABLE",
    balanceLabel: "10,000",
    betLabel: "0",
    turnLabel: "MULTIPLAYER TABLE",
    dealerTotalLabel: "DEALER",
    interactionMode:"WAIT",
    interactionPrompt:"CHOOSE A SEAT TO JOIN",
    selectedSeatForClaim:null,
    seatClaimPending:false,
    openDrawer:null,
    canOpenBetDrawer:false,
    occupiedSeatsLabel:"0 / 5 SEATED",
    connectionStatus:Object.freeze({
      label:"CONNECTING",
      tone:"connecting" as const,
    }),
    seats: Object.freeze(
      BLACKJACK_TABLE_SEAT_NUMBERS.map((seatNumber) =>
        Object.freeze({
          seatNumber,
          label: "OPEN SEAT",
          status: "EMPTY" as const,
          total: null,
          betLabel: null,
          isLocal: false,
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

function cardSuitSymbol(suit: BlackjackCardViewModel["suit"]): string {
  switch (suit) {
    case "CLUBS": return "♣";
    case "DIAMONDS": return "♦";
    case "HEARTS": return "♥";
    case "SPADES": return "♠";
  }
}

function renderCard(
  card: BlackjackCardViewModel | null,
  className = "",
): string {
  if (card === null) {
    return `<span class="blackjack-card-placeholder blackjack-card-face is-hole ${className}" data-card-hidden="true" aria-label="Hidden card"></span>`;
  }

  const red = card.suit === "HEARTS" || card.suit === "DIAMONDS";
  const symbol = cardSuitSymbol(card.suit);
  return `
    <span
      class="blackjack-card-placeholder blackjack-card-face${red ? " is-red" : ""} ${className}"
      data-card-rank="${card.rank}"
      data-card-suit="${card.suit}"
      aria-label="${card.rank} of ${card.suit.toLowerCase()}"
    >
      <strong>${card.rank}</strong>
      <span aria-hidden="true">${symbol}</span>
    </span>
  `;
}

export function renderBlackjackCardStack(
  cards: readonly (BlackjackCardViewModel | null)[] | undefined,
  fallbackCount: number,
  className = "",
): string {
  if (cards && cards.length > 0) {
    return cards.map((card) => renderCard(card, className)).join("");
  }

  return Array.from({ length: fallbackCount }, () =>
    `<span class="blackjack-card-placeholder ${className}"></span>`,
  ).join("");
}

export function renderBlackjackSeat(seat: BlackjackTableSeatViewModel): string {
  const total =
    seat.total === null
      ? ""
      : `<strong class="blackjack-seat-total">${seat.total}</strong>`;
  const bet =
    seat.betLabel === null
      ? ""
      : `<span class="blackjack-seat-bet">BET ${escapeHtml(seat.betLabel)}</span>`;
  const seatAction =
    seat.canLeave
      ? `<button type="button" class="blackjack-seat-action is-leave" data-blackjack-seat-action="LEAVE" data-seat="${seat.seatNumber}">LEAVE</button>`
      : "";
  const claimable = seat.canClaim === true;

  return `
    <article
      class="blackjack-seat blackjack-seat-${seat.seatNumber}${seat.isLocal ? " is-local" : ""}${claimable ? " is-claimable" : ""}${seat.isSelectedForClaim ? " is-selected-for-claim" : ""}"
      data-seat="${seat.seatNumber}"
      data-status="${seat.status}"
      data-local="${seat.isLocal ? "true" : "false"}"
      data-blackjack-seat-select="${claimable ? "true" : "false"}"
      aria-label="Blackjack seat ${seat.seatNumber}${claimable ? ", available" : ""}"
      ${claimable ? 'role="button" tabindex="0"' : ""}
    >
      <div class="blackjack-seat-cards" aria-label="Seat ${seat.seatNumber} cards">
        ${renderBlackjackCardStack(seat.cards, 2)}
      </div>
      <div class="blackjack-seat-copy">
        <span class="blackjack-seat-label">${escapeHtml(seat.label)}</span>
        ${total}
        ${bet}
        ${seatAction}
      </div>
    </article>
  `;
}

export function renderBlackjackTableShell(
  model: BlackjackTableViewModel = BLACKJACK_DEFAULT_TABLE_VIEW,
): string {
  const enabledActions = new Set(model.enabledActions ?? []);
  const actionDisabled = (action: BlackjackTableAction) =>
    enabledActions.has(action) ? "" : " disabled";
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
        <div
          class="blackjack-topbar-status"
          data-connection-tone="${model.connectionStatus?.tone ?? "connecting"}"
        >
          <span class="blackjack-live-dot" aria-hidden="true"></span>
          <span class="blackjack-connection-label">${escapeHtml(model.connectionStatus?.label ?? "CONNECTING")}</span>
          <span class="blackjack-turn-label">${escapeHtml(model.turnLabel)}</span>
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
              <div class="blackjack-dealer-cards" aria-label="Dealer cards">
                ${renderBlackjackCardStack(model.dealerCards, 2, "is-dealer")}
              </div>
              <strong class="blackjack-dealer-total">${escapeHtml(model.dealerTotalLabel)}</strong>
            </section>

            <div class="blackjack-seat-arc" aria-label="Five player seats">
              ${orderedSeats.map(renderBlackjackSeat).join("")}
            </div>

            <div class="blackjack-table-rule">
              <span>BLACKJACK PAYS 3:2</span>
              <span>DEALER STANDS ON 17</span>
            </div>
          </div>
        </div>
      </section>

      <section
        class="blackjack-hud"
        aria-label="Blackjack controls"
        data-interaction-mode="${model.interactionMode ?? "WAIT"}"
      >
        <div class="blackjack-status-strip">
          <div class="blackjack-dock-stat blackjack-dock-phase">
            <span>PHASE</span>
            <strong data-blackjack-stat="phase">${escapeHtml(model.phaseLabel)}</strong>
          </div>
          <div class="blackjack-dock-stat">
            <span>BALANCE</span>
            <strong data-blackjack-stat="balance">${escapeHtml(model.balanceLabel)}</strong>
          </div>
          <div class="blackjack-dock-stat">
            <span>BET</span>
            <strong data-blackjack-stat="bet">${escapeHtml(model.betLabel)}</strong>
          </div>
          <div class="blackjack-dock-actions" aria-label="Table panels">
            <button
              type="button"
              data-blackjack-drawer-toggle="BET"
              aria-controls="blackjack-bet-drawer"
              aria-expanded="${model.openDrawer === "BET" ? "true" : "false"}"
              ${model.canOpenBetDrawer ? "" : "disabled"}
            >BET</button>
            <button
              type="button"
              data-blackjack-drawer-toggle="INFO"
              aria-controls="blackjack-info-drawer"
              aria-expanded="${model.openDrawer === "INFO" ? "true" : "false"}"
            >TABLE</button>
          </div>
        </div>

        <div class="blackjack-context-strip" aria-live="polite">
          <strong class="blackjack-context-prompt">${escapeHtml(model.interactionPrompt ?? "WAITING FOR TABLE")}</strong>
          <div
            class="blackjack-seat-confirm"
            data-blackjack-seat-confirm
            ${model.selectedSeatForClaim ? "" : "hidden"}
          >
            <span>SEAT <strong data-blackjack-selected-seat>${model.selectedSeatForClaim ?? "—"}</strong></span>
            <button type="button" data-blackjack-seat-confirm-action="CANCEL"${model.seatClaimPending ? " disabled" : ""}>CANCEL</button>
            <button type="button" data-blackjack-seat-confirm-action="CONFIRM"${model.seatClaimPending ? " disabled" : ""}>TAKE SEAT</button>
          </div>
        </div>

        <div
          class="blackjack-drawer-backdrop"
          data-blackjack-drawer-close
          ${model.openDrawer ? "" : "hidden"}
          aria-hidden="true"
        ></div>

        <section
          id="blackjack-bet-drawer"
          class="blackjack-drawer blackjack-betting-region"
          data-blackjack-drawer="BET"
          aria-label="Bet controls"
          aria-hidden="${model.openDrawer === "BET" ? "false" : "true"}"
          ${model.openDrawer === "BET" ? "" : "hidden"}
        >
          <div class="blackjack-drawer-head">
            <div>
              <span>BETTING</span>
              <strong>CHIPS & WAGER</strong>
            </div>
            <button type="button" data-blackjack-drawer-close aria-label="Close bet controls">×</button>
          </div>
          ${renderBlackjackBettingPanel(
            model.bettingPanel ?? {
              ...BLACKJACK_DEFAULT_BETTING_PANEL,
              totalBetLabel: model.betLabel,
            },
          )}
        </section>

        <section
          id="blackjack-info-drawer"
          class="blackjack-drawer blackjack-info-drawer"
          data-blackjack-drawer="INFO"
          aria-label="Table information"
          aria-hidden="${model.openDrawer === "INFO" ? "false" : "true"}"
          ${model.openDrawer === "INFO" ? "" : "hidden"}
        >
          <div class="blackjack-drawer-head">
            <div>
              <span>TABLE</span>
              <strong>LIVE INFO</strong>
            </div>
            <button type="button" data-blackjack-drawer-close aria-label="Close table information">×</button>
          </div>
          <div class="blackjack-info-grid">
            <div><span>PHASE</span><strong data-blackjack-info="phase">${escapeHtml(model.phaseLabel)}</strong></div>
            <div><span>PLAYERS</span><strong data-blackjack-info="players">${escapeHtml(model.occupiedSeatsLabel ?? "0 / 5 SEATED")}</strong></div>
            <div><span>BLACKJACK</span><strong>3:2</strong></div>
            <div><span>DEALER</span><strong>STANDS ON 17</strong></div>
          </div>
        </section>

        <div class="blackjack-actions" aria-label="Player actions" ${model.interactionMode === "TURN" ? "" : "hidden"}>
          <button type="button" data-blackjack-action="HIT"${actionDisabled("HIT")}>HIT</button>
          <button type="button" data-blackjack-action="STAND"${actionDisabled("STAND")}>STAND</button>
          <button type="button" data-blackjack-action="DOUBLE"${actionDisabled("DOUBLE")}${enabledActions.has("DOUBLE") ? "" : " hidden"}>DOUBLE</button>
          <button type="button" data-blackjack-action="SPLIT"${actionDisabled("SPLIT")}${enabledActions.has("SPLIT") ? "" : " hidden"}>SPLIT</button>
          <span
            class="blackjack-action-feedback"
            data-action-tone="${model.actionStatusTone ?? "neutral"}"
            aria-live="polite"
          >${model.actionStatusLabel ? escapeHtml(model.actionStatusLabel) : ""}</span>
        </div>

        <div data-blackjack-region="round-result">
          ${model.roundResult
            ? `
              <div
                class="blackjack-round-result"
                data-result-tone="${model.roundResult.tone}"
                aria-live="polite"
              >
                <strong>${escapeHtml(model.roundResult.title)}</strong>
                <span>${escapeHtml(model.roundResult.detail)}</span>
              </div>
            `
            : ""}
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
