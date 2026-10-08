import "./blackjack.css";
import "./mobile.css";
import "./seatState.css";
import "./betting.css";
import "./round.css";
import {
  evaluateBlackjackHand,
  type BlackjackCard,
  type BlackjackSuit,
} from "./blackjackCore";
import {
  getBlackjackRoundReadiness,
  startBlackjackRound,
  type BlackjackRoundState,
} from "./roundState";
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
import { createBlackjackShoe, type BlackjackShoe } from "./shoe";

const TABLE_MIN = 10;

const CHIP_VARIANT: Record<BlackjackChipValue, string> = {
  1: "white",
  5: "red",
  25: "green",
  100: "blue",
  500: "black",
};

const SUIT_SYMBOL: Record<BlackjackSuit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

function renderCard(card: BlackjackCard, hidden = false) {
  if (hidden) {
    return `<div class="bj-card bj-card--back" aria-label="Dealer hole card"></div>`;
  }

  const suit = SUIT_SYMBOL[card.suit];
  const red = card.suit === "diamonds" || card.suit === "hearts";

  return `
    <div class="bj-card${red ? " bj-card--red" : ""}" aria-label="${card.rank}${suit}">
      <span class="bj-card__rank">${card.rank}</span>
      <span class="bj-card__suit">${suit}</span>
      <span class="bj-card__pip">${suit}</span>
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

function renderEmptySeat(seat: BlackjackSeat, locked = false) {
  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--empty" data-seat="${seat.id}" data-seat-status="empty">
      <div class="bj-seat__bet-circle">
        <div class="bj-seat__empty-icon" aria-hidden="true">♣</div>
        <div class="bj-seat__empty-copy">SEAT ${seat.id} · EMPTY</div>
        ${locked
          ? `<span class="bj-round-lock-note">ROUND IN PROGRESS</span>`
          : `<button class="bj-seat__take-seat" type="button" data-seat-action="sit" data-seat-id="${seat.id}">TAKE SEAT</button>`}
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
  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active${selected ? " is-selected" : ""}" data-seat="${seat.id}" data-seat-status="betReady">
      <div class="bj-seat__bet-circle"></div>
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

function renderBettingSeat(
  seat: BlackjackSeat,
  selectedSeatId: BlackjackSeatId | null,
) {
  const selected = seat.id === selectedSeatId;

  if (seat.status === "empty") {
    return renderEmptySeat(seat);
  }

  if (seat.status === "seated") {
    return renderSeatedSeat(seat, selected);
  }

  return renderReadySeat(seat, selected);
}

function renderRoundSeat(
  seat: BlackjackSeat,
  round: BlackjackRoundState,
) {
  const hand = round.hands.find((candidate) => candidate.seatId === seat.id);

  if (!hand) {
    if (seat.status === "empty") {
      return renderEmptySeat(seat, true);
    }

    return `
      <div class="bj-seat bj-seat--${seat.id} bj-seat--active bj-seat--sitting-out" data-seat="${seat.id}" data-seat-status="sittingOut">
        <div class="bj-seat__bet-circle">SITTING OUT</div>
        <div class="bj-seat__badge bj-seat__round-badge">
          <span class="bj-seat__person" aria-hidden="true"></span>
          <span><strong>Seat ${seat.id}</strong><small>NO WAGER</small></span>
        </div>
      </div>
    `;
  }

  const value = evaluateBlackjackHand(hand.cards);
  const active = round.activeSeatId === seat.id;
  const blackjack = hand.status === "blackjack";
  const stateCopy = blackjack ? "BLACKJACK" : active ? "YOUR TURN" : "IN ROUND";

  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active${active ? " is-active-hand" : ""}${blackjack ? " is-blackjack" : ""}" data-seat="${seat.id}" data-seat-status="inRound">
      <div class="bj-seat__total">${value.total}</div>
      <div class="bj-seat__cards">
        ${hand.cards.map((card) => renderCard(card)).join("")}
      </div>
      ${renderWagerChips(seat)}
      <div class="bj-seat__bet">$${hand.wager}</div>
      <div class="bj-seat__badge bj-seat__round-badge">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>${stateCopy}</small></span>
      </div>
    </div>
  `;
}

function chipButton(
  value: BlackjackChipValue,
  selectedChip: BlackjackChipValue,
  locked: boolean,
) {
  const selected = value === selectedChip;
  return `
    <button
      class="bj-console-chip bj-console-chip--${CHIP_VARIANT[value]}${selected ? " is-selected" : ""}"
      type="button"
      data-chip-value="${value}"
      aria-label="Select $${value} chip"
      aria-pressed="${selected}"
      ${locked ? "disabled" : ""}
    >
      <span>$${value}</span>
    </button>
  `;
}

function renderMobileSeatTabs(
  state: BlackjackSeatState,
  round: BlackjackRoundState | null,
) {
  return `
    <nav class="bj-mobile-seat-tabs" aria-label="Blackjack seats">
      ${state.seats.map((seat) => {
        const hand = round?.hands.find((candidate) => candidate.seatId === seat.id);
        const selected = round
          ? round.activeSeatId === seat.id
          : state.selectedSeatId === seat.id;
        const occupied = seat.status !== "empty";
        const ready = seat.status === "betReady";
        const label = round
          ? hand?.status === "blackjack"
            ? "BJ"
            : hand
              ? selected
                ? "TURN"
                : "PLAY"
              : occupied
                ? "OUT"
                : "EMPTY"
          : ready
            ? "READY"
            : occupied
              ? "SEATED"
              : "SIT";

        return `
          <button
            class="bj-mobile-seat-tab${selected ? " is-selected" : ""}${occupied ? " is-occupied is-seated" : ""}${ready ? " is-ready" : ""}"
            type="button"
            data-mobile-seat="${seat.id}"
            aria-label="Seat ${seat.id}, ${label.toLowerCase()}"
            aria-pressed="${selected}"
            ${round ? "disabled" : ""}
          >
            <strong>${seat.id}</strong>
            <small>${label}</small>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function renderBettingStatusCopy(
  state: BlackjackSeatState,
  selectedChip: BlackjackChipValue,
) {
  const readiness = getBlackjackRoundReadiness(state, TABLE_MIN);

  if (readiness.blockingSeatIds.length > 0) {
    const seatId = readiness.blockingSeatIds[0];
    const seat = seatId ? getSeat(state, seatId) : null;
    const remaining = seat ? TABLE_MIN - seat.bet : TABLE_MIN;
    return `Seat ${seatId ?? "?"} needs $${remaining} more to reach table min`;
  }

  if (readiness.participatingSeatIds.length > 0) {
    return `${readiness.participatingSeatIds.length} hand${readiness.participatingSeatIds.length === 1 ? "" : "s"} ready · $${selectedChip} chip selected`;
  }

  if (getOccupiedSeats(state).length > 0) {
    return "Place at least one $10+ wager to deal";
  }

  return "Choose a seat to start";
}

function renderRoundStatusCopy(round: BlackjackRoundState) {
  if (round.dealer.blackjack) {
    return "Natural 21 · settlement pending";
  }

  if (round.phase === "playerTurns" && round.activeSeatId) {
    const activeHand = round.hands.find((hand) => hand.seatId === round.activeSeatId);
    const total = activeHand
      ? evaluateBlackjackHand(activeHand.cards).total
      : null;
    return `Seat ${round.activeSeatId} to act${total === null ? "" : ` · Total ${total}`}`;
  }

  return "Dealer resolution pending";
}

function renderDealerHand(round: BlackjackRoundState | null) {
  if (!round) {
    return `
      <div class="bj-dealer-hand">
        <div class="bj-dealer-hand__label">DEALER</div>
        <span class="bj-dealer-hand__waiting">WAITING FOR DEAL</span>
      </div>
    `;
  }

  const revealHoleCard = round.dealer.blackjack;
  const dealerTotal = revealHoleCard
    ? evaluateBlackjackHand(round.dealer.cards).total
    : "?";

  return `
    <div class="bj-dealer-hand">
      <div class="bj-dealer-hand__label">DEALER</div>
      <div class="bj-dealer-hand__cards">
        ${renderCard(round.dealer.cards[0])}
        ${renderCard(round.dealer.cards[1], !revealHoleCard)}
        <span class="bj-dealer-hand__total">${dealerTotal}</span>
      </div>
    </div>
  `;
}

function renderBlackjack(
  app: HTMLDivElement,
  state: BlackjackSeatState,
  selectedChip: BlackjackChipValue,
  round: BlackjackRoundState | null,
) {
  const totalBet = getTotalSeatBet(state);
  const selectedSeat = state.selectedSeatId ? getSeat(state, state.selectedSeatId) : null;
  const bettingLocked = round !== null;
  const canPlaceBet = !bettingLocked && selectedSeat !== null && selectedSeat.status !== "empty";
  const hasSelectedBet = canPlaceBet && selectedSeat.bet > 0;
  const readiness = getBlackjackRoundReadiness(state, TABLE_MIN);

  app.innerHTML = `
    <main class="bj-root" data-blackjack-part="5b">
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
          <strong>${round ? (round.dealer.blackjack ? "DEALER BLACKJACK" : round.phase === "playerTurns" ? "PLAYER TURN" : "DEALER CHECK") : "PLACE YOUR BETS"}</strong>
          <small>${round ? renderRoundStatusCopy(round) : renderBettingStatusCopy(state, selectedChip)}</small>
          ${round
            ? ""
            : `<button class="bj-deal-round" type="button" data-round-action="deal" ${readiness.canDeal ? "" : "disabled"}>DEAL${readiness.participatingSeatIds.length > 0 ? ` · ${readiness.participatingSeatIds.length} HAND${readiness.participatingSeatIds.length === 1 ? "" : "S"}` : ""}</button>`}
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
            ${renderDealerHand(round)}

            <div class="bj-table-copy" aria-hidden="true">
              <div>BLACKJACK PAYS 3 TO 2</div>
              <span>DEALER MUST HIT SOFT 17</span>
              <div>INSURANCE PAYS 2 TO 1</div>
            </div>

            <div class="bj-table-arc bj-table-arc--outer" aria-hidden="true"></div>
            <div class="bj-table-arc bj-table-arc--inner" aria-hidden="true"></div>

            <div class="bj-seats">
              ${state.seats.map((seat) =>
                round
                  ? renderRoundSeat(seat, round)
                  : renderBettingSeat(seat, state.selectedSeatId),
              ).join("")}
            </div>
          </div>
        </div>

        ${renderMobileSeatTabs(state, round)}

        <section class="bj-console" aria-label="Blackjack controls">
          <div class="bj-console__chips" aria-label="Select chip">
            <button class="bj-chip-arrow" type="button" aria-label="Previous chips" ${bettingLocked ? "disabled" : ""}>‹</button>
            ${chipButton(1, selectedChip, bettingLocked)}
            ${chipButton(5, selectedChip, bettingLocked)}
            ${chipButton(25, selectedChip, bettingLocked)}
            ${chipButton(100, selectedChip, bettingLocked)}
            ${chipButton(500, selectedChip, bettingLocked)}
            <button class="bj-chip-arrow" type="button" aria-label="Next chips" ${bettingLocked ? "disabled" : ""}>›</button>
          </div>

          <div class="bj-console__bet-actions">
            <button class="bj-action bj-action--place" type="button" data-bet-action="place" ${canPlaceBet ? "" : "disabled"}>
              <span class="bj-action__icon">＋</span>
              <span><strong>PLACE BET</strong><small>${bettingLocked ? "Round locked" : state.selectedSeatId ? `Seat ${state.selectedSeatId} · +$${selectedChip}` : "Select seat"}</small></span>
            </button>
            <button class="bj-action bj-action--neutral" type="button" data-bet-action="undo" ${hasSelectedBet ? "" : "disabled"}>
              <span class="bj-action__icon">↶</span>
              <span><strong>UNDO</strong><small>${hasSelectedBet ? "Last chip" : bettingLocked ? "Round locked" : "No bet"}</small></span>
            </button>
            <button class="bj-action bj-action--gold" type="button" data-bet-action="double" ${hasSelectedBet ? "" : "disabled"}>
              <span class="bj-action__icon">X2</span>
              <span><strong>X2 BET</strong><small>${hasSelectedBet ? `+$${selectedSeat?.bet ?? 0}` : bettingLocked ? "Round locked" : "Place bet first"}</small></span>
            </button>
            <button class="bj-action bj-action--neutral" type="button" data-bet-action="clear" ${hasSelectedBet ? "" : "disabled"}>
              <span class="bj-action__icon">⌫</span>
              <span><strong>CLEAR BET</strong><small>${hasSelectedBet ? `Return $${selectedSeat?.bet ?? 0}` : bettingLocked ? "Round locked" : "No bet"}</small></span>
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
  let shoe: BlackjackShoe = createBlackjackShoe();
  let round: BlackjackRoundState | null = null;

  const rerender = () => renderBlackjack(app, state, selectedChip, round);

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const roundAction = target.closest<HTMLElement>("[data-round-action]");
    if (roundAction?.dataset.roundAction === "deal" && round === null) {
      const result = startBlackjackRound(state, shoe, TABLE_MIN);
      round = result.round;
      shoe = result.shoe;
      rerender();
      return;
    }

    const chipControl = target.closest<HTMLElement>("[data-chip-value]");
    if (chipControl) {
      if (round) {
        return;
      }

      const chipValue = Number(chipControl.dataset.chipValue);
      if (!isBlackjackChipValue(chipValue)) {
        return;
      }

      selectedChip = chipValue;
      rerender();
      return;
    }

    const betAction = target.closest<HTMLElement>("[data-bet-action]");
    if (betAction) {
      if (round || !state.selectedSeatId) {
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
      if (round) {
        return;
      }

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
    if (!action || round) {
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
