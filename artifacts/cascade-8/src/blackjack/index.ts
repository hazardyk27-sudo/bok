import "./blackjack.css";
import "./mobile.css";
import "./seatState.css";
import "./betting.css";
import {
  addSeatChip,
  clearSeatBet,
  createInitialSeatState,
  doubleSeatBet,
  getOccupiedSeats,
  getSeat,
  getTotalSeatBet,
  isBlackjackChipValue,
  leaveSeat,
  selectSeat,
  sitAtSeat,
  undoSeatChip,
  type BlackjackChipValue,
  type BlackjackSeat,
  type BlackjackSeatId,
  type BlackjackSeatState,
} from "./seatState";

type DemoCard = { rank: string; suit: string; red?: boolean };

type DemoHand = {
  total: number;
  cards: DemoCard[];
};

const TABLE_MIN = 10;

const DEMO_HANDS: Partial<Record<BlackjackSeatId, DemoHand>> = {
  1: {
    total: 19,
    cards: [
      { rank: "A", suit: "♠" },
      { rank: "8", suit: "♠" },
    ],
  },
  3: {
    total: 16,
    cards: [
      { rank: "9", suit: "♥", red: true },
      { rank: "7", suit: "♦", red: true },
    ],
  },
  5: {
    total: 16,
    cards: [
      { rank: "K", suit: "♠" },
      { rank: "6", suit: "♣" },
    ],
  },
};

const CHIP_VARIANT: Record<BlackjackChipValue, string> = {
  1: "white",
  5: "red",
  25: "green",
  100: "blue",
  500: "black",
};

function renderCard(card: DemoCard) {
  return `
    <div class="bj-card${card.red ? " bj-card--red" : ""}" aria-label="${card.rank}${card.suit}">
      <span class="bj-card__rank">${card.rank}</span>
      <span class="bj-card__suit">${card.suit}</span>
      <span class="bj-card__pip">${card.suit}</span>
    </div>
  `;
}

function renderWagerChips(seat: BlackjackSeat) {
  if (seat.chips.length === 0) {
    return "";
  }

  return `
    <div class="bj-seat__chip-stack" aria-label="Seat ${seat.id} wager chips">
      ${seat.chips.slice(-4).map((chip, index) => `
        <span
          class="bj-wager-chip bj-wager-chip--${CHIP_VARIANT[chip]}"
          style="--bj-chip-index:${index}"
          aria-label="$${chip} chip"
        ><span>${chip}</span></span>
      `).join("")}
    </div>
  `;
}

function renderEmptySeat(seat: BlackjackSeat) {
  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--empty" data-seat="${seat.id}" data-seat-status="empty">
      <div class="bj-seat__bet-circle">
        <div class="bj-seat__empty-icon" aria-hidden="true">♣</div>
        <div class="bj-seat__empty-copy">SEAT ${seat.id} · EMPTY</div>
        <button class="bj-seat__take-seat" type="button" data-seat-action="sit" data-seat-id="${seat.id}">TAKE SEAT</button>
      </div>
    </div>
  `;
}

function renderSeatedSeat(seat: BlackjackSeat, selected: boolean) {
  const remaining = Math.max(0, TABLE_MIN - seat.bet);

  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active bj-seat--seated${selected ? " is-selected" : ""}" data-seat="${seat.id}" data-seat-status="seated">
      <div class="bj-seat__bet-circle">
        <span class="bj-seat__waiting-icon" aria-hidden="true"></span>
        <strong class="bj-seat__waiting-title">SEAT ${seat.id}</strong>
        <span class="bj-seat__waiting-copy">${seat.bet > 0 ? `$${remaining} MORE TO MIN` : "SELECT CHIP TO BET"}</span>
      </div>
      ${renderWagerChips(seat)}
      ${seat.bet > 0 ? `<div class="bj-seat__bet">$${seat.bet}</div>` : ""}
      <button class="bj-seat__badge" type="button" data-seat-action="select" data-seat-id="${seat.id}" aria-pressed="${selected}">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>${selected ? "SELECTED" : "SEATED"}</small></span>
      </button>
      ${selected ? `<button class="bj-seat__leave" type="button" data-seat-action="leave" data-seat-id="${seat.id}">LEAVE SEAT</button>` : ""}
    </div>
  `;
}

function renderReadySeat(seat: BlackjackSeat, selected: boolean) {
  const hand = DEMO_HANDS[seat.id];

  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active${selected ? " is-selected" : ""}" data-seat="${seat.id}" data-seat-status="betReady">
      ${hand ? `<div class="bj-seat__total">${hand.total}</div>` : ""}
      <div class="bj-seat__cards">
        ${hand?.cards.map(renderCard).join("") ?? ""}
      </div>
      ${renderWagerChips(seat)}
      <div class="bj-seat__bet">$${seat.bet}</div>
      <button class="bj-seat__badge" type="button" data-seat-action="select" data-seat-id="${seat.id}" aria-pressed="${selected}">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>${selected ? "SELECTED" : "BET READY"}</small></span>
      </button>
      ${selected ? `<button class="bj-seat__leave" type="button" data-seat-action="leave" data-seat-id="${seat.id}">LEAVE SEAT</button>` : ""}
    </div>
  `;
}

function renderSeat(seat: BlackjackSeat, selectedSeatId: BlackjackSeatId | null) {
  const selected = seat.id === selectedSeatId;

  if (seat.status === "empty") {
    return renderEmptySeat(seat);
  }

  if (seat.status === "seated") {
    return renderSeatedSeat(seat, selected);
  }

  return renderReadySeat(seat, selected);
}

function chipButton(value: BlackjackChipValue, selectedChip: BlackjackChipValue) {
  const selected = value === selectedChip;
  return `
    <button
      class="bj-console-chip bj-console-chip--${CHIP_VARIANT[value]}${selected ? " is-selected" : ""}"
      type="button"
      data-chip-value="${value}"
      aria-label="Select $${value} chip"
      aria-pressed="${selected}"
    >
      <span>$${value}</span>
    </button>
  `;
}

function renderMobileSeatTabs(state: BlackjackSeatState) {
  return `
    <nav class="bj-mobile-seat-tabs" aria-label="Blackjack seats">
      ${state.seats.map((seat) => {
        const selected = state.selectedSeatId === seat.id;
        const occupied = seat.status !== "empty";
        const ready = seat.status === "betReady";
        const label = ready ? "READY" : occupied ? "SEATED" : "SIT";

        return `
          <button
            class="bj-mobile-seat-tab${selected ? " is-selected" : ""}${occupied ? " is-occupied is-seated" : ""}${ready ? " is-ready" : ""}"
            type="button"
            data-mobile-seat="${seat.id}"
            aria-label="Seat ${seat.id}, ${label.toLowerCase()}"
            aria-pressed="${selected}"
          >
            <strong>${seat.id}</strong>
            <small>${label}</small>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function renderStatusCopy(state: BlackjackSeatState, selectedChip: BlackjackChipValue) {
  const occupied = getOccupiedSeats(state);
  const selected = state.selectedSeatId;

  if (occupied.length === 0) {
    return "Choose a seat to start";
  }

  const selectedSeat = selected ? getSeat(state, selected) : null;
  const selectedBet = selectedSeat ? ` · Bet $${selectedSeat.bet}` : "";

  return `${occupied.length} seat${occupied.length === 1 ? "" : "s"} occupied${selected ? ` · Seat ${selected} selected` : ""}${selectedBet} · $${selectedChip} chip`;
}

function renderBlackjack(
  app: HTMLDivElement,
  state: BlackjackSeatState,
  selectedChip: BlackjackChipValue,
) {
  const totalBet = getTotalSeatBet(state);
  const selectedSeat = state.selectedSeatId ? getSeat(state, state.selectedSeatId) : null;
  const canPlaceBet = selectedSeat !== null && selectedSeat.status !== "empty";
  const hasSelectedBet = canPlaceBet && selectedSeat.bet > 0;

  app.innerHTML = `
    <main class="bj-root" data-blackjack-part="4b">
      <div class="bj-casino-backdrop" aria-hidden="true">
        <span class="bj-bokeh bj-bokeh--1"></span>
        <span class="bj-bokeh bj-bokeh--2"></span>
        <span class="bj-bokeh bj-bokeh--3"></span>
        <span class="bj-bokeh bj-bokeh--4"></span>
      </div>

      <section class="bj-stage" aria-label="Blackjack table">
        <aside class="bj-hud bj-hud--bankroll">
          <div class="bj-hud__pair">
            <span>BALANCE</span>
            <strong>$2,450.00</strong>
          </div>
          <div class="bj-hud__pair">
            <span>TOTAL BET</span>
            <strong>$${totalBet.toFixed(2)}</strong>
          </div>
          <div class="bj-hud__min">
            <span>TABLE MIN</span>
            <strong>$${TABLE_MIN}</strong>
          </div>
        </aside>

        <aside class="bj-hud bj-hud--status">
          <span>ROUND STATUS</span>
          <strong>PLACE YOUR BETS</strong>
          <small>${renderStatusCopy(state, selectedChip)}</small>
        </aside>

        <div class="bj-dealer-zone" aria-label="Dealer">
          <div class="bj-chip-rack" aria-hidden="true">
            <span class="bj-rack-chip bj-rack-chip--black"></span>
            <span class="bj-rack-chip bj-rack-chip--green"></span>
            <span class="bj-rack-chip bj-rack-chip--red"></span>
            <span class="bj-rack-chip bj-rack-chip--purple"></span>
            <span class="bj-rack-chip bj-rack-chip--gold"></span>
          </div>

          <div class="bj-dealer-figure" aria-hidden="true">
            <div class="bj-dealer-figure__hair"></div>
            <div class="bj-dealer-figure__head"></div>
            <div class="bj-dealer-figure__neck"></div>
            <div class="bj-dealer-figure__torso">
              <span class="bj-dealer-figure__shirt"></span>
              <span class="bj-dealer-figure__vest"></span>
              <span class="bj-dealer-figure__bow"></span>
            </div>
            <div class="bj-dealer-figure__arms"></div>
            <div class="bj-dealer-figure__hands"></div>
          </div>

          <div class="bj-shoe" aria-hidden="true">
            <div class="bj-shoe__deck"></div>
          </div>
          <div class="bj-discard" aria-hidden="true">
            <div class="bj-discard__cards"></div>
            <span>DISCARD</span>
          </div>
        </div>

        <div class="bj-table-shell">
          <div class="bj-rail bj-rail--outer"></div>
          <div class="bj-rail bj-rail--inner"></div>
          <div class="bj-felt">
            <div class="bj-dealer-hand">
              <div class="bj-dealer-hand__label">DEALER</div>
              <div class="bj-dealer-hand__cards">
                ${renderCard({ rank: "Q", suit: "♠" })}
                ${renderCard({ rank: "2", suit: "♥", red: true })}
                <span class="bj-dealer-hand__total">12</span>
              </div>
            </div>

            <div class="bj-table-copy" aria-hidden="true">
              <div>BLACKJACK PAYS 3 TO 2</div>
              <span>DEALER MUST HIT SOFT 17</span>
              <div>INSURANCE PAYS 2 TO 1</div>
            </div>

            <div class="bj-table-arc bj-table-arc--outer" aria-hidden="true"></div>
            <div class="bj-table-arc bj-table-arc--inner" aria-hidden="true"></div>

            <div class="bj-seats">
              ${state.seats.map((seat) => renderSeat(seat, state.selectedSeatId)).join("")}
            </div>
          </div>
        </div>

        ${renderMobileSeatTabs(state)}

        <section class="bj-console" aria-label="Blackjack controls">
          <div class="bj-console__chips" aria-label="Select chip">
            <button class="bj-chip-arrow" type="button" aria-label="Previous chips">‹</button>
            ${chipButton(1, selectedChip)}
            ${chipButton(5, selectedChip)}
            ${chipButton(25, selectedChip)}
            ${chipButton(100, selectedChip)}
            ${chipButton(500, selectedChip)}
            <button class="bj-chip-arrow" type="button" aria-label="Next chips">›</button>
          </div>

          <div class="bj-console__bet-actions">
            <button class="bj-action bj-action--place" type="button" data-bet-action="place" ${canPlaceBet ? "" : "disabled"}>
              <span class="bj-action__icon">＋</span>
              <span><strong>PLACE BET</strong><small>${state.selectedSeatId ? `Seat ${state.selectedSeatId} · +$${selectedChip}` : "Select seat"}</small></span>
            </button>
            <button class="bj-action bj-action--neutral" type="button" data-bet-action="undo" ${hasSelectedBet ? "" : "disabled"}>
              <span class="bj-action__icon">↶</span>
              <span><strong>UNDO</strong><small>${hasSelectedBet ? "Last chip" : "No bet"}</small></span>
            </button>
            <button class="bj-action bj-action--gold" type="button" data-bet-action="double" ${hasSelectedBet ? "" : "disabled"}>
              <span class="bj-action__icon">X2</span>
              <span><strong>X2 BET</strong><small>${hasSelectedBet ? `+$${selectedSeat?.bet ?? 0}` : "Place bet first"}</small></span>
            </button>
            <button class="bj-action bj-action--neutral" type="button" data-bet-action="clear" ${hasSelectedBet ? "" : "disabled"}>
              <span class="bj-action__icon">⌫</span>
              <span><strong>CLEAR BET</strong><small>${hasSelectedBet ? `Return $${selectedSeat?.bet ?? 0}` : "No bet"}</small></span>
            </button>
          </div>

          <div class="bj-console__round-actions" aria-label="In round actions">
            <button class="bj-round-action bj-round-action--hit" type="button" disabled>HIT</button>
            <button class="bj-round-action bj-round-action--stand" type="button" disabled>STAND</button>
            <button class="bj-round-action bj-round-action--double" type="button" disabled>DOUBLE</button>
            <button class="bj-round-action bj-round-action--split" type="button" disabled>SPLIT</button>
          </div>
        </section>
      </section>
    </main>
  `;
}

function parseSeatId(value: string | undefined): BlackjackSeatId | null {
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 5 ? (parsed as BlackjackSeatId) : null;
}

export function mountBlackjack(app: HTMLDivElement) {
  let state = createInitialSeatState();
  let selectedChip: BlackjackChipValue = 25;

  const rerender = () => renderBlackjack(app, state, selectedChip);

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const chipButton = target.closest<HTMLElement>("[data-chip-value]");
    if (chipButton) {
      const chipValue = Number(chipButton.dataset.chipValue);
      if (!isBlackjackChipValue(chipValue)) {
        return;
      }

      selectedChip = chipValue;
      rerender();
      return;
    }

    const betAction = target.closest<HTMLElement>("[data-bet-action]");
    if (betAction) {
      if (!state.selectedSeatId) {
        return;
      }

      switch (betAction.dataset.betAction) {
        case "place":
          state = addSeatChip(state, state.selectedSeatId, selectedChip, TABLE_MIN);
          break;
        case "undo":
          state = undoSeatChip(state, state.selectedSeatId, TABLE_MIN);
          break;
        case "double":
          state = doubleSeatBet(state, state.selectedSeatId, TABLE_MIN);
          break;
        case "clear":
          state = clearSeatBet(state, state.selectedSeatId);
          break;
        default:
          return;
      }

      rerender();
      return;
    }

    const mobileSeat = target.closest<HTMLElement>("[data-mobile-seat]");
    if (mobileSeat) {
      const seatId = parseSeatId(mobileSeat.dataset.mobileSeat);
      if (!seatId) {
        return;
      }

      state = getSeat(state, seatId).status === "empty"
        ? sitAtSeat(state, seatId)
        : selectSeat(state, seatId);
      rerender();
      return;
    }

    const action = target.closest<HTMLElement>("[data-seat-action]");
    if (!action) {
      return;
    }

    const seatId = parseSeatId(action.dataset.seatId);
    if (!seatId) {
      return;
    }

    switch (action.dataset.seatAction) {
      case "sit":
        state = sitAtSeat(state, seatId);
        break;
      case "select":
        state = selectSeat(state, seatId);
        break;
      case "leave":
        state = leaveSeat(state, seatId);
        break;
      default:
        return;
    }

    rerender();
  });

  rerender();
}
