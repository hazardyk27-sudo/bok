import {
  BLACKJACK_BASE_CHIP_DENOMINATIONS,
  BLACKJACK_DEFAULT_BETTING_PANEL,
  BLACKJACK_HIGH_CHIP_BASE_CREDITS,
  formatBlackjackChipCredits,
  getBlackjackChipTier,
  type BlackjackBettingPanelViewModel,
} from "./bettingView";
import {
  renderBlackjackCardStack,
  renderBlackjackTableShell,
  type BlackjackTableAction,
  type BlackjackTableSeatViewModel,
  type BlackjackTableViewModel,
} from "./tableView";

export type BlackjackTableDomRenderer = Readonly<{
  render: (model: BlackjackTableViewModel) => void;
  reset: () => void;
}>;

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element=root.querySelector<T>(selector);
  if(!element){
    throw new Error("Blackjack DOM patch target missing: " + selector);
  }
  return element;
}

function setText(
  root: ParentNode,
  selector: string,
  value: string,
): void {
  requireElement<HTMLElement>(root,selector).textContent=value;
}

function replaceChildrenFromMarkup(
  element: HTMLElement,
  markup: string,
): void {
  const template=element.ownerDocument.createElement("template");
  template.innerHTML=markup;
  element.replaceChildren(
    ...Array.from(template.content.childNodes),
  );
}

function patchOptionalTextNode(input:{
  parent: HTMLElement;
  selector: string;
  className: string;
  text: string | null;
  tagName?: "span" | "strong";
}): void {
  const current=input.parent.querySelector<HTMLElement>(input.selector);
  if(input.text===null){
    current?.remove();
    return;
  }
  if(current){
    current.textContent=input.text;
    return;
  }
  const node=input.parent.ownerDocument.createElement(
    input.tagName ?? "span",
  );
  node.className=input.className;
  node.textContent=input.text;
  input.parent.append(node);
}

function patchSeatAction(
  copy: HTMLElement,
  seat: BlackjackTableSeatViewModel,
): void {
  const current=copy.querySelector<HTMLButtonElement>(
    ".blackjack-seat-action",
  );

  if(!seat.canLeave){
    current?.remove();
    return;
  }

  if(
    current &&
    current.dataset.blackjackSeatAction==="LEAVE"
  ){
    current.dataset.seat=String(seat.seatNumber);
    current.textContent="LEAVE";
    current.classList.add("is-leave");
    return;
  }

  const button=copy.ownerDocument.createElement("button");
  button.type="button";
  button.className="blackjack-seat-action is-leave";
  button.dataset.blackjackSeatAction="LEAVE";
  button.dataset.seat=String(seat.seatNumber);
  button.textContent="LEAVE";
  current?.replaceWith(button) ?? copy.append(button);
}

function patchSeatNode(
  current: HTMLElement,
  seat: BlackjackTableSeatViewModel,
  previous: BlackjackTableSeatViewModel,
): void {
  current.classList.toggle("is-local",seat.isLocal);
  current.classList.toggle("is-claimable",seat.canClaim===true);
  current.classList.toggle(
    "is-selected-for-claim",
    seat.isSelectedForClaim===true,
  );
  current.dataset.status=seat.status;
  current.dataset.local=seat.isLocal ? "true" : "false";
  current.dataset.blackjackSeatSelect=
    seat.canClaim===true ? "true" : "false";
  if(seat.canClaim===true){
    current.setAttribute("role","button");
    current.tabIndex=0;
  } else {
    current.removeAttribute("role");
    current.removeAttribute("tabindex");
  }

  setText(current,".blackjack-seat-label",seat.label);

  const copy=requireElement<HTMLElement>(
    current,
    ".blackjack-seat-copy",
  );
  patchOptionalTextNode({
    parent:copy,
    selector:".blackjack-seat-total",
    className:"blackjack-seat-total",
    text:seat.total===null ? null : String(seat.total),
    tagName:"strong",
  });
  patchOptionalTextNode({
    parent:copy,
    selector:".blackjack-seat-bet",
    className:"blackjack-seat-bet",
    text:seat.betLabel===null ? null : "BET " + seat.betLabel,
  });
  patchSeatAction(copy,seat);

  if(!sameValue(seat.cards,previous.cards)){
    const cards=requireElement<HTMLElement>(
      current,
      ".blackjack-seat-cards",
    );
    replaceChildrenFromMarkup(
      cards,
      renderBlackjackCardStack(seat.cards,2),
    );
  }
}

function patchConnection(
  app: HTMLElement,
  model: BlackjackTableViewModel,
): void {
  const status=requireElement<HTMLElement>(
    app,
    ".blackjack-topbar-status",
  );
  const connection=model.connectionStatus ?? {
    label:"CONNECTING",
    tone:"connecting" as const,
  };
  status.dataset.connectionTone=connection.tone;
  setText(
    status,
    ".blackjack-connection-label",
    connection.label,
  );
  setText(
    status,
    ".blackjack-turn-label",
    model.turnLabel,
  );
}

function patchHud(
  app: HTMLElement,
  model: BlackjackTableViewModel,
): void {
  setText(
    app,
    '[data-blackjack-stat="phase"]',
    model.phaseLabel,
  );
  setText(
    app,
    '[data-blackjack-stat="balance"]',
    model.balanceLabel,
  );
  setText(
    app,
    '[data-blackjack-stat="bet"]',
    model.betLabel,
  );
}

function patchDealer(
  app: HTMLElement,
  model: BlackjackTableViewModel,
  previous: BlackjackTableViewModel,
): void {
  setText(
    app,
    ".blackjack-dealer-total",
    model.dealerTotalLabel,
  );

  if(sameValue(model.dealerCards,previous.dealerCards)) return;
  replaceChildrenFromMarkup(
    requireElement<HTMLElement>(
      app,
      ".blackjack-dealer-cards",
    ),
    renderBlackjackCardStack(
      model.dealerCards,
      2,
      "is-dealer",
    ),
  );
}

function seatByNumber(
  seats: readonly BlackjackTableSeatViewModel[],
  seatNumber: BlackjackTableSeatViewModel["seatNumber"],
): BlackjackTableSeatViewModel {
  const seat=seats.find(
    (candidate)=>candidate.seatNumber===seatNumber,
  );
  if(!seat){
    throw new Error(
      "Blackjack table view requires all five seat numbers",
    );
  }
  return seat;
}

function patchSeats(
  app: HTMLElement,
  model: BlackjackTableViewModel,
  previous: BlackjackTableViewModel,
): void {
  for(const seatNumber of [1,2,3,4,5] as const){
    const nextSeat=seatByNumber(model.seats,seatNumber);
    const oldSeat=seatByNumber(previous.seats,seatNumber);
    if(sameValue(nextSeat,oldSeat)) continue;

    const current=requireElement<HTMLElement>(
      app,
      '.blackjack-seat[data-seat="' + seatNumber + '"]',
    );
    patchSeatNode(current,nextSeat,oldSeat);
  }
}

function affordable(
  model: BlackjackBettingPanelViewModel,
  credits: number,
): boolean {
  return (
    model.availableBalanceCents===null ||
    credits*100<=model.availableBalanceCents
  );
}

function patchBettingPanel(
  app: HTMLElement,
  model: BlackjackBettingPanelViewModel,
): void {
  const panel=requireElement<HTMLElement>(
    app,
    ".blackjack-betting-panel",
  );

  for(const credits of BLACKJACK_BASE_CHIP_DENOMINATIONS){
    const button=requireElement<HTMLButtonElement>(
      panel,
      '.blackjack-chip-tray [data-blackjack-chip="' +
        credits +
        '"]',
    );
    const selected=credits===model.selectedChipCredits;
    button.classList.toggle("is-selected",selected);
    button.setAttribute(
      "aria-pressed",
      selected ? "true" : "false",
    );
    button.disabled=
      !model.enabled ||
      model.pending ||
      !affordable(model,credits);
  }

  const highChip=
    model.selectedChipCredits>=BLACKJACK_HIGH_CHIP_BASE_CREDITS
      ? model.selectedChipCredits
      : BLACKJACK_HIGH_CHIP_BASE_CREDITS;
  const highControl=requireElement<HTMLElement>(
    panel,
    ".blackjack-high-chip-control",
  );
  highControl.dataset.chipTier=getBlackjackChipTier(highChip);

  const highButton=requireElement<HTMLButtonElement>(
    panel,
    ".blackjack-high-chip-value",
  );
  highButton.dataset.blackjackChip=String(highChip);
  highButton.dataset.blackjackSelectedChip=String(highChip);
  highButton.textContent=formatBlackjackChipCredits(highChip);
  highButton.disabled=
    !model.enabled ||
    model.pending ||
    !affordable(model,highChip);

  const doubleButton=requireElement<HTMLButtonElement>(
    panel,
    '[data-blackjack-chip-scale="DOUBLE"]',
  );
  doubleButton.disabled=!model.enabled || model.pending;

  setText(
    panel,
    ".blackjack-bet-circle strong",
    model.totalBetLabel,
  );

  const clear=requireElement<HTMLButtonElement>(
    panel,
    '[data-blackjack-bet-action="CLEAR"]',
  );
  clear.disabled=!model.canClear || model.pending;

  const ready=requireElement<HTMLButtonElement>(
    panel,
    '[data-blackjack-bet-action="READY"]',
  );
  ready.disabled=!model.canReady || model.pending;
  ready.textContent=model.readyLabel;

  setText(
    panel,
    ".blackjack-betting-deadline strong",
    model.bettingClosesLabel,
  );
}

function patchInteraction(
  app: HTMLElement,
  model: BlackjackTableViewModel,
): void {
  const hud=requireElement<HTMLElement>(
    app,
    ".blackjack-hud",
  );
  const mode=model.interactionMode ?? "WAIT";
  hud.dataset.interactionMode=mode;

  setText(
    app,
    ".blackjack-context-prompt",
    model.interactionPrompt ?? "WAITING FOR TABLE",
  );

  requireElement<HTMLElement>(
    app,
    ".blackjack-betting-region",
  ).hidden=mode!=="BETTING";

  requireElement<HTMLElement>(
    app,
    ".blackjack-actions",
  ).hidden=mode!=="TURN";

  const confirm=requireElement<HTMLElement>(
    app,
    "[data-blackjack-seat-confirm]",
  );
  const selected=model.selectedSeatForClaim ?? null;
  confirm.hidden=selected===null;
  setText(
    confirm,
    "[data-blackjack-selected-seat]",
    selected===null ? "—" : String(selected),
  );
  for(const button of confirm.querySelectorAll<HTMLButtonElement>("button")){
    button.disabled=model.seatClaimPending===true;
  }
}

function patchActions(
  app: HTMLElement,
  model: BlackjackTableViewModel,
): void {
  const enabled=new Set<BlackjackTableAction>(
    model.enabledActions ?? [],
  );
  for(const action of ["HIT","STAND","DOUBLE","SPLIT"] as const){
    const button=requireElement<HTMLButtonElement>(
      app,
      '[data-blackjack-action="' + action + '"]',
    );
    button.disabled=!enabled.has(action);
    if(action==="DOUBLE" || action==="SPLIT"){
      button.hidden=!enabled.has(action);
    } else {
      button.hidden=false;
    }
  }

  const feedback=requireElement<HTMLElement>(
    app,
    ".blackjack-action-feedback",
  );
  feedback.dataset.actionTone=model.actionStatusTone ?? "neutral";
  feedback.textContent=model.actionStatusLabel ?? "";
}

function patchRoundResult(
  app: HTMLElement,
  model: BlackjackTableViewModel,
  previous: BlackjackTableViewModel,
): void {
  if(sameValue(model.roundResult,previous.roundResult)) return;

  const region=requireElement<HTMLElement>(
    app,
    '[data-blackjack-region="round-result"]',
  );
  region.replaceChildren();

  if(!model.roundResult) return;

  const result=region.ownerDocument.createElement("div");
  result.className="blackjack-round-result";
  result.dataset.resultTone=model.roundResult.tone;
  result.setAttribute("aria-live","polite");

  const title=region.ownerDocument.createElement("strong");
  title.textContent=model.roundResult.title;
  const detail=region.ownerDocument.createElement("span");
  detail.textContent=model.roundResult.detail;

  result.append(title,detail);
  region.append(result);
}

function normalizeBettingPanel(
  model: BlackjackTableViewModel,
): BlackjackBettingPanelViewModel {
  return model.bettingPanel ?? {
    ...BLACKJACK_DEFAULT_BETTING_PANEL,
    totalBetLabel:model.betLabel,
  };
}

export function createBlackjackTableDomRenderer(
  app: HTMLElement,
  initialModel: BlackjackTableViewModel | null = null,
): BlackjackTableDomRenderer {
  const hasMountedShell=
    typeof app.querySelector==="function" &&
    app.querySelector(".blackjack-root")!==null;
  let previous: BlackjackTableViewModel | null=
    hasMountedShell ? initialModel : null;

  const mount=(model: BlackjackTableViewModel)=>{
    app.innerHTML=renderBlackjackTableShell(model);
    previous=model;
  };

  const render=(model: BlackjackTableViewModel)=>{
    if(
      previous===null ||
      typeof app.querySelector!=="function"
    ){
      mount(model);
      return;
    }

    try {
      patchConnection(app,model);
      patchHud(app,model);
      patchDealer(app,model,previous);
      patchSeats(app,model,previous);
      patchBettingPanel(
        app,
        normalizeBettingPanel(model),
      );
      patchInteraction(app,model);
      patchActions(app,model);
      patchRoundResult(app,model,previous);
      previous=model;
    } catch {
      mount(model);
    }
  };

  return Object.freeze({
    render,
    reset:()=>{
      previous=null;
    },
  });
}
