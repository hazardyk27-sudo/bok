import "./actionDock.css";

export type BlackjackActionDock = Readonly<{
  refresh: () => void;
  destroy: () => void;
}>;

type BlackjackActionName = "HIT" | "STAND" | "DOUBLE" | "SPLIT";

type ActionButtonCopy = Readonly<{
  title: string;
  hint: string;
  ariaLabel: string;
}>;

const ACTION_COPY: Readonly<Record<BlackjackActionName, ActionButtonCopy>> =
  Object.freeze({
    HIT:Object.freeze({
      title:"HIT",
      hint:"TAKE A CARD",
      ariaLabel:"Hit — take a card",
    }),
    STAND:Object.freeze({
      title:"STAND",
      hint:"HOLD TOTAL",
      ariaLabel:"Stand — hold your total",
    }),
    DOUBLE:Object.freeze({
      title:"DOUBLE",
      hint:"2× BET · ONE CARD",
      ariaLabel:"Double — double the bet and take one card",
    }),
    SPLIT:Object.freeze({
      title:"SPLIT",
      hint:"PLAY PAIR AS TWO HANDS",
      ariaLabel:"Split — play the pair as two hands",
    }),
  });

const installedDocks=new WeakMap<HTMLElement,BlackjackActionDock>();

function requireActionButton(
  dock: HTMLElement,
  action: BlackjackActionName,
): HTMLButtonElement {
  const button=dock.querySelector<HTMLButtonElement>(
    '[data-blackjack-action="'+action+'"]',
  );
  if(button===null){
    throw new Error("Blackjack action dock missing "+action+" control");
  }
  return button;
}

function decorateActionButton(
  button: HTMLButtonElement,
  action: BlackjackActionName,
): void {
  if(button.dataset.blackjackActionDecorated==="true") return;
  const copy=ACTION_COPY[action];
  const strong=button.ownerDocument.createElement("strong");
  strong.textContent=copy.title;
  const small=button.ownerDocument.createElement("small");
  small.textContent=copy.hint;
  button.replaceChildren(strong,small);
  button.dataset.blackjackActionDecorated="true";
  button.setAttribute("aria-label",copy.ariaLabel);
}

function buildDockStructure(dock: HTMLElement): Readonly<{
  special: HTMLDetailsElement;
  specialCount: HTMLElement;
  stateLabel: HTMLElement;
}> {
  const document=dock.ownerDocument;
  const hit=requireActionButton(dock,"HIT");
  const stand=requireActionButton(dock,"STAND");
  const double=requireActionButton(dock,"DOUBLE");
  const split=requireActionButton(dock,"SPLIT");

  decorateActionButton(hit,"HIT");
  decorateActionButton(stand,"STAND");
  decorateActionButton(double,"DOUBLE");
  decorateActionButton(split,"SPLIT");

  const head=document.createElement("div");
  head.className="blackjack-action-dock-head";
  const copy=document.createElement("div");
  copy.className="blackjack-action-dock-copy";
  const kicker=document.createElement("span");
  kicker.textContent="YOUR MOVE";
  const title=document.createElement("strong");
  title.textContent="CHOOSE AN ACTION";
  copy.append(kicker,title);
  const stateLabel=document.createElement("span");
  stateLabel.className="blackjack-action-dock-state";
  stateLabel.setAttribute("aria-live","polite");
  stateLabel.textContent="READY";
  head.append(copy,stateLabel);

  const primary=document.createElement("div");
  primary.className="blackjack-action-primary";
  primary.append(hit,stand);

  const special=document.createElement("details");
  special.className="blackjack-action-special";
  special.open=true;
  const summary=document.createElement("summary");
  const summaryCopy=document.createElement("span");
  summaryCopy.textContent="SPECIAL MOVES";
  const specialCount=document.createElement("strong");
  specialCount.dataset.blackjackSpecialCount="true";
  specialCount.textContent="0 AVAILABLE";
  summary.append(summaryCopy,specialCount);
  const secondary=document.createElement("div");
  secondary.className="blackjack-action-secondary";
  secondary.append(double,split);
  special.append(summary,secondary);

  dock.replaceChildren(head,primary,special);
  dock.dataset.blackjackActionDock="enhanced";
  return Object.freeze({special,specialCount,stateLabel});
}

export function installBlackjackActionDock(app: HTMLElement): BlackjackActionDock {
  const previous=installedDocks.get(app);
  if(previous!==undefined) return previous;

  const dock=app.querySelector<HTMLElement>(".blackjack-actions");
  if(dock===null){
    const noop=Object.freeze({
      refresh:()=>{},
      destroy:()=>{},
    });
    return noop;
  }

  const structure=buildDockStructure(dock);
  const buttons=(
    ["HIT","STAND","DOUBLE","SPLIT"] as const
  ).map((action)=>requireActionButton(dock,action));
  const specialButtons=[
    requireActionButton(dock,"DOUBLE"),
    requireActionButton(dock,"SPLIT"),
  ] as const;
  let previousSpecialCount=0;
  let destroyed=false;

  const refresh=()=>{
    if(destroyed) return;
    const specialCount=specialButtons.filter((button)=>!button.hidden).length;
    structure.special.hidden=specialCount===0;
    structure.specialCount.textContent=
      specialCount+" AVAILABLE";
    if(specialCount>0 && previousSpecialCount===0){
      structure.special.open=true;
    }
    previousSpecialCount=specialCount;

    const visibleButtons=buttons.filter((button)=>!button.hidden);
    const ready=visibleButtons.some((button)=>!button.disabled);
    const locked=visibleButtons.length>0 && !ready;
    dock.dataset.actionState=locked ? "locked" : "ready";
    structure.stateLabel.textContent=locked ? "WAITING FOR SERVER" : "READY";
  };

  const observer=
    typeof MutationObserver==="function"
      ? new MutationObserver((mutations)=>{
          if(mutations.some((mutation)=>
            mutation.type==="attributes" &&
            (mutation.attributeName==="hidden" || mutation.attributeName==="disabled")
          )){
            refresh();
          }
        })
      : null;
  if(observer!==null){
    for(const button of buttons){
      observer.observe(button,{
        attributes:true,
        attributeFilter:["hidden","disabled"],
      });
    }
  }

  refresh();

  const controller: BlackjackActionDock=Object.freeze({
    refresh,
    destroy:()=>{
      if(destroyed) return;
      destroyed=true;
      observer?.disconnect();
      installedDocks.delete(app);
    },
  });
  installedDocks.set(app,controller);
  return controller;
}
