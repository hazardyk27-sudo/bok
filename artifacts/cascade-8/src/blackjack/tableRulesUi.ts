import {
  BLACKJACK_RULES_DISCLOSURE,
  formatBlackjackRanksTotal,
  isBlackjackRank,
} from "./canonicalRules";
import type { BlackjackRank } from "./blackjackCore";

function visibleRanks(scope: Element): BlackjackRank[] {
  const ranks: BlackjackRank[] = [];
  for (const card of scope.querySelectorAll<HTMLElement>(".bj-card:not(.bj-card--back)")) {
    const rank = card.querySelector<HTMLElement>(".bj-card__rank")?.textContent?.trim() ?? "";
    if (isBlackjackRank(rank)) ranks.push(rank);
  }
  return ranks;
}

function applySoftTotal(total: HTMLElement, cardScope: Element): void {
  const ranks = visibleRanks(cardScope);
  if (ranks.length === 0) return;
  const display = formatBlackjackRanksTotal(ranks);
  if (total.textContent !== display) total.textContent = display;
  const isSoft = display.endsWith("· SOFT");
  total.classList.toggle("is-soft-total", isSoft);
  if (isSoft) {
    total.setAttribute(
      "aria-label",
      `${display.replace(" · SOFT", "")}, soft hand; Ace currently counts as 11 and may fall to 1 if needed`,
    );
  } else {
    total.removeAttribute("aria-label");
  }
}

function syncVisibleTotals(app: HTMLDivElement): void {
  for (const seat of app.querySelectorAll<HTMLElement>(".bj-seat[data-hand-id]")) {
    const total = seat.querySelector<HTMLElement>(":scope > .bj-seat__total");
    const cards = seat.querySelector<HTMLElement>(":scope > .bj-seat__cards");
    if (total && cards) applySoftTotal(total, cards);
  }

  for (const hand of app.querySelectorAll<HTMLElement>(".bj-split-hand[data-hand-id]")) {
    const total = hand.querySelector<HTMLElement>(":scope > .bj-seat__total");
    const cards = hand.querySelector<HTMLElement>(":scope > .bj-seat__cards");
    if (total && cards) applySoftTotal(total, cards);
  }

  const dealer = app.querySelector<HTMLElement>(".bj-dealer-hand");
  const dealerTotal = dealer?.querySelector<HTMLElement>(".bj-dealer-hand__total") ?? null;
  const dealerCards = dealer?.querySelector<HTMLElement>(".bj-dealer-hand__cards") ?? null;
  const dealerHidden = dealerCards?.querySelector(".bj-card--back");
  if (dealerTotal && dealerCards && !dealerHidden) applySoftTotal(dealerTotal, dealerCards);
}

function ensureRulesDisclosure(app: HTMLDivElement): void {
  const status = app.querySelector<HTMLElement>(".bj-hud--status");
  if (!status || status.querySelector(".bj-table-rules")) return;

  const details = document.createElement("details");
  details.className = "bj-table-rules";
  details.innerHTML = `
    <summary>TABLE RULES</summary>
    <div class="bj-table-rules__panel">
      <strong>6-DECK AMERICAN BLACKJACK · H17</strong>
      <ul>${BLACKJACK_RULES_DISCLOSURE.map((rule) => `<li>${rule}</li>`).join("")}</ul>
    </div>
  `;
  status.appendChild(details);
}

export function installBlackjackTableRulesUi(app: HTMLDivElement): () => void {
  let queued = false;
  const sync = () => {
    syncVisibleTotals(app);
    ensureRulesDisclosure(app);
  };
  const queueSync = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      sync();
    });
  };

  const observer = new MutationObserver(queueSync);
  observer.observe(app, { subtree: true, childList: true, characterData: true });
  queueSync();
  return () => observer.disconnect();
}
