import "./cardFlight.css";
import type { BlackjackPresentationEvent } from "./presentationQueue";

type DealEvent = Extract<
  BlackjackPresentationEvent,
  { type: "PLAYER_CARD_DEALT" | "DEALER_CARD_DEALT" }
>;

export type BlackjackCardFlightPresentation = Readonly<{
  prepare: (events: readonly BlackjackPresentationEvent[]) => void;
  play: (event: BlackjackPresentationEvent) => Promise<void>;
  clear: () => void;
}>;

type BlackjackCardFlightOptions = Readonly<{
  wait?: (durationMs: number) => Promise<void>;
  reducedMotion?: () => boolean;
}>;

const FLIGHT_DURATION_MS=360;
const FLIGHT_SETTLE_MS=36;

function defaultWait(durationMs:number): Promise<void> {
  return new Promise((resolve)=>{
    window.setTimeout(resolve,durationMs);
  });
}

function supportsCardFlightDom(app: HTMLElement): boolean {
  const candidate=app as unknown as {
    querySelector?: unknown;
    querySelectorAll?: unknown;
    ownerDocument?: {
      body?: unknown;
      createElement?: unknown;
    };
  };
  return (
    typeof candidate.querySelector==="function" &&
    typeof candidate.querySelectorAll==="function" &&
    candidate.ownerDocument?.body!==undefined &&
    typeof candidate.ownerDocument?.createElement==="function"
  );
}

function isDealEvent(event: BlackjackPresentationEvent): event is DealEvent {
  return event.type==="PLAYER_CARD_DEALT" || event.type==="DEALER_CARD_DEALT";
}

function eventKey(event: DealEvent): string {
  if(event.type==="PLAYER_CARD_DEALT"){
    return [
      event.eventSequence,
      event.type,
      event.seatNumber,
      event.handId,
      event.cardIndex,
    ].join(":");
  }
  return [
    event.eventSequence,
    event.type,
    "dealer",
    event.cardIndex,
  ].join(":");
}

function suitSymbol(suit: NonNullable<DealEvent["card"]>["suit"]): string {
  switch(suit){
    case "CLUBS": return "♣";
    case "DIAMONDS": return "♦";
    case "HEARTS": return "♥";
    case "SPADES": return "♠";
  }
}

function targetContainer(app: HTMLElement,event: DealEvent): HTMLElement | null {
  if(!supportsCardFlightDom(app)) return null;
  if(event.type==="DEALER_CARD_DEALT"){
    return app.querySelector<HTMLElement>(".blackjack-dealer-cards");
  }
  return app.querySelector<HTMLElement>(
    '.blackjack-seat[data-seat="'+event.seatNumber+'"] .blackjack-seat-cards',
  );
}

function cardAt(container: HTMLElement,index:number): HTMLElement | null {
  return container.children.item(index) as HTMLElement | null;
}

function targetMatchesEvent(target: HTMLElement,event: DealEvent): boolean {
  if(event.type==="DEALER_CARD_DEALT" && event.hidden){
    return target.dataset.cardHidden==="true";
  }
  const card=event.card;
  if(card===null) return false;
  return (
    target.dataset.cardRank===card.rank &&
    target.dataset.cardSuit===card.suit
  );
}

function findExactTarget(app: HTMLElement,event: DealEvent): HTMLElement | null {
  const container=targetContainer(app,event);
  if(container===null) return null;
  const target=cardAt(container,event.cardIndex);
  return target!==null && targetMatchesEvent(target,event) ? target : null;
}

function createCardGhost(
  document: Document,
  event: DealEvent,
  source: HTMLElement | null,
): HTMLElement {
  if(source!==null){
    const clone=source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("data-blackjack-flight-key");
    clone.classList.remove(
      "blackjack-card-flight-pending",
      "blackjack-card-flight-arrived",
    );
    clone.classList.add("blackjack-card-flight-ghost");
    return clone;
  }

  const card=document.createElement("span");
  const dealerClass=event.type==="DEALER_CARD_DEALT" ? " is-dealer" : "";
  card.className="blackjack-card-placeholder blackjack-card-face blackjack-card-flight-ghost"+dealerClass;

  if(event.type==="DEALER_CARD_DEALT" && event.hidden){
    card.classList.add("is-hole");
    card.dataset.cardHidden="true";
    card.setAttribute("aria-hidden","true");
    return card;
  }

  const dealt=event.card;
  if(dealt===null) return card;
  if(dealt.suit==="HEARTS" || dealt.suit==="DIAMONDS"){
    card.classList.add("is-red");
  }
  card.dataset.cardRank=dealt.rank;
  card.dataset.cardSuit=dealt.suit;
  const rank=document.createElement("strong");
  rank.textContent=dealt.rank;
  const suit=document.createElement("span");
  suit.textContent=suitSymbol(dealt.suit);
  suit.setAttribute("aria-hidden","true");
  card.append(rank,suit);
  card.setAttribute("aria-hidden","true");
  return card;
}

function fallbackSize(event: DealEvent): Readonly<{ width:number; height:number }> {
  const width=event.type==="DEALER_CARD_DEALT" ? 60 : 41;
  return Object.freeze({ width, height:width/0.69 });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window!=="undefined" &&
    typeof window.matchMedia==="function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function createBlackjackCardFlightPresentation(
  app: HTMLElement,
  options: BlackjackCardFlightOptions = {},
): BlackjackCardFlightPresentation {
  const wait=options.wait ?? defaultWait;
  const reducedMotion=options.reducedMotion ?? prefersReducedMotion;
  const activeGhosts=new Set<HTMLElement>();
  let generation=0;

  const revealAllPending=(): void => {
    if(!supportsCardFlightDom(app)) return;
    for(const pending of Array.from(app.querySelectorAll<HTMLElement>(
      ".blackjack-card-flight-pending",
    ))){
      pending.classList.remove("blackjack-card-flight-pending");
      pending.classList.add("blackjack-card-flight-arrived");
      pending.removeAttribute("data-blackjack-flight-key");
    }
  };

  const prepare=(events: readonly BlackjackPresentationEvent[]): void => {
    if(!supportsCardFlightDom(app)) return;
    for(const event of events){
      if(!isDealEvent(event)) continue;
      const target=findExactTarget(app,event);
      if(target===null) continue;
      target.dataset.blackjackFlightKey=eventKey(event);
      target.classList.add("blackjack-card-flight-pending");
      target.classList.remove("blackjack-card-flight-arrived");
    }
  };

  const play=async(event: BlackjackPresentationEvent): Promise<void> => {
    if(!isDealEvent(event) || !supportsCardFlightDom(app)) return;

    const ownGeneration=generation;
    const key=eventKey(event);
    const exact=app.querySelector<HTMLElement>(
      '[data-blackjack-flight-key="'+key+'"]',
    );
    const destination=exact ?? targetContainer(app,event);
    const shoe=app.querySelector<HTMLElement>(".blackjack-shoe");

    if(destination===null){
      exact?.classList.remove("blackjack-card-flight-pending");
      return;
    }

    if(reducedMotion() || shoe===null || typeof destination.getBoundingClientRect!=="function"){
      exact?.classList.remove("blackjack-card-flight-pending");
      exact?.classList.add("blackjack-card-flight-arrived");
      exact?.removeAttribute("data-blackjack-flight-key");
      return;
    }

    const document=app.ownerDocument;
    const shoeRect=shoe.getBoundingClientRect();
    const targetRect=destination.getBoundingClientRect();
    const fallback=fallbackSize(event);
    const width=targetRect.width>0 && exact!==null ? targetRect.width : fallback.width;
    const height=targetRect.height>0 && exact!==null ? targetRect.height : fallback.height;
    const destinationLeft=
      exact!==null && targetRect.width>0
        ? targetRect.left
        : targetRect.left+Math.max(0,(targetRect.width-width)/2);
    const destinationTop=
      exact!==null && targetRect.height>0
        ? targetRect.top
        : targetRect.top+Math.max(0,(targetRect.height-height)/2);
    const shoeCenterX=shoeRect.left+shoeRect.width/2;
    const shoeCenterY=shoeRect.top+shoeRect.height/2;
    const startLeft=shoeCenterX-width/2;
    const startTop=shoeCenterY-height/2;

    const ghost=createCardGhost(document,event,exact);
    ghost.style.left=destinationLeft+"px";
    ghost.style.top=destinationTop+"px";
    ghost.style.width=width+"px";
    ghost.style.height=height+"px";
    ghost.style.setProperty(
      "--blackjack-card-flight-x",
      startLeft-destinationLeft+"px",
    );
    ghost.style.setProperty(
      "--blackjack-card-flight-y",
      startTop-destinationTop+"px",
    );

    document.body.append(ghost);
    activeGhosts.add(ghost);
    shoe.classList.add("is-dealing-card");
    void ghost.offsetWidth;
    ghost.classList.add("is-running");

    await wait(FLIGHT_DURATION_MS);

    if(ownGeneration===generation){
      exact?.classList.remove("blackjack-card-flight-pending");
      exact?.classList.add("blackjack-card-flight-arrived");
      exact?.removeAttribute("data-blackjack-flight-key");
    }
    ghost.remove();
    activeGhosts.delete(ghost);
    shoe.classList.remove("is-dealing-card");

    if(ownGeneration===generation){
      await wait(FLIGHT_SETTLE_MS);
    }
  };

  return Object.freeze({
    prepare,
    play,
    clear:()=>{
      generation+=1;
      revealAllPending();
      for(const ghost of activeGhosts) ghost.remove();
      activeGhosts.clear();
      if(supportsCardFlightDom(app)){
        app.querySelector<HTMLElement>(".blackjack-shoe")?.classList.remove(
          "is-dealing-card",
        );
      }
    },
  });
}
