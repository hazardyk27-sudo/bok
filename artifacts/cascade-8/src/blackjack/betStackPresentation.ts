import "./betStack.css";
import { formatBlackjackChipCredits } from "./bettingView";

export type BlackjackBetStackPresentationState = Readonly<{
  chipValuesCents: readonly number[];
  betCents: number;
  status: "OPEN" | "READY" | "LOCKED" | null;
  pending: boolean;
}>;

export type BlackjackBetStackPresentation = Readonly<{
  sync: (state: BlackjackBetStackPresentationState) => void;
  clear: () => void;
}>;

function supportsDom(app: HTMLElement): boolean {
  const candidate=app as unknown as {
    querySelector?: unknown;
    ownerDocument?: { createElement?: unknown };
  };
  return (
    typeof candidate.querySelector==="function" &&
    typeof candidate.ownerDocument?.createElement==="function"
  );
}

function assertChipValue(value:number): void {
  if(!Number.isSafeInteger(value) || value<=0 || value%100!==0){
    throw new RangeError(
      "Blackjack table chip value must be a positive whole-credit amount",
    );
  }
}

function formatCents(cents:number): string {
  if(!Number.isSafeInteger(cents) || cents<0){
    throw new RangeError("Blackjack table bet cents must be non-negative");
  }
  if(cents===0) return "0";
  if(cents%100===0) return formatBlackjackChipCredits(cents/100);
  return (cents/100).toLocaleString("en-US",{
    minimumFractionDigits:2,
    maximumFractionDigits:2,
  });
}

function chipClass(credits:number): string {
  if(credits>=1_000) return "is-gold";
  if(credits>=500) return "is-purple";
  if(credits>=250) return "is-black";
  if(credits>=100) return "is-green";
  if(credits>=50) return "is-blue";
  if(credits>=25) return "is-red";
  return "is-white";
}

function createSpot(
  document: Document,
): HTMLElement {
  const spot=document.createElement("div");
  spot.className="blackjack-table-bet-spot";
  spot.dataset.blackjackBetSpot="true";
  spot.setAttribute("aria-label","Your Blackjack wager chips");

  const ring=document.createElement("span");
  ring.className="blackjack-table-bet-ring";
  ring.textContent="BET";

  const stack=document.createElement("div");
  stack.className="blackjack-table-chip-stack";
  stack.dataset.blackjackTableChipStack="true";

  const total=document.createElement("strong");
  total.className="blackjack-table-bet-total";
  total.dataset.blackjackTableBetTotal="true";
  total.textContent="0";

  spot.append(ring,stack,total);
  return spot;
}

export function createBlackjackBetStackPresentation(
  app: HTMLElement,
): BlackjackBetStackPresentation {
  let previousKey="";
  let mountedSpot:HTMLElement|null=null;

  const clear=()=>{
    mountedSpot?.remove();
    mountedSpot=null;
    previousKey="";
  };

  const sync=(state:BlackjackBetStackPresentationState)=>{
    if(!supportsDom(app)) return;
    for(const value of state.chipValuesCents) assertChipValue(value);
    if(!Number.isSafeInteger(state.betCents) || state.betCents<0){
      throw new RangeError("Blackjack table bet cents must be non-negative");
    }

    const localSeat=app.querySelector<HTMLElement>(".blackjack-seat.is-local");
    if(localSeat===null){
      clear();
      return;
    }

    if(
      mountedSpot===null ||
      !mountedSpot.isConnected ||
      mountedSpot.parentElement!==localSeat
    ){
      mountedSpot=createSpot(app.ownerDocument);
      localSeat.append(mountedSpot);
      previousKey="";
    }

    const stack=mountedSpot.querySelector<HTMLElement>(
      '[data-blackjack-table-chip-stack="true"]',
    );
    const total=mountedSpot.querySelector<HTMLElement>(
      '[data-blackjack-table-bet-total="true"]',
    );
    if(stack===null || total===null) return;

    const nextKey=state.chipValuesCents.join(",")+"|"+state.status;
    if(nextKey!==previousKey){
      const previousCount=
        previousKey.length===0 || previousKey.startsWith("|")
          ? 0
          : previousKey.split("|")[0]!.split(",").filter(Boolean).length;
      stack.replaceChildren();
      state.chipValuesCents.forEach((value,index)=>{
        const credits=value/100;
        const isUndoable=
          index===state.chipValuesCents.length-1 && state.status==="OPEN";
        const chip=app.ownerDocument.createElement(
          isUndoable ? "button" : "span",
        );
        chip.className=
          "blackjack-table-chip "+chipClass(credits)+
          (index===state.chipValuesCents.length-1 && index>=previousCount
            ? " is-new"
            : "");
        chip.dataset.chipCredits=String(credits);
        chip.style.setProperty("--blackjack-chip-index",String(index));
        chip.style.zIndex=String(10+index);
        chip.textContent=formatBlackjackChipCredits(credits);
        chip.setAttribute("aria-label",formatBlackjackChipCredits(credits)+" chip");
        if(isUndoable){
          (chip as HTMLButtonElement).type="button";
          chip.dataset.blackjackBetAction="UNDO";
          (chip as HTMLButtonElement).disabled=state.pending;
          chip.title="Remove last chip";
        }
        stack.append(chip);
      });
      previousKey=nextKey;
    }

    total.textContent=formatCents(state.betCents);
    mountedSpot.classList.toggle("has-chips",state.chipValuesCents.length>0);
    mountedSpot.classList.toggle(
      "is-locked",
      state.status==="READY" || state.status==="LOCKED",
    );
    mountedSpot.classList.toggle("is-pending",state.pending);
  };

  return Object.freeze({sync,clear});
}
