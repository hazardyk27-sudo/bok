import "./cardFlight.css";
import type { BlackjackPresentationEvent } from "./presentationQueue";

type DealEvent = Extract<
  BlackjackPresentationEvent,
  { type: "PLAYER_CARD_DEALT" | "DEALER_CARD_DEALT" }
>;

type DealerHoleRevealEvent = Extract<
  BlackjackPresentationEvent,
  { type: "DEALER_HOLE_REVEALED" }
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
const HOLE_FLIP_HALF_MS=190;
const HOLE_FLIP_SETTLE_MS=40;

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

function isDealerHoleRevealEvent(
  event: BlackjackPresentationEvent,
): event is DealerHoleRevealEvent {
  return event.type==="DEALER_HOLE_REVEALED";
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

function holeRevealKey(event: DealerHoleRevealEvent): string {
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

function dealerContainer(app: HTMLElement): HTMLElement | null {
  if(!supportsCardFlightDom(app)) return null;
  return app.querySelector<HTMLElement>(".blackjack-dealer-cards");
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

function findHoleRevealTarget(
  app: HTMLElement,
  event: DealerHoleRevealEvent,
): HTMLElement | null {
  const container=dealerContainer(app);
  if(container===null) return null;
  const target=cardAt(container,event.cardIndex);
  if(target===null) return null;
  return (
    target.dataset.cardRank===event.card.rank &&
    target.dataset.cardSuit===event.card.suit
  ) ? target : null;
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

function rankValue(rank:string): number | null {
  if(rank==="A") return 11;
  if(rank==="K" || rank==="Q" || rank==="J") return 10;
  const parsed=Number(rank);
  return Number.isInteger(parsed) && parsed>=2 && parsed<=10 ? parsed : null;
}

function updateDealerPresentationTotal(
  app: HTMLElement,
  pulse:boolean,
): void {
  if(!supportsCardFlightDom(app)) return;
  const cards=dealerContainer(app);
  const label=app.querySelector<HTMLElement>(".blackjack-dealer-total");
  if(cards===null || label===null) return;

  let total=0;
  let aces=0;
  let visibleCount=0;
  let hiddenCardVisible=false;

  for(const card of Array.from(cards.children)){
    if(!(card instanceof app.ownerDocument.defaultView!.HTMLElement)) continue;
    const element=card as HTMLElement;
    if(element.classList.contains("blackjack-card-flight-pending")) continue;

    const flipPending=
      element.classList.contains("blackjack-card-flip-pending") ||
      element.classList.contains("blackjack-card-flip-out");
    if(flipPending || element.dataset.cardHidden==="true"){
      hiddenCardVisible=true;
      continue;
    }

    const rank=element.dataset.cardRank;
    if(rank===undefined) continue;
    const value=rankValue(rank);
    if(value===null) continue;
    total+=value;
    if(rank==="A") aces+=1;
    visibleCount+=1;
  }

  while(total>21 && aces>0){
    total-=10;
    aces-=1;
  }

  const nextLabel=
    visibleCount===0
      ? hiddenCardVisible ? "?" : "DEALER"
      : (total>21 ? "BUST "+total : String(total)) +
        (hiddenCardVisible ? " + ?" : "");

  if(label.textContent===nextLabel) return;
  label.textContent=nextLabel;
  if(!pulse) return;
  label.classList.remove("is-counting");
  void label.offsetWidth;
  label.classList.add("is-counting");
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
    for(const flipping of Array.from(app.querySelectorAll<HTMLElement>(
      ".blackjack-card-flip-pending, .blackjack-card-flip-out, .blackjack-card-flip-in",
    ))){
      flipping.classList.remove(
        "blackjack-card-flip-pending",
        "blackjack-card-flip-out",
        "blackjack-card-flip-in",
      );
      flipping.removeAttribute("data-blackjack-flip-key");
    }
    updateDealerPresentationTotal(app,false);
  };

  const prepare=(events: readonly BlackjackPresentationEvent[]): void => {
    if(!supportsCardFlightDom(app)) return;
    let stagesDealer=false;

    for(const event of events){
      if(isDealEvent(event)){
        const target=findExactTarget(app,event);
        if(target===null) continue;
        target.dataset.blackjackFlightKey=eventKey(event);
        target.classList.add("blackjack-card-flight-pending");
        target.classList.remove("blackjack-card-flight-arrived");
        if(event.type==="DEALER_CARD_DEALT") stagesDealer=true;
        continue;
      }

      if(isDealerHoleRevealEvent(event)){
        const target=findHoleRevealTarget(app,event);
        if(target===null) continue;
        target.dataset.blackjackFlipKey=holeRevealKey(event);
        target.classList.remove("blackjack-card-flip-in","blackjack-card-flip-out");
        target.classList.add("blackjack-card-flip-pending");
        stagesDealer=true;
      }
    }

    if(stagesDealer){
      updateDealerPresentationTotal(app,false);
    }
  };

  const playHoleReveal=async(event:DealerHoleRevealEvent): Promise<void> => {
    if(!supportsCardFlightDom(app)) return;
    const key=holeRevealKey(event);
    const target=app.querySelector<HTMLElement>(
      '[data-blackjack-flip-key="'+key+'"]',
    ) ?? findHoleRevealTarget(app,event);
    if(target===null) return;

    const ownGeneration=generation;
    if(reducedMotion()){
      target.classList.remove(
        "blackjack-card-flip-pending",
        "blackjack-card-flip-out",
        "blackjack-card-flip-in",
      );
      target.removeAttribute("data-blackjack-flip-key");
      updateDealerPresentationTotal(app,true);
      return;
    }

    target.classList.add("blackjack-card-flip-out");
    await wait(HOLE_FLIP_HALF_MS);
    if(ownGeneration!==generation) return;

    target.classList.remove("blackjack-card-flip-pending","blackjack-card-flip-out");
    target.classList.add("blackjack-card-flip-in");
    updateDealerPresentationTotal(app,true);

    await wait(HOLE_FLIP_HALF_MS);
    if(ownGeneration!==generation) return;

    target.classList.remove("blackjack-card-flip-in");
    target.removeAttribute("data-blackjack-flip-key");
    await wait(HOLE_FLIP_SETTLE_MS);
  };

  const playDeal=async(event:DealEvent): Promise<void> => {
    if(!supportsCardFlightDom(app)) return;

    const ownGeneration=generation;
    const key=eventKey(event);
    const exact=app.querySelector<HTMLElement>(
      '[data-blackjack-flight-key="'+key+'"]',
    );
    const destination=exact ?? targetContainer(app,event);
    const shoe=app.querySelector<HTMLElement>(".blackjack-shoe");

    const revealExact=()=>{
      exact?.classList.remove("blackjack-card-flight-pending");
      exact?.classList.add("blackjack-card-flight-arrived");
      exact?.removeAttribute("data-blackjack-flight-key");
      if(event.type==="DEALER_CARD_DEALT"){
        updateDealerPresentationTotal(app,true);
      }
    };

    if(destination===null){
      revealExact();
      return;
    }

    if(reducedMotion() || shoe===null || typeof destination.getBoundingClientRect!=="function"){
      revealExact();
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
      revealExact();
    }
    ghost.remove();
    activeGhosts.delete(ghost);
    shoe.classList.remove("is-dealing-card");

    if(ownGeneration===generation){
      await wait(FLIGHT_SETTLE_MS);
    }
  };

  const play=async(event: BlackjackPresentationEvent): Promise<void> => {
    if(isDealerHoleRevealEvent(event)){
      await playHoleReveal(event);
      return;
    }
    if(isDealEvent(event)){
      await playDeal(event);
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
        app.querySelector<HTMLElement>(".blackjack-dealer-total")?.classList.remove(
          "is-counting",
        );
      }
    },
  });
}
