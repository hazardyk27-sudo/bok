import type { BlackjackRoundState } from "./roundState";
import type {
  BlackjackChipValue,
  BlackjackSeatId,
  BlackjackSeatState,
} from "./seatState";

export type BlackjackBetChipAnimationAction = "place" | "undo" | "clear" | "x2";
export type BlackjackRoundChipAnimationAction =
  | "deal"
  | "hit"
  | "stand"
  | "double"
  | "split"
  | "insurance"
  | "declineInsurance"
  | "next";

export type BlackjackChipAnimationKind =
  | "betIn"
  | "betOut"
  | "roundStake"
  | "payout";

export type BlackjackChipAnimationStep = {
  kind: BlackjackChipAnimationKind;
  seatId: BlackjackSeatId;
  handId: string | null;
  amount: number;
  chipValue: BlackjackChipValue | null;
  order: number;
  delayMs: number;
};

export type BlackjackChipAnimationPlan = {
  steps: BlackjackChipAnimationStep[];
  totalDurationMs: number;
};

const CHIP_FLIGHT_MS = 420;
const CHIP_GAP_MS = 72;
const PAYOUT_GAP_MS = 90;
const MAX_DENOMINATION_FLIGHTS = 12;

function planDuration(steps: readonly BlackjackChipAnimationStep[]): number {
  if (steps.length === 0) return 0;
  return Math.max(...steps.map((step) => step.delayMs + CHIP_FLIGHT_MS));
}

function seatById(state: BlackjackSeatState, seatId: BlackjackSeatId) {
  return state.seats.find((seat) => seat.id === seatId) ?? null;
}

function visualChipValues(values: readonly BlackjackChipValue[]): BlackjackChipValue[] {
  if (values.length <= MAX_DENOMINATION_FLIGHTS) return [...values];
  return values.slice(values.length - MAX_DENOMINATION_FLIGHTS);
}

export function buildBlackjackBetChipAnimationPlan(
  previous: BlackjackSeatState,
  next: BlackjackSeatState,
  action: BlackjackBetChipAnimationAction,
  seatId: BlackjackSeatId,
): BlackjackChipAnimationPlan {
  const before = seatById(previous, seatId);
  const after = seatById(next, seatId);
  if (!before || !after) return { steps: [], totalDurationMs: 0 };

  let values: BlackjackChipValue[] = [];
  let kind: BlackjackChipAnimationKind = "betIn";

  if (action === "place" || action === "x2") {
    values = after.chips.slice(before.chips.length);
  } else {
    kind = "betOut";
    values = before.chips.slice(after.chips.length).reverse();
  }

  const steps = visualChipValues(values).map((chipValue, order) => ({
    kind,
    seatId,
    handId: null,
    amount: chipValue,
    chipValue,
    order,
    delayMs: order * CHIP_GAP_MS,
  }));

  return { steps, totalDurationMs: planDuration(steps) };
}

function activeHand(round: BlackjackRoundState | null) {
  if (!round?.activeHandId) return null;
  return round.hands.find((hand) => hand.handId === round.activeHandId) ?? null;
}

function settlementSteps(
  next: BlackjackRoundState,
  startOrder: number,
  startDelayMs: number,
): BlackjackChipAnimationStep[] {
  let order = startOrder;
  const steps: BlackjackChipAnimationStep[] = [];

  for (const hand of next.hands) {
    const amount = (hand.returnAmount ?? 0) + (hand.insuranceReturnAmount ?? 0);
    if (amount <= 0) continue;
    steps.push({
      kind: "payout",
      seatId: hand.seatId,
      handId: hand.handId,
      amount,
      chipValue: null,
      order,
      delayMs: startDelayMs + (order - startOrder) * PAYOUT_GAP_MS,
    });
    order += 1;
  }

  return steps;
}

export function buildBlackjackRoundChipAnimationPlan(
  previous: BlackjackRoundState | null,
  next: BlackjackRoundState | null,
  action: BlackjackRoundChipAnimationAction,
  cardAnimationDurationMs = 0,
): BlackjackChipAnimationPlan {
  if (!next || action === "next") return { steps: [], totalDurationMs: 0 };

  const steps: BlackjackChipAnimationStep[] = [];
  const previousActive = activeHand(previous);

  if (previousActive && action === "double") {
    steps.push({
      kind: "roundStake",
      seatId: previousActive.seatId,
      handId: previousActive.handId,
      amount: previousActive.wager,
      chipValue: null,
      order: 0,
      delayMs: 0,
    });
  }

  if (previousActive && action === "split") {
    steps.push({
      kind: "roundStake",
      seatId: previousActive.seatId,
      handId: previousActive.handId,
      amount: previousActive.wager,
      chipValue: null,
      order: 0,
      delayMs: 0,
    });
  }

  if (previousActive && action === "insurance") {
    const insuredHand = next.hands.find((hand) =>
      hand.handId === previousActive.handId ||
      (hand.seatId === previousActive.seatId && hand.insuranceDecision === "taken"),
    );
    const insuranceAmount = insuredHand?.insuranceWager ?? previousActive.wager / 2;
    if (insuranceAmount > 0) {
      steps.push({
        kind: "roundStake",
        seatId: previousActive.seatId,
        handId: previousActive.handId,
        amount: insuranceAmount,
        chipValue: null,
        order: 0,
        delayMs: 0,
      });
    }
  }

  if (next.phase === "complete" && previous?.phase !== "complete") {
    const payoutDelay = Math.max(
      steps.length > 0 ? CHIP_FLIGHT_MS + 80 : 0,
      cardAnimationDurationMs + 90,
    );
    steps.push(...settlementSteps(next, steps.length, payoutDelay));
  }

  return { steps, totalDurationMs: planDuration(steps) };
}

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function targetForSeat(root: HTMLElement, seatId: BlackjackSeatId, handId: string | null) {
  if (handId) {
    const hand = root.querySelector<HTMLElement>(`[data-hand-id="${CSS.escape(handId)}"]`);
    if (hand) return hand;
  }
  return root.querySelector<HTMLElement>(`.bj-seat[data-seat="${seatId}"] .bj-seat__bet-circle`)
    ?? root.querySelector<HTMLElement>(`.bj-seat[data-seat="${seatId}"]`);
}

function bankrollTarget(root: HTMLElement) {
  return root.querySelector<HTMLElement>("[data-bankroll-target]")
    ?? root.querySelector<HTMLElement>(".bj-hud--bankroll");
}

function genericStakeSource(root: HTMLElement) {
  return root.querySelector<HTMLElement>(".bj-console__chips")
    ?? bankrollTarget(root);
}

function denominationSource(root: HTMLElement, chipValue: BlackjackChipValue | null) {
  if (chipValue !== null) {
    const source = root.querySelector<HTMLElement>(`[data-chip-value="${chipValue}"]`);
    if (source) return source;
  }
  return genericStakeSource(root);
}

function createGhost(
  root: HTMLElement,
  step: BlackjackChipAnimationStep,
): HTMLElement {
  const ghost = document.createElement("div");
  const variant = step.chipValue === null ? "amount" : String(step.chipValue);
  ghost.className = `bj-chip-flight bj-chip-flight--${variant} bj-chip-flight--${step.kind}`;
  ghost.textContent = step.chipValue === null
    ? `$${Number.isInteger(step.amount) ? step.amount : step.amount.toFixed(2)}`
    : String(step.chipValue);
  ghost.setAttribute("aria-hidden", "true");
  root.appendChild(ghost);
  return ghost;
}

export function animateBlackjackChipPlan(
  root: HTMLElement,
  plan: BlackjackChipAnimationPlan,
): void {
  if (plan.steps.length === 0 || reducedMotionPreferred()) return;

  const blackjackRoot = root.querySelector<HTMLElement>(".bj-root");
  if (!blackjackRoot) return;
  const rootRect = blackjackRoot.getBoundingClientRect();

  blackjackRoot.classList.add("is-chip-animating");

  for (const step of plan.steps) {
    const seatTarget = targetForSeat(root, step.seatId, step.handId);
    const bankroll = bankrollTarget(root);
    const denomination = denominationSource(root, step.chipValue);
    const genericSource = genericStakeSource(root);

    let sourceElement: HTMLElement | null = null;
    let targetElement: HTMLElement | null = null;

    if (step.kind === "betIn") {
      sourceElement = denomination;
      targetElement = seatTarget;
    } else if (step.kind === "betOut") {
      sourceElement = seatTarget;
      targetElement = denomination;
    } else if (step.kind === "roundStake") {
      sourceElement = genericSource;
      targetElement = seatTarget;
    } else {
      sourceElement = seatTarget;
      targetElement = bankroll;
    }

    if (!sourceElement || !targetElement) continue;

    const source = center(sourceElement.getBoundingClientRect());
    const target = center(targetElement.getBoundingClientRect());
    const ghost = createGhost(blackjackRoot, step);
    const startX = source.x - rootRect.left;
    const startY = source.y - rootRect.top;
    const endX = target.x - rootRect.left;
    const endY = target.y - rootRect.top;

    ghost.style.left = `${startX}px`;
    ghost.style.top = `${startY}px`;

    if (typeof ghost.animate !== "function") {
      ghost.remove();
      continue;
    }

    const animation = ghost.animate(
      [
        {
          translate: "-50% -50%",
          scale: "0.82",
          opacity: 0.18,
        },
        {
          translate: `${endX - startX - 1}px ${endY - startY - 8}px`,
          scale: "1.08",
          opacity: 1,
          offset: 0.82,
        },
        {
          translate: `${endX - startX}px ${endY - startY}px`,
          scale: "1",
          opacity: 0.96,
        },
      ],
      {
        duration: CHIP_FLIGHT_MS,
        delay: step.delayMs,
        easing: "cubic-bezier(0.2, 0.78, 0.2, 1)",
        fill: "both",
      },
    );
    animation.addEventListener("finish", () => ghost.remove(), { once: true });
    animation.addEventListener("cancel", () => ghost.remove(), { once: true });
  }

  window.setTimeout(
    () => blackjackRoot.classList.remove("is-chip-animating"),
    plan.totalDurationMs + 60,
  );
}
