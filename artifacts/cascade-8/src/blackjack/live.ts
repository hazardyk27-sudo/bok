import "./blackjack.css";
import "./mobile.css";
import "./seatState.css";
import "./betting.css";
import "./round.css";
import "./cardAnimation.css";
import "./chipAnimation.css";
import "./polish.css";
import "./live.css";
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
  type BlackjackRoundChipAnimationAction,
} from "./chipAnimation";
import {
  evaluateBlackjackHand,
  type BlackjackCard,
  type BlackjackSuit,
} from "./blackjackCore";
import type { BlackjackRoundState } from "./roundState";
import {
  addSeatChip,
  clearSeatBet,
  createEmptySeatState,
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
  BlackjackServerClient,
  BlackjackStaleActionError,
  installBlackjackReconnectListeners,
} from "./serverClient";
import type {
  BlackjackPublicHand,
  BlackjackPublicRound,
  BlackjackServerActionName,
  BlackjackServerSnapshot,
} from "./serverContract";

const FALLBACK_TABLE_MIN = 10;
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

function money(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

function centsMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function renderCard(card: BlackjackCard) {
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

function renderHiddenCard() {
  return `<div class="bj-card bj-card--back" data-card-hidden="true" aria-label="Dealer hole card"></div>`;
}

function renderWagerChips(seat: BlackjackSeat) {
  if (seat.chips.length === 0) return "";
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

function renderBettingSeat(
  seat: BlackjackSeat,
  selectedSeatId: BlackjackSeatId | null,
  tableMin: number,
) {
  const selected = seat.id === selectedSeatId;
  if (seat.status === "empty") return renderEmptySeat(seat);

  if (seat.status === "seated") {
    const remaining = Math.max(0, tableMin - seat.bet);
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

function handStateCopy(hand: BlackjackPublicHand, active: boolean) {
  if (hand.result) return `${hand.result.toUpperCase()} · RETURN ${money(hand.returnAmount ?? 0)}`;
  if (hand.status === "blackjack") return "BLACKJACK";
  if (hand.status === "bust") return hand.doubled ? "DOUBLE · BUST" : "BUST";
  if (hand.status === "stood" && hand.splitFromAces) return "ACE SPLIT · ONE CARD";
  if (hand.status === "stood") return hand.doubled ? "DOUBLE · STAND" : "STAND";
  return active ? "YOUR TURN" : "IN ROUND";
}

function insuranceCopy(hand: BlackjackPublicHand) {
  if (hand.insuranceDecision !== "taken") return "";
  if (hand.insuranceNetAmount === null) return `INSURANCE ${money(hand.insuranceWager)}`;
  if (hand.insuranceNetAmount > 0) return `INSURANCE WIN +${money(hand.insuranceNetAmount)}`;
  return `INSURANCE LOST ${money(hand.insuranceWager)}`;
}

function handClasses(hand: BlackjackPublicHand, active: boolean) {
  const resultClass = hand.result ? ` is-result-${hand.result}` : "";
  const actionClass = hand.status === "bust" ? " is-bust" : hand.status === "stood" ? " is-stood" : "";
  return `${active ? " is-active-subhand" : ""}${hand.status === "blackjack" ? " is-blackjack" : ""}${actionClass}${hand.doubled ? " is-doubled" : ""}${hand.splitFromAces ? " is-ace-split" : ""}${resultClass}`;
}

function insuranceBadge(hand: BlackjackPublicHand) {
  const copy = insuranceCopy(hand);
  return copy ? `<div class="bj-hand-insurance">${copy}</div>` : "";
}

function renderRoundSeat(
  seat: BlackjackSeat,
  round: BlackjackPublicRound,
) {
  const hands = round.hands
    .filter((hand) => hand.seatId === seat.id)
    .sort((left, right) => left.handIndex - right.handIndex);

  if (hands.length === 0) {
    if (seat.status === "empty") return renderEmptySeat(seat, true);
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
    const hand = hands[0]!;
    const active = round.activeHandId === hand.handId;
    const value = evaluateBlackjackHand(hand.cards);
    return `
      <div class="bj-seat bj-seat--${seat.id} bj-seat--active${active ? " is-active-hand" : ""}${handClasses(hand, false)}" data-seat="${seat.id}" data-seat-status="inRound" data-hand-id="${hand.handId}">
        <div class="bj-seat__total">${value.total}</div>
        <div class="bj-seat__cards">${hand.cards.map(renderCard).join("")}</div>
        ${renderWagerChips(seat)}
        <div class="bj-seat__bet">$${hand.wager}${hand.doubled ? " · X2" : ""}</div>
        ${insuranceBadge(hand)}
        <div class="bj-seat__badge bj-seat__round-badge">
          <span class="bj-seat__person" aria-hidden="true"></span>
          <span><strong>Seat ${seat.id}</strong><small>${handStateCopy(hand, active)}</small></span>
        </div>
      </div>
    `;
  }

  const seatActive = hands.some((hand) => hand.handId === round.activeHandId);
  const totalWager = hands.reduce((total, hand) => total + hand.wager, 0);
  const aceSplit = hands.every((hand) => hand.splitFromAces);
  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active bj-seat--split${hands.length > 2 ? " bj-seat--split-many" : ""}${seatActive ? " is-active-hand" : ""}${aceSplit ? " is-ace-split" : ""}" data-seat="${seat.id}" data-seat-status="split">
      <div class="bj-split-hands">
        ${hands.map((hand) => {
          const active = round.activeHandId === hand.handId;
          return `
            <div class="bj-split-hand${handClasses(hand, active)}" data-hand-id="${hand.handId}">
              <div class="bj-split-hand__label">HAND ${hand.handIndex + 1}${hand.splitFromAces ? " · ACE" : ""}</div>
              <div class="bj-seat__total">${evaluateBlackjackHand(hand.cards).total}</div>
              <div class="bj-seat__cards">${hand.cards.map(renderCard).join("")}</div>
              <div class="bj-split-hand__bet">$${hand.wager}${hand.doubled ? " · X2" : ""}</div>
              ${insuranceBadge(hand)}
              <div class="bj-split-hand__status">${handStateCopy(hand, active)}</div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="bj-seat__badge bj-seat__round-badge bj-seat__round-badge--split">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>${aceSplit ? "ACE SPLIT" : `${hands.length} HANDS`} · $${totalWager}</small></span>
      </div>
    </div>
  `;
}

function chipButton(value: BlackjackChipValue, selected: BlackjackChipValue, locked: boolean) {
  return `
    <button class="bj-console-chip bj-console-chip--${CHIP_VARIANT[value]}${selected === value ? " is-selected" : ""}" type="button" data-chip-value="${value}" aria-label="Select $${value} chip" aria-pressed="${selected === value}" ${locked ? "disabled" : ""}>
      <span>$${value}</span>
    </button>
  `;
}

function renderDealerHand(round: BlackjackPublicRound | null) {
  if (!round) {
    return `<div class="bj-dealer-hand"><div class="bj-dealer-hand__label">DEALER</div><span class="bj-dealer-hand__waiting">WAITING FOR DEAL</span></div>`;
  }

  const revealed = round.phase === "complete";
  const actualCards = round.dealer.cards.filter((card): card is BlackjackCard => card !== null);
  const cardsHtml = revealed
    ? actualCards.map(renderCard).join("")
    : `${actualCards[0] ? renderCard(actualCards[0]) : ""}${renderHiddenCard()}`;
  const total = revealed ? evaluateBlackjackHand(actualCards).total : "?";

  return `
    <div class="bj-dealer-hand">
      <div class="bj-dealer-hand__label">DEALER</div>
      <div class="bj-dealer-hand__cards">
        ${cardsHtml}
        <span class="bj-dealer-hand__total">${total}</span>
      </div>
    </div>
  `;
}

function activeHand(round: BlackjackPublicRound | null) {
  if (!round?.activeHandId) return null;
  return round.hands.find((hand) => hand.handId === round.activeHandId) ?? null;
}

function roundStatusCopy(round: BlackjackPublicRound) {
  const active = activeHand(round);
  if (round.phase === "insurance") {
    return active ? `Seat ${active.seatId} · Dealer shows Ace · Insurance ${money(active.wager / 2)}` : "Insurance decision pending";
  }
  if (round.phase === "complete") {
    const dealerCards = round.dealer.cards.filter((card): card is BlackjackCard => card !== null);
    const dealer = evaluateBlackjackHand(dealerCards);
    return round.dealer.blackjack
      ? "Dealer natural 21 · round settled"
      : `Dealer ${dealer.total}${dealer.bust ? " BUST" : ""} · round settled`;
  }
  if (round.phase === "playerTurns" && active) {
    const sameSeat = round.hands.filter((hand) => hand.seatId === active.seatId);
    const handLabel = sameSeat.length > 1 ? ` · Hand ${active.handIndex + 1}/${sameSeat.length}` : "";
    return `Seat ${active.seatId}${handLabel} to act · Total ${evaluateBlackjackHand(active.cards).total}`;
  }
  return "Dealer playing";
}

function bettingReadiness(state: BlackjackSeatState, tableMin: number) {
  const participating = state.seats.filter((seat) => seat.bet >= tableMin && seat.status === "betReady");
  const blocking = state.seats.filter((seat) => seat.status !== "empty" && seat.bet > 0 && seat.bet < tableMin);
  return { participating, blocking };
}

function bettingStatusCopy(
  state: BlackjackSeatState,
  selectedChip: BlackjackChipValue,
  tableMin: number,
) {
  const readiness = bettingReadiness(state, tableMin);
  if (readiness.blocking.length > 0) {
    const seat = readiness.blocking[0]!;
    return `Seat ${seat.id} needs $${tableMin - seat.bet} more to reach table min`;
  }
  if (readiness.participating.length > 0) {
    return `${readiness.participating.length} hand${readiness.participating.length === 1 ? "" : "s"} ready · $${selectedChip} chip selected`;
  }
  if (getOccupiedSeats(state).length > 0) return `Place at least one $${tableMin}+ wager to deal`;
  return "Choose a seat to start";
}

function renderMobileSeatTabs(state: BlackjackSeatState, round: BlackjackPublicRound | null) {
  return `
    <nav class="bj-mobile-seat-tabs" aria-label="Blackjack seats">
      ${state.seats.map((seat) => {
        const hands = round?.hands.filter((hand) => hand.seatId === seat.id).sort((a, b) => a.handIndex - b.handIndex) ?? [];
        const active = hands.find((hand) => hand.handId === round?.activeHandId) ?? null;
        const selected = round ? active !== null : state.selectedSeatId === seat.id;
        const primary = hands[0] ?? null;
        const label = round?.phase === "insurance" && active
          ? "INS"
          : round
            ? hands.length > 1
              ? active ? `H${active.handIndex + 1}` : `${hands.length}H`
              : primary?.result === "blackjack" ? "BJ"
              : primary?.result ? primary.result.toUpperCase()
              : primary?.status === "blackjack" ? "BJ"
              : primary?.status === "bust" ? "BUST"
              : primary?.status === "stood" ? primary.doubled ? "X2" : "STAND"
              : primary ? selected ? "TURN" : "PLAY"
              : seat.status === "empty" ? "EMPTY" : "OUT"
            : seat.status === "betReady" ? "READY" : seat.status === "seated" ? "SEATED" : "SIT";
        return `
          <button class="bj-mobile-seat-tab${selected ? " is-selected" : ""}${seat.status !== "empty" ? " is-occupied is-seated" : ""}${seat.status === "betReady" ? " is-ready" : ""}" type="button" data-mobile-seat="${seat.id}" aria-label="Seat ${seat.id}, ${label.toLowerCase()}" aria-pressed="${selected}" ${round ? "disabled" : ""}>
            <strong>${seat.id}</strong><small>${label}</small>
          </button>
        `;
      }).join("")}
    </nav>
  `;
}

function publicToAnimationRound(round: BlackjackPublicRound | null): BlackjackRoundState | null {
  if (!round) return null;
  return {
    phase: round.phase,
    hands: round.hands.map((hand) => ({ ...hand, cards: [...hand.cards] })),
    dealer: {
      cards: round.dealer.cards.filter((card): card is BlackjackCard => card !== null),
      blackjack: round.dealer.blackjack ?? false,
    },
    activeHandId: round.activeHandId,
    activeSeatId: round.activeSeatId,
  };
}

function renderLiveTable(
  app: HTMLDivElement,
  state: BlackjackSeatState,
  selectedChip: BlackjackChipValue,
  snapshot: BlackjackServerSnapshot | null,
  pending: boolean,
  notice: string | null,
) {
  const round = snapshot?.round ?? null;
  const tableMin = snapshot?.tableMin ?? FALLBACK_TABLE_MIN;
  const walletDollars = (snapshot?.wallet.balanceCents ?? 0) / 100;
  const selectedSeat = state.selectedSeatId ? getSeat(state, state.selectedSeatId) : null;
  const localTotal = getTotalSeatBet(state);
  const roundTotal = round
    ? round.hands.reduce((total, hand) => total + hand.wager + hand.insuranceWager, 0)
    : localTotal;
  const readiness = bettingReadiness(state, tableMin);
  const canDeal = Boolean(
    snapshot &&
    !round &&
    !pending &&
    readiness.participating.length > 0 &&
    readiness.blocking.length === 0 &&
    localTotal <= walletDollars,
  );
  const bettingLocked = Boolean(round || pending || !snapshot);
  const canPlace = Boolean(
    !bettingLocked &&
    selectedSeat &&
    selectedSeat.status !== "empty" &&
    localTotal + selectedChip <= walletDollars,
  );
  const hasSelectedBet = Boolean(!bettingLocked && selectedSeat && selectedSeat.bet > 0);
  const canX2 = Boolean(hasSelectedBet && selectedSeat && localTotal + selectedSeat.bet <= walletDollars);
  const allowed = new Set(snapshot?.allowedActions ?? []);
  const active = activeHand(round);
  const phaseTitle = !snapshot
    ? "CONNECTING"
    : round?.phase === "insurance"
      ? "INSURANCE"
      : round?.phase === "complete"
        ? round.dealer.blackjack ? "DEALER BLACKJACK" : "ROUND COMPLETE"
        : round?.phase === "playerTurns"
          ? "PLAYER TURN"
          : round
            ? "DEALER TURN"
            : "PLACE YOUR BETS";
  const detail = notice
    ?? (round ? roundStatusCopy(round) : bettingStatusCopy(state, selectedChip, tableMin));
  const splitLabel = active?.splitDepth && active.splitDepth > 0 ? "RESPLIT" : "SPLIT";

  app.innerHTML = `
    <main class="bj-root" data-blackjack-part="15" data-live-authority="server">
      <div class="bj-casino-backdrop" aria-hidden="true">
        <span class="bj-bokeh bj-bokeh--1"></span><span class="bj-bokeh bj-bokeh--2"></span>
        <span class="bj-bokeh bj-bokeh--3"></span><span class="bj-bokeh bj-bokeh--4"></span>
      </div>
      <section class="bj-stage" aria-label="Blackjack table">
        <aside class="bj-hud bj-hud--bankroll">
          <div class="bj-hud__pair"><span>BALANCE</span><strong data-bankroll-target>${snapshot ? centsMoney(snapshot.wallet.balanceCents) : "—"}</strong></div>
          <div class="bj-hud__pair"><span>TOTAL BET</span><strong>${money(roundTotal)}</strong></div>
          <div class="bj-hud__min"><span>TABLE MIN</span><strong>$${tableMin}</strong></div>
        </aside>

        <aside class="bj-hud bj-hud--status">
          <span>ROUND STATUS</span><strong>${phaseTitle}</strong><small>${detail}</small>
          ${round?.phase === "complete"
            ? `<button class="bj-deal-round" type="button" data-server-action="next" ${pending ? "disabled" : ""}>NEXT ROUND</button>`
            : !round
              ? `<button class="bj-deal-round" type="button" data-server-action="deal" ${canDeal ? "" : "disabled"}>DEAL${readiness.participating.length ? ` · ${readiness.participating.length} HAND${readiness.participating.length === 1 ? "" : "S"}` : ""}</button>`
              : ""}
        </aside>

        <div class="bj-dealer-zone" aria-label="Dealer">
          <div class="bj-chip-rack" aria-hidden="true">
            <span class="bj-rack-chip bj-rack-chip--black"></span><span class="bj-rack-chip bj-rack-chip--green"></span>
            <span class="bj-rack-chip bj-rack-chip--red"></span><span class="bj-rack-chip bj-rack-chip--purple"></span><span class="bj-rack-chip bj-rack-chip--gold"></span>
          </div>
          <div class="bj-dealer-figure" aria-hidden="true">
            <div class="bj-dealer-figure__hair"></div><div class="bj-dealer-figure__head"></div><div class="bj-dealer-figure__neck"></div>
            <div class="bj-dealer-figure__torso"><span class="bj-dealer-figure__shirt"></span><span class="bj-dealer-figure__vest"></span><span class="bj-dealer-figure__bow"></span></div>
            <div class="bj-dealer-figure__arms"></div><div class="bj-dealer-figure__hands"></div>
          </div>
          <div class="bj-shoe" aria-hidden="true"><div class="bj-shoe__deck"></div></div>
          <div class="bj-discard" aria-hidden="true"><div class="bj-discard__cards"></div><span>DISCARD</span></div>
        </div>

        <div class="bj-table-shell">
          <div class="bj-rail bj-rail--outer"></div><div class="bj-rail bj-rail--inner"></div>
          <div class="bj-felt">
            ${renderDealerHand(round)}
            <div class="bj-table-copy" aria-hidden="true"><div>BLACKJACK PAYS 3 TO 2</div><span>DEALER MUST HIT SOFT 17</span><div>INSURANCE PAYS 2 TO 1</div></div>
            <div class="bj-table-arc bj-table-arc--outer" aria-hidden="true"></div><div class="bj-table-arc bj-table-arc--inner" aria-hidden="true"></div>
            <div class="bj-seats">
              ${state.seats.map((seat) => round ? renderRoundSeat(seat, round) : renderBettingSeat(seat, state.selectedSeatId, tableMin)).join("")}
            </div>
          </div>
        </div>

        ${renderMobileSeatTabs(state, round)}

        <section class="bj-console" aria-label="Blackjack controls">
          <div class="bj-console__chips" aria-label="Select chip">
            <button class="bj-chip-arrow" type="button" aria-label="Previous chips" disabled>‹</button>
            ${chipButton(1, selectedChip, bettingLocked)}${chipButton(5, selectedChip, bettingLocked)}${chipButton(25, selectedChip, bettingLocked)}${chipButton(100, selectedChip, bettingLocked)}${chipButton(500, selectedChip, bettingLocked)}
            <button class="bj-chip-arrow" type="button" aria-label="Next chips" disabled>›</button>
          </div>

          <div class="bj-console__bet-actions">
            <button class="bj-action bj-action--place" type="button" data-bet-action="place" ${canPlace ? "" : "disabled"}><span class="bj-action__icon">＋</span><span><strong>PLACE BET</strong><small>${state.selectedSeatId ? `Seat ${state.selectedSeatId} · +$${selectedChip}` : "Select seat"}</small></span></button>
            <button class="bj-action bj-action--neutral" type="button" data-bet-action="undo" ${hasSelectedBet ? "" : "disabled"}><span class="bj-action__icon">↶</span><span><strong>UNDO</strong><small>Last chip</small></span></button>
            <button class="bj-action bj-action--gold" type="button" data-bet-action="double" ${canX2 ? "" : "disabled"}><span class="bj-action__icon">X2</span><span><strong>X2 BET</strong><small>${selectedSeat?.bet ? `+$${selectedSeat.bet}` : "Place bet first"}</small></span></button>
            <button class="bj-action bj-action--neutral" type="button" data-bet-action="clear" ${hasSelectedBet ? "" : "disabled"}><span class="bj-action__icon">⌫</span><span><strong>CLEAR BET</strong><small>${selectedSeat?.bet ? `Return $${selectedSeat.bet}` : "No bet"}</small></span></button>
          </div>

          <div class="bj-console__round-actions${round?.phase === "insurance" ? " is-insurance-phase" : ""}" aria-label="In round actions">
            ${round?.phase === "insurance"
              ? `
                <button class="bj-round-action bj-round-action--insurance" type="button" data-server-action="insurance" ${allowed.has("insurance") && !pending ? "" : "disabled"}>INSURANCE${active ? ` · ${money(active.wager / 2)}` : ""}</button>
                <button class="bj-round-action bj-round-action--stand" type="button" data-server-action="declineInsurance" ${allowed.has("declineInsurance") && !pending ? "" : "disabled"}>NO INSURANCE</button>
              `
              : `
                <button class="bj-round-action bj-round-action--hit" type="button" data-server-action="hit" ${allowed.has("hit") && !pending ? "" : "disabled"}>HIT</button>
                <button class="bj-round-action bj-round-action--stand" type="button" data-server-action="stand" ${allowed.has("stand") && !pending ? "" : "disabled"}>STAND</button>
                <button class="bj-round-action bj-round-action--double" type="button" data-server-action="double" ${allowed.has("double") && !pending ? "" : "disabled"}>DOUBLE${allowed.has("double") && active ? ` · +$${active.wager}` : ""}</button>
                <button class="bj-round-action bj-round-action--split" type="button" data-server-action="split" ${allowed.has("split") && !pending ? "" : "disabled"}>${splitLabel}${allowed.has("split") && active ? ` · +$${active.wager}` : ""}</button>
              `}
          </div>
          <div class="bj-live-authority" aria-live="polite">SERVER AUTHORITY · REV ${snapshot?.revision ?? "—"}${snapshot?.shoe.shufflePending ? " · SHUFFLE PENDING" : ""}</div>
        </section>
      </section>
    </main>
  `;
}

function parseSeatId(value: string | undefined): BlackjackSeatId | null {
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 5 ? parsed as BlackjackSeatId : null;
}

function errorNotice(error: unknown): string {
  if (error instanceof BlackjackStaleActionError) return "TABLE CHANGED IN ANOTHER TAB · SYNCED · ACTION NOT REPLAYED";
  const message = error instanceof Error ? error.message : "BLACKJACK_REQUEST_FAILED";
  if (message === "INSUFFICIENT_BLACKJACK_CREDITS") return "INSUFFICIENT BALANCE FOR THIS ACTION";
  if (message === "BLACKJACK_ACTION_NOT_ALLOWED") return "ACTION NO LONGER AVAILABLE · TABLE SYNC REQUIRED";
  return message.replaceAll("_", " ");
}

export function mountBlackjackLive(app: HTMLDivElement) {
  let state = createEmptySeatState();
  let selectedChip: BlackjackChipValue = 25;
  let snapshot: BlackjackServerSnapshot | null = null;
  let lastRenderedSnapshot: BlackjackServerSnapshot | null = null;
  let pending = false;
  let notice: string | null = null;
  let visualAction: BlackjackServerActionName | null = null;
  const client = new BlackjackServerClient();

  const render = (
    previousSnapshot: BlackjackServerSnapshot | null = lastRenderedSnapshot,
    action: BlackjackServerActionName | null = null,
  ) => {
    renderLiveTable(app, state, selectedChip, snapshot, pending, notice);
    if (!snapshot || !action) {
      lastRenderedSnapshot = snapshot;
      return;
    }

    const previousRound = publicToAnimationRound(previousSnapshot?.round ?? null);
    const nextRound = publicToAnimationRound(snapshot.round);
    const cardPlan = buildBlackjackCardAnimationPlan(
      previousRound,
      nextRound,
      action as BlackjackCardAnimationAction,
    );
    const chipPlan = buildBlackjackRoundChipAnimationPlan(
      previousRound,
      nextRound,
      action as BlackjackRoundChipAnimationAction,
      cardPlan.totalDurationMs,
    );
    lastRenderedSnapshot = snapshot;

    if (cardPlan.steps.length === 0 && chipPlan.steps.length === 0) return;
    window.requestAnimationFrame(() => {
      animateBlackjackCardPlan(app, cardPlan);
      animateBlackjackChipPlan(app, chipPlan);
    });
  };

  client.subscribe((incoming) => {
    const previous = snapshot;
    snapshot = incoming;
    render(previous, visualAction);
    visualAction = null;
  });

  const cleanupReconnect = installBlackjackReconnectListeners(client);
  window.addEventListener("pagehide", cleanupReconnect, { once: true });

  const performServerAction = async (action: BlackjackServerActionName) => {
    if (!snapshot || pending) return;
    notice = null;
    pending = true;
    visualAction = action;
    render();

    try {
      const seats = action === "deal"
        ? state.seats
            .filter((seat) => seat.status === "betReady" && seat.bet >= snapshot!.tableMin)
            .map((seat) => ({ seatId: seat.id, wager: seat.bet }))
        : undefined;
      await client.action(action, seats);
    } catch (error) {
      visualAction = null;
      snapshot = client.getSnapshot() ?? snapshot;
      notice = errorNotice(error);
    } finally {
      pending = false;
      render();
    }
  };

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const serverAction = target.closest<HTMLElement>("[data-server-action]");
    if (serverAction) {
      const action = serverAction.dataset.serverAction as BlackjackServerActionName | undefined;
      if (action) void performServerAction(action);
      return;
    }

    if (snapshot?.round || pending || !snapshot) return;

    const chipControl = target.closest<HTMLElement>("[data-chip-value]");
    if (chipControl) {
      const value = Number(chipControl.dataset.chipValue);
      if (isBlackjackChipValue(value)) {
        selectedChip = value;
        notice = null;
        render();
      }
      return;
    }

    const betAction = target.closest<HTMLElement>("[data-bet-action]");
    if (betAction && state.selectedSeatId) {
      const seatId = state.selectedSeatId;
      const previous = state;
      let animationAction: BlackjackBetChipAnimationAction;
      switch (betAction.dataset.betAction) {
        case "place":
          state = addSeatChip(state, seatId, selectedChip, snapshot.tableMin);
          animationAction = "place";
          break;
        case "undo":
          state = undoSeatChip(state, seatId, snapshot.tableMin);
          animationAction = "undo";
          break;
        case "double":
          state = doubleSeatBet(state, seatId, snapshot.tableMin);
          animationAction = "x2";
          break;
        case "clear":
          state = clearSeatBet(state, seatId);
          animationAction = "clear";
          break;
        default:
          return;
      }
      notice = null;
      render();
      const chipPlan = buildBlackjackBetChipAnimationPlan(previous, state, animationAction, seatId);
      if (chipPlan.steps.length > 0) window.requestAnimationFrame(() => animateBlackjackChipPlan(app, chipPlan));
      return;
    }

    const mobileSeat = target.closest<HTMLElement>("[data-mobile-seat]");
    if (mobileSeat) {
      const seatId = parseSeatId(mobileSeat.dataset.mobileSeat);
      if (!seatId) return;
      state = getSeat(state, seatId).status === "empty" ? sitAtSeat(state, seatId) : selectSeat(state, seatId);
      notice = null;
      render();
      return;
    }

    const seatAction = target.closest<HTMLElement>("[data-seat-action]");
    if (!seatAction) return;
    const seatId = parseSeatId(seatAction.dataset.seatId);
    if (!seatId) return;
    switch (seatAction.dataset.seatAction) {
      case "sit": state = sitAtSeat(state, seatId); break;
      case "select": state = selectSeat(state, seatId); break;
      case "leave": state = leaveSeat(state, seatId); break;
      default: return;
    }
    notice = null;
    render();
  });

  render();
  void client.connect().catch((error) => {
    notice = `CONNECTION ERROR · ${errorNotice(error)}`;
    render();
  });
}
