import type { BlackjackCard } from "./blackjackCore";
import type { BlackjackRoundState } from "./roundState";

export type BlackjackCardAnimationAction =
  | "deal"
  | "hit"
  | "stand"
  | "double"
  | "split"
  | "insurance"
  | "declineInsurance"
  | "next";

export type BlackjackCardAnimationKind =
  | "deal"
  | "playerDraw"
  | "splitDraw"
  | "dealerDraw"
  | "holeReveal";

export type BlackjackCardAnimationStep = {
  cardId: string;
  kind: BlackjackCardAnimationKind;
  order: number;
  delayMs: number;
};

export type BlackjackCardAnimationPlan = {
  action: BlackjackCardAnimationAction;
  steps: BlackjackCardAnimationStep[];
  totalDurationMs: number;
};

const FLIGHT_DURATION_MS = 360;
const REVEAL_DURATION_MS = 300;
const DEAL_GAP_MS = 105;
const ACTION_GAP_MS = 120;

function cardIds(round: BlackjackRoundState | null): Set<string> {
  if (!round) return new Set<string>();
  return new Set([
    ...round.hands.flatMap((hand) => hand.cards.map((card) => card.id)),
    ...round.dealer.cards.map((card) => card.id),
  ]);
}

function orderedHands(round: BlackjackRoundState) {
  return [...round.hands].sort(
    (left, right) => left.seatId - right.seatId || left.handIndex - right.handIndex,
  );
}

function newPlayerCards(
  previous: BlackjackRoundState | null,
  next: BlackjackRoundState,
): BlackjackCard[] {
  const previousIds = cardIds(previous);
  return orderedHands(next).flatMap((hand) =>
    hand.cards.filter((card) => !previousIds.has(card.id)),
  );
}

function newDealerCards(
  previous: BlackjackRoundState | null,
  next: BlackjackRoundState,
): BlackjackCard[] {
  const previousIds = cardIds(previous);
  return next.dealer.cards.filter((card) => !previousIds.has(card.id));
}

function initialDealCards(round: BlackjackRoundState): BlackjackCard[] {
  const hands = orderedHands(round);
  const firstPass = hands.map((hand) => hand.cards[0]).filter(Boolean) as BlackjackCard[];
  const secondPass = hands.map((hand) => hand.cards[1]).filter(Boolean) as BlackjackCard[];
  const dealerUp = round.dealer.cards[0];
  const dealerHole = round.dealer.cards[1];
  const initialIds = new Set([
    ...firstPass,
    ...secondPass,
    ...(dealerUp ? [dealerUp] : []),
    ...(dealerHole ? [dealerHole] : []),
  ].map((card) => card.id));
  const dealerExtras = round.dealer.cards.filter((card) => !initialIds.has(card.id));

  return [
    ...firstPass,
    ...(dealerUp ? [dealerUp] : []),
    ...secondPass,
    ...(dealerHole ? [dealerHole] : []),
    ...dealerExtras,
  ];
}

function shouldRevealHoleCard(
  previous: BlackjackRoundState | null,
  next: BlackjackRoundState,
): boolean {
  if (!previous || previous.phase === "complete" || next.phase !== "complete") {
    return false;
  }

  const previousHole = previous.dealer.cards[1];
  const nextHole = next.dealer.cards[1];
  if (!nextHole) return false;

  // Local/demo rounds already know the hidden physical hole-card ID, while the
  // server-authoritative public snapshot intentionally redacts it until the
  // round completes. Treat a newly materialized second dealer card as a reveal
  // rather than a fresh draw so the secure snapshot still gets a flip effect.
  return previousHole ? previousHole.id === nextHole.id : previous.dealer.cards.length === 1;
}

function totalDuration(steps: readonly BlackjackCardAnimationStep[]): number {
  if (steps.length === 0) return 0;
  return Math.max(
    ...steps.map((step) =>
      step.delayMs + (step.kind === "holeReveal" ? REVEAL_DURATION_MS : FLIGHT_DURATION_MS),
    ),
  );
}

export function buildBlackjackCardAnimationPlan(
  previous: BlackjackRoundState | null,
  next: BlackjackRoundState | null,
  action: BlackjackCardAnimationAction,
): BlackjackCardAnimationPlan {
  if (!next || action === "next") {
    return { action, steps: [], totalDurationMs: 0 };
  }

  const steps: BlackjackCardAnimationStep[] = [];

  if (action === "deal" && previous === null) {
    const initialDealCount = next.hands.length * 2 + 2;
    initialDealCards(next).forEach((card, order) => {
      steps.push({
        cardId: card.id,
        kind: order >= initialDealCount ? "dealerDraw" : "deal",
        order,
        delayMs: order * DEAL_GAP_MS,
      });
    });

    return {
      action,
      steps,
      totalDurationMs: totalDuration(steps),
    };
  }

  let order = 0;
  const playerKind: BlackjackCardAnimationKind = action === "split"
    ? "splitDraw"
    : "playerDraw";

  for (const card of newPlayerCards(previous, next)) {
    steps.push({
      cardId: card.id,
      kind: playerKind,
      order,
      delayMs: order * ACTION_GAP_MS,
    });
    order += 1;
  }

  const revealHole = shouldRevealHoleCard(previous, next);
  const revealedHole = revealHole ? next.dealer.cards[1] ?? null : null;
  if (revealedHole) {
    steps.push({
      cardId: revealedHole.id,
      kind: "holeReveal",
      order,
      delayMs: order * ACTION_GAP_MS,
    });
    order += 1;
  }

  for (const card of newDealerCards(previous, next)) {
    if (revealedHole && card.id === revealedHole.id) continue;
    steps.push({
      cardId: card.id,
      kind: "dealerDraw",
      order,
      delayMs: order * ACTION_GAP_MS,
    });
    order += 1;
  }

  return {
    action,
    steps,
    totalDurationMs: totalDuration(steps),
  };
}

function reducedMotionPreferred(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function cardElements(root: HTMLElement): Map<string, HTMLElement> {
  const result = new Map<string, HTMLElement>();
  root.querySelectorAll<HTMLElement>("[data-card-id]").forEach((element) => {
    const id = element.dataset.cardId;
    if (id) result.set(id, element);
  });
  return result;
}

function sourceCenter(root: HTMLElement): { x: number; y: number } | null {
  const candidates = [
    root.querySelector<HTMLElement>(".bj-shoe__deck"),
    root.querySelector<HTMLElement>(".bj-shoe"),
    root.querySelector<HTMLElement>(".bj-dealer-zone"),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const rect = candidate.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    return {
      x: rect.left + rect.width * 0.5,
      y: rect.top + rect.height * 0.5,
    };
  }

  return null;
}

export function animateBlackjackCardPlan(
  root: HTMLElement,
  plan: BlackjackCardAnimationPlan,
): void {
  if (plan.steps.length === 0 || reducedMotionPreferred()) return;

  const source = sourceCenter(root);
  if (!source) return;

  const elements = cardElements(root);
  const blackjackRoot = root.querySelector<HTMLElement>(".bj-root");

  blackjackRoot?.classList.add("is-card-animating");

  for (const step of plan.steps) {
    const card = elements.get(step.cardId);
    if (!card || typeof card.animate !== "function") continue;

    card.classList.add("is-card-animating");

    if (step.kind === "holeReveal") {
      const animation = card.animate(
        [
          { scale: "0.08 1", filter: "brightness(0.72)" },
          { scale: "1 1", filter: "brightness(1.08)" },
          { scale: "1 1", filter: "brightness(1)" },
        ],
        {
          duration: REVEAL_DURATION_MS,
          delay: step.delayMs,
          easing: "ease-out",
          fill: "backwards",
        },
      );
      animation.addEventListener(
        "finish",
        () => card.classList.remove("is-card-animating"),
        { once: true },
      );
      continue;
    }

    const targetRect = card.getBoundingClientRect();
    const targetX = targetRect.left + targetRect.width * 0.5;
    const targetY = targetRect.top + targetRect.height * 0.5;
    const deltaX = source.x - targetX;
    const deltaY = source.y - targetY;

    const animation = card.animate(
      [
        {
          translate: `${deltaX}px ${deltaY}px`,
          scale: "0.68",
          opacity: 0,
          filter: "brightness(0.62) blur(0.4px)",
        },
        {
          translate: "0 0",
          scale: "1",
          opacity: 1,
          filter: "brightness(1) blur(0)",
        },
      ],
      {
        duration: FLIGHT_DURATION_MS,
        delay: step.delayMs,
        easing: "cubic-bezier(0.18, 0.72, 0.18, 1)",
        fill: "backwards",
      },
    );
    animation.addEventListener(
      "finish",
      () => card.classList.remove("is-card-animating"),
      { once: true },
    );
  }

  if (blackjackRoot) {
    window.setTimeout(
      () => blackjackRoot.classList.remove("is-card-animating"),
      plan.totalDurationMs + 40,
    );
  }
}
