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
  renderBlackjackSeat,
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
  requireElement<HTMLElement>(
    app,
    ".blackjack-dealer-cards",
  ).innerHTML=renderBlackjackCardStack(
    model.dealerCards,
    2,
    "is-dealer",
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
    current.outerHTML=renderBlackjackSeat(nextSeat);
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

function patchActions(
  app: HTMLElement,
  model: BlackjackTableViewModel,
): void {
  const enabled=new Set<BlackjackTableAction>(
    model.enabledActions ?? [],
  );
  for(const action of ["HIT","STAND","DOUBLE","SPLIT"] as const){
    requireElement<HTMLButtonElement>(
      app,
      '[data-blackjack-action="' + action + '"]',
    ).disabled=!enabled.has(action);
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

  const result=document.createElement("div");
  result.className="blackjack-round-result";
  result.dataset.resultTone=model.roundResult.tone;
  result.setAttribute("aria-live","polite");

  const title=document.createElement("strong");
  title.textContent=model.roundResult.title;
  const detail=document.createElement("span");
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
): BlackjackTableDomRenderer {
  let previous: BlackjackTableViewModel | null=null;

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
