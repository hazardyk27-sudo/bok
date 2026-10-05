import "./settlementChipPresentation.css";
import type { BlackjackPresentationEvent } from "./presentationQueue";

type SettlementEvent = Extract<
  BlackjackPresentationEvent,
  { type: "HAND_SETTLED" }
>;

export type BlackjackSettlementChipPresentation = Readonly<{
  play: (event: BlackjackPresentationEvent) => Promise<void>;
  clear: () => void;
}>;

type BlackjackSettlementChipPresentationOptions = Readonly<{
  wait?: (durationMs: number) => Promise<void>;
  reducedMotion?: () => boolean;
}>;

const SETTLEMENT_FLIGHT_MS=430;
const SETTLEMENT_PUSH_MS=260;

function defaultWait(durationMs:number): Promise<void> {
  return new Promise((resolve)=>{
    window.setTimeout(resolve,durationMs);
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window!=="undefined" &&
    typeof window.matchMedia==="function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function supportsSettlementDom(app: HTMLElement): boolean {
  const candidate=app as unknown as {
    querySelector?: unknown;
    ownerDocument?: {
      body?: unknown;
      createElement?: unknown;
    };
  };
  return (
    typeof candidate.querySelector==="function" &&
    candidate.ownerDocument?.body!==undefined &&
    typeof candidate.ownerDocument?.createElement==="function"
  );
}

function isSettlementEvent(
  event: BlackjackPresentationEvent,
): event is SettlementEvent {
  return event.type==="HAND_SETTLED";
}

function assertMoney(label:string,value:number): void {
  if(!Number.isSafeInteger(value) || value<0){
    throw new RangeError(
      "Blackjack settlement presentation "+label+" must be non-negative cents",
    );
  }
}

function formatCreditsFromCents(cents:number): string {
  assertMoney("amount",cents);
  if(cents%100===0){
    return (cents/100).toLocaleString("en-US",{
      maximumFractionDigits:0,
    });
  }
  return (cents/100).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2,
  });
}

function profitCents(event:SettlementEvent): number {
  return Math.max(0,event.payoutCents-event.betCents);
}

function motionAmountCents(event:SettlementEvent): number {
  if(event.result==="LOSS") return event.betCents;
  if(event.result==="PUSH") return event.betCents;
  return profitCents(event);
}

function amountLabel(event:SettlementEvent): string {
  if(event.result==="PUSH") return "PUSH";
  const amount=motionAmountCents(event);
  const prefix=event.result==="LOSS" ? "−" : "+";
  return prefix+formatCreditsFromCents(amount);
}

function visualChipCount(amountCents:number): number {
  if(amountCents>=100_000) return 5;
  if(amountCents>=50_000) return 4;
  if(amountCents>=10_000) return 3;
  if(amountCents>=2_500) return 2;
  return 1;
}

function centerOf(element: HTMLElement): Readonly<{x:number;y:number}> {
  const rect=element.getBoundingClientRect();
  return Object.freeze({
    x:rect.left+rect.width/2,
    y:rect.top+rect.height/2,
  });
}

function settlementClass(event:SettlementEvent): string {
  if(event.result==="LOSS") return "is-loss";
  if(event.result==="PUSH") return "is-push";
  if(event.result==="BLACKJACK_WIN") return "is-blackjack-win";
  return "is-win";
}

function createFlight(
  app: HTMLElement,
  event: SettlementEvent,
  start: Readonly<{x:number;y:number}>,
  end: Readonly<{x:number;y:number}>,
): HTMLElement {
  const document=app.ownerDocument;
  const flight=document.createElement("div");
  flight.className=
    "blackjack-settlement-chip-flight "+settlementClass(event);
  flight.dataset.blackjackSettlementFlight="true";
  flight.dataset.result=event.result;
  flight.dataset.seat=String(event.seatNumber);
  flight.dataset.handId=event.handId;
  flight.setAttribute("aria-hidden","true");
  flight.style.left=end.x+"px";
  flight.style.top=end.y+"px";
  flight.style.setProperty(
    "--blackjack-settlement-x",
    start.x-end.x+"px",
  );
  flight.style.setProperty(
    "--blackjack-settlement-y",
    start.y-end.y+"px",
  );

  const stack=document.createElement("span");
  stack.className="blackjack-settlement-chip-stack";
  const chipCount=visualChipCount(motionAmountCents(event));
  for(let index=0;index<chipCount;index+=1){
    const chip=document.createElement("i");
    chip.style.setProperty("--blackjack-settlement-chip-index",String(index));
    stack.append(chip);
  }

  const label=document.createElement("strong");
  label.className="blackjack-settlement-chip-label";
  label.textContent=amountLabel(event);

  flight.append(stack,label);
  return flight;
}

export function createBlackjackSettlementChipPresentation(
  app: HTMLElement,
  options: BlackjackSettlementChipPresentationOptions = {},
): BlackjackSettlementChipPresentation {
  const wait=options.wait ?? defaultWait;
  const reducedMotion=options.reducedMotion ?? prefersReducedMotion;
  const activeFlights=new Set<HTMLElement>();
  let generation=0;

  const playSettlement=async(event:SettlementEvent): Promise<void> => {
    assertMoney("betCents",event.betCents);
    assertMoney("payoutCents",event.payoutCents);
    if(!supportsSettlementDom(app)) return;

    const seat=app.querySelector<HTMLElement>(
      '.blackjack-seat[data-seat="'+event.seatNumber+'"]',
    );
    const dealer=app.querySelector<HTMLElement>(".blackjack-dealer-zone");
    if(seat===null || dealer===null) return;

    const seatTarget=
      seat.querySelector<HTMLElement>(".blackjack-table-bet-spot") ?? seat;
    const seatCenter=centerOf(seatTarget);
    const dealerCenter=centerOf(dealer);
    const isLoss=event.result==="LOSS";
    const isPush=event.result==="PUSH";
    const start=isLoss ? seatCenter : isPush ? seatCenter : dealerCenter;
    const end=isLoss ? dealerCenter : seatCenter;

    const flight=createFlight(app,event,start,end);
    app.ownerDocument.body.append(flight);
    activeFlights.add(flight);
    seat.classList.add("is-settling-chips",settlementClass(event));

    const ownGeneration=generation;
    if(!reducedMotion()){
      void flight.offsetWidth;
      flight.classList.add("is-running");
      await wait(isPush ? SETTLEMENT_PUSH_MS : SETTLEMENT_FLIGHT_MS);
    }

    flight.remove();
    activeFlights.delete(flight);
    if(ownGeneration===generation){
      seat.classList.remove(
        "is-settling-chips",
        "is-win",
        "is-blackjack-win",
        "is-push",
        "is-loss",
      );
    }
  };

  return Object.freeze({
    play:async(event)=>{
      if(!isSettlementEvent(event)) return;
      await playSettlement(event);
    },
    clear:()=>{
      generation+=1;
      for(const flight of activeFlights) flight.remove();
      activeFlights.clear();
      if(!supportsSettlementDom(app)) return;
      for(const seat of Array.from(app.querySelectorAll<HTMLElement>(
        ".blackjack-seat.is-settling-chips",
      ))){
        seat.classList.remove(
          "is-settling-chips",
          "is-win",
          "is-blackjack-win",
          "is-push",
          "is-loss",
        );
      }
    },
  });
}
