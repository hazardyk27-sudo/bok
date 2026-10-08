import "./blackjack.css";
import "./mobile.css";
import "./seatState.css";
import "./betting.css";
import "./round.css";
import "./cardAnimation.css";
import "./chipAnimation.css";
import {
  animateBlackjackCardPlan,
  buildBlackjackCardAnimationPlan,
  type BlackjackCardAnimationAction,
} from "./cardAnimation";
import {
  animateBlackjackChipPlan,
  buildBlackjackBetChipAnimationPlan,
  buildBlackjackRoundChipAnimationPlan,
  type BlackjackBetChipAnimationAction,
} from "./chipAnimation";
import {
  evaluateBlackjackHand,
  type BlackjackCard,
  type BlackjackSuit,
} from "./blackjackCore";
import {
  BLACKJACK_MAX_HANDS_PER_SEAT,
  canDoubleBlackjackHand,
  canSplitBlackjackHand,
  canTakeBlackjackInsurance,
  declineBlackjackInsurance,
  doubleBlackjackHand,
  getActiveBlackjackRoundHand,
  getBlackjackInsuranceMaxWager,
  getBlackjackRoundReadiness,
  hitBlackjackHand,
  splitBlackjackHand,
  standBlackjackHand,
  startBlackjackRound,
  takeBlackjackInsurance,
  type BlackjackRoundHand,
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
import {
  createBlackjackShoe,
  reshuffleBlackjackShoeAtRoundBoundary,
  type BlackjackShoe,
} from "./shoe";

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
    return `<div class="bj-card bj-card--back" data-card-id="${card.id}" data-card-hidden="true" aria-label="Dealer hole card"></div>`;
  }

  const suit = SUIT_SYMBOL[card.suit];
  const red = card.suit === "diamonds" || card.suit === "hearts";

  return `
    <div class="bj-card${red ? " bj-card--red" : ""}" data-card-id="${card.id}" aria-label="${card.rank}${suit}">
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

function formatReturnAmount(amount: number | null) {
  if (amount === null) {
    return "";
  }
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function roundHandStateCopy(hand: BlackjackRoundHand, active: boolean) {
  if (hand.result) {
    return `${hand.result.toUpperCase()} · RETURN ${formatReturnAmount(hand.returnAmount)}`;
  }
  if (hand.status === "blackjack") {
    return "BLACKJACK";
  }
  if (hand.status === "bust") {
    return hand.doubled ? "DOUBLE · BUST" : "BUST";
  }
  if (hand.status === "stood" && hand.splitFromAces) {
    return "ACE SPLIT · ONE CARD";
  }
  if (hand.status === "stood") {
    return hand.doubled ? "DOUBLE · STAND" : "STAND";
  }
  return active ? "YOUR TURN" : "IN ROUND";
}

function insuranceCopy(hand: BlackjackRoundHand) {
  if (hand.insuranceDecision !== "taken") {
    return "";
  }

  if (hand.insuranceNetAmount === null) {
    return `INSURANCE $${formatReturnAmount(hand.insuranceWager).replace("$", "")}`;
  }

  if (hand.insuranceNetAmount > 0) {
    return `INSURANCE WIN +${formatReturnAmount(hand.insuranceNetAmount)}`;
  }

  return `INSURANCE LOST ${formatReturnAmount(hand.insuranceWager)}`;
}

function roundHandClasses(hand: BlackjackRoundHand, active: boolean) {
  const resultClass = hand.result ? ` is-result-${hand.result}` : "";
  const actionClass = hand.status === "bust" ? " is-bust" : hand.status === "stood" ? " is-stood" : "";
  const doubledClass = hand.doubled ? " is-doubled" : "";
  const blackjackClass = hand.status === "blackjack" ? " is-blackjack" : "";
  const aceSplitClass = hand.splitFromAces ? " is-ace-split" : "";
  return `${active ? " is-active-subhand" : ""}${blackjackClass}${actionClass}${doubledClass}${aceSplitClass}${resultClass}`;
}

function renderInsuranceBadge(hand: BlackjackRoundHand) {
  const copy = insuranceCopy(hand);
  return copy ? `<div class="bj-hand-insurance">${copy}</div>` : "";
}

function renderSingleRoundHand(
  seat: BlackjackSeat,
  hand: BlackjackRoundHand,
  active: boolean,
) {
  const value = evaluateBlackjackHand(hand.cards);
  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active${active ? " is-active-hand" : ""}${roundHandClasses(hand, false)}" data-seat="${seat.id}" data-seat-status="inRound" data-hand-id="${hand.handId}">
      <div class="bj-seat__total">${value.total}</div>
      <div class="bj-seat__cards">
        ${hand.cards.map((card) => renderCard(card)).join("")}
      </div>
      ${renderWagerChips(seat)}
      <div class="bj-seat__bet">$${hand.wager}${hand.doubled ? " · X2" : ""}</div>
      ${renderInsuranceBadge(hand)}
      <div class="bj-seat__badge bj-seat__round-badge">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>${roundHandStateCopy(hand, active)}</small></span>
      </div>
    </div>
  `;
}

function renderSplitHand(hand: BlackjackRoundHand, active: boolean) {
  const value = evaluateBlackjackHand(hand.cards);
  return `
    <div class="bj-split-hand${roundHandClasses(hand, active)}" data-hand-id="${hand.handId}">
      <div class="bj-split-hand__label">HAND ${hand.handIndex + 1}${hand.splitFromAces ? " · ACE" : ""}</div>
      <div class="bj-seat__total">${value.total}</div>
      <div class="bj-seat__cards">
        ${hand.cards.map((card) => renderCard(card)).join("")}
      </div>
      <div class="bj-split-hand__bet">$${hand.wager}${hand.doubled ? " · X2" : ""}</div>
      ${renderInsuranceBadge(hand)}
      <div class="bj-split-hand__status">${roundHandStateCopy(hand, active)}</div>
    </div>
  `;
}

function renderRoundSeat(
  seat: BlackjackSeat,
  round: BlackjackRoundState,
) {
  const hands = round.hands
    .filter((candidate) => candidate.seatId === seat.id)
    .sort((left, right) => left.handIndex - right.handIndex);

  if (hands.length === 0) {
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

  if (hands.length === 1) {
    const hand = hands[0];
    if (!hand) {
      return "";
    }
    return renderSingleRoundHand(seat, hand, round.activeHandId === hand.handId);
  }

  const seatActive = hands.some((hand) => hand.handId === round.activeHandId);
  const seatWager = hands.reduce((total, hand) => total + hand.wager, 0);
  const aceSplit = hands.every((hand) => hand.splitFromAces);

  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active bj-seat--split${hands.length > 2 ? " bj-seat--split-many" : ""}${seatActive ? " is-active-hand" : ""}${aceSplit ? " is-ace-split" : ""}" data-seat="${seat.id}" data-seat-status="split">
      <div class="bj-split-hands">
        ${hands.map((hand) => renderSplitHand(hand, round.activeHandId === hand.handId)).join("")}
      </div>
      <div class="bj-seat__badge bj-seat__round-badge bj-seat__round-badge--split">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>${aceSplit ? "ACE SPLIT" : `${hands.length} HANDS`} · $${seatWager}</small></span>
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
        const hands = round?.hands
          .filter((candidate) => candidate.seatId === seat.id)
          .sort((left, right) => left.handIndex - right.handIndex) ?? [];
        const activeHand = hands.find((hand) => hand.handId === round?.activeHandId) ?? null;
        const selected = round
          ? activeHand !== null
          : state.selectedSeatId === seat.id;
        const occupied = seat.status !== "empty";
        const ready = seat.status === "betReady";
        const primaryHand = hands[0] ?? null;
        const aceSplit = hands.length > 1 && hands.every((hand) => hand.splitFromAces);
        const label = round?.phase === "insurance" && activeHand
          ? "INS"
          : round
            ? hands.length > 1
              ? activeHand
                ? `H${activeHand.handIndex + 1}`
                : aceSplit
                  ? "ACES"
                  : `${hands.length}H`
              : primaryHand?.result === "blackjack"
                ? "BJ"
                : primaryHand?.result
                  ? primaryHand.result.toUpperCase()
                  : primaryHand?.status === "blackjack"
                    ? "BJ"
                    : primaryHand?.status === "bust"
                      ? "BUST"
                      : primaryHand?.status === "stood"
                        ? primaryHand.doubled ? "X2" : "STAND"
                        : primaryHand
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
  if (round.phase === "insurance") {
    const activeHand = getActiveBlackjackRoundHand(round);
    return activeHand
      ? `Seat ${activeHand.seatId} · Dealer shows Ace · Insurance ${formatReturnAmount(getBlackjackInsuranceMaxWager(activeHand))}`
      : "Insurance decision pending";
  }

  if (round.phase === "complete") {
    const dealer = evaluateBlackjackHand(round.dealer.cards);
    return round.dealer.blackjack
      ? "Dealer natural 21 · round settled"
      : `Dealer ${dealer.total}${dealer.bust ? " BUST" : ""} · round settled`;
  }

  if (round.phase === "playerTurns" && round.activeHandId) {
    const activeHand = round.hands.find((hand) => hand.handId === round.activeHandId);
    const total = activeHand
      ? evaluateBlackjackHand(activeHand.cards).total
      : null;
    const seatHandCount = activeHand
      ? round.hands.filter((hand) => hand.seatId === activeHand.seatId).length
      : 0;
    const handLabel = activeHand && seatHandCount > 1
      ? ` · Hand ${activeHand.handIndex + 1}/${seatHandCount}`
      : "";
    return activeHand
      ? `Seat ${activeHand.seatId}${handLabel} to act${total === null ? "" : ` · Total ${total}`}`
      : "Player action pending";
  }

  return "Dealer playing";
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

  const revealHoleCard = round.phase === "complete" ||
    (round.dealer.blackjack && round.phase !== "insurance");
  const dealerTotal = revealHoleCard
    ? evaluateBlackjackHand(round.dealer.cards).total
    : "?";

  return `
    <div class="bj-dealer-hand">
      <div class="bj-dealer-hand__label">DEALER</div>
      <div class="bj-dealer-hand__cards">
        ${round.dealer.cards.map((card, index) =>
          renderCard(card, !revealHoleCard && index === 1),
        ).join("")}
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
  const totalBet = round
    ? round.hands.reduce(
        (total, hand) => total + hand.wager + hand.insuranceWager,
        0,
      )
    : getTotalSeatBet(state);
  const selectedSeat = state.selectedSeatId ? getSeat(state, state.selectedSeatId) : null;
  const bettingLocked = round !== null;
  const canPlaceBet = !bettingLocked && selectedSeat !== null && selectedSeat.status !== "empty";
  const hasSelectedBet = canPlaceBet && selectedSeat.bet > 0;
  const readiness = getBlackjackRoundReadiness(state, TABLE_MIN);
  const insurancePhase = round?.phase === "insurance";
  const canInsure = round ? canTakeBlackjackInsurance(round) : false;
  const canPlayerAct = round?.phase === "playerTurns" && round.activeHandId !== null;
  const canDoubleDown = round ? canDoubleBlackjackHand(round) : false;
  const canSplit = round ? canSplitBlackjackHand(round) : false;
  const activeRoundHand = round?.activeHandId
    ? round.hands.find((hand) => hand.handId === round.activeHandId) ?? null
    : null;
  const activeSeatHandCount = activeRoundHand && round
    ? round.hands.filter((hand) => hand.seatId === activeRoundHand.seatId).length
    : 0;
  const splitActionLabel = activeRoundHand?.splitDepth && activeRoundHand.splitDepth > 0
    ? "RESPLIT"
    : "SPLIT";

  app.innerHTML = `
    <main class="bj-root" data-blackjack-part="12b">
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
            <strong data-bankroll-target>$2,450.00</strong>
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
          <strong>${round ? (round.phase === "insurance" ? "INSURANCE" : round.phase === "complete" ? (round.dealer.blackjack ? "DEALER BLACKJACK" : "ROUND COMPLETE") : round.phase === "playerTurns" ? "PLAYER TURN" : "DEALER TURN") : "PLACE YOUR BETS"}</strong>
          <small>${round ? renderRoundStatusCopy(round) : renderBettingStatusCopy(state, selectedChip)}</small>
          ${round
            ? round.phase === "complete"
              ? `<button class="bj-deal-round" type="button" data-round-action="next">NEXT ROUND</button>`
              : ""
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

          <div class="bj-console__round-actions${insurancePhase ? " is-insurance-phase" : ""}" aria-label="In round actions">
            ${insurancePhase
              ? `
                <button class="bj-round-action bj-round-action--insurance" type="button" data-round-action="insuranceTake" ${canInsure ? "" : "disabled"}>INSURANCE${canInsure && activeRoundHand ? ` · ${formatReturnAmount(getBlackjackInsuranceMaxWager(activeRoundHand))}` : ""}</button>
                <button class="bj-round-action bj-round-action--stand" type="button" data-round-action="insuranceDecline" ${canInsure ? "" : "disabled"}>NO INSURANCE</button>
              `
              : `
                <button class="bj-round-action bj-round-action--hit" type="button" data-round-action="hit" ${canPlayerAct ? "" : "disabled"}>HIT</button>
                <button class="bj-round-action bj-round-action--stand" type="button" data-round-action="stand" ${canPlayerAct ? "" : "disabled"}>STAND</button>
                <button class="bj-round-action bj-round-action--double" type="button" data-round-action="doubleDown" ${canDoubleDown ? "" : "disabled"}>DOUBLE${canDoubleDown && activeRoundHand ? ` · +$${activeRoundHand.wager}` : ""}</button>
                <button class="bj-round-action bj-round-action--split" type="button" data-round-action="split" ${canSplit ? "" : "disabled"}>${splitActionLabel}${canSplit && activeRoundHand ? ` · +$${activeRoundHand.wager}` : activeSeatHandCount >= BLACKJACK_MAX_HANDS_PER_SEAT ? " · MAX 4" : ""}</button>
              `}
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

  const rerender = (
    previousRound: BlackjackRoundState | null = round,
    animationAction: BlackjackCardAnimationAction | null = null,
  ) => {
    renderBlackjack(app, state, selectedChip, round);
    if (!animationAction) return;

    const cardPlan = buildBlackjackCardAnimationPlan(previousRound, round, animationAction);
    const chipPlan = buildBlackjackRoundChipAnimationPlan(
      previousRound,
      round,
      animationAction,
      cardPlan.totalDurationMs,
    );
    if (cardPlan.steps.length === 0 && chipPlan.steps.length === 0) return;

    window.requestAnimationFrame(() => {
      animateBlackjackCardPlan(app, cardPlan);
      animateBlackjackChipPlan(app, chipPlan);
    });
  };

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const roundAction = target.closest<HTMLElement>("[data-round-action]");
    if (roundAction) {
      const previousRound = round;
      let animationAction: BlackjackCardAnimationAction;

      switch (roundAction.dataset.roundAction) {
        case "deal": {
          if (round !== null) {
            return;
          }
          const result = startBlackjackRound(state, shoe, TABLE_MIN);
          round = result.round;
          shoe = result.shoe;
          animationAction = "deal";
          break;
        }
        case "insuranceTake": {
          if (!round || !canTakeBlackjackInsurance(round)) {
            return;
          }
          const result = takeBlackjackInsurance(round, shoe);
          round = result.round;
          shoe = result.shoe;
          animationAction = "insurance";
          break;
        }
        case "insuranceDecline": {
          if (!round || round.phase !== "insurance") {
            return;
          }
          const result = declineBlackjackInsurance(round, shoe);
          round = result.round;
          shoe = result.shoe;
          animationAction = "declineInsurance";
          break;
        }
        case "hit": {
          if (!round) {
            return;
          }
          const result = hitBlackjackHand(round, shoe);
          round = result.round;
          shoe = result.shoe;
          animationAction = "hit";
          break;
        }
        case "stand": {
          if (!round) {
            return;
          }
          const result = standBlackjackHand(round, shoe);
          round = result.round;
          shoe = result.shoe;
          animationAction = "stand";
          break;
        }
        case "doubleDown": {
          if (!round || !canDoubleBlackjackHand(round)) {
            return;
          }
          const result = doubleBlackjackHand(round, shoe);
          round = result.round;
          shoe = result.shoe;
          animationAction = "double";
          break;
        }
        case "split": {
          if (!round || !canSplitBlackjackHand(round)) {
            return;
          }
          const result = splitBlackjackHand(round, shoe);
          round = result.round;
          shoe = result.shoe;
          animationAction = "split";
          break;
        }
        case "next": {
          if (!round || round.phase !== "complete") {
            return;
          }
          shoe = reshuffleBlackjackShoeAtRoundBoundary(shoe);
          round = null;
          animationAction = "next";
          break;
        }
        default:
          return;
      }

      rerender(previousRound, animationAction);
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

      const seatId = state.selectedSeatId;
      const previousState = state;
      let chipAnimationAction: BlackjackBetChipAnimationAction;

      switch (betAction.dataset.betAction) {
        case "place":
          state = addSeatChip(state, seatId, selectedChip, TABLE_MIN);
          chipAnimationAction = "place";
          break;
        case "undo":
          state = undoSeatChip(state, seatId, TABLE_MIN);
          chipAnimationAction = "undo";
          break;
        case "double":
          state = doubleSeatBet(state, seatId, TABLE_MIN);
          chipAnimationAction = "x2";
          break;
        case "clear":
          state = clearSeatBet(state, seatId);
          chipAnimationAction = "clear";
          break;
        default:
          return;
      }

      rerender();
      const chipPlan = buildBlackjackBetChipAnimationPlan(
        previousState,
        state,
        chipAnimationAction,
        seatId,
      );
      if (chipPlan.steps.length > 0) {
        window.requestAnimationFrame(() => animateBlackjackChipPlan(app, chipPlan));
      }
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
