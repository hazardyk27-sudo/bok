// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  BLACKJACK_DEFAULT_BETTING_PANEL,
} from "./bettingView";
import {
  createBlackjackTableDomRenderer,
} from "./domRenderer";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  renderBlackjackTableShell,
  type BlackjackTableViewModel,
} from "./tableView";

function model(
  overrides: Partial<BlackjackTableViewModel> = {},
): BlackjackTableViewModel {
  return {
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    connectionStatus:{
      label:"LIVE",
      tone:"live",
    },
    phaseLabel:"BETTING",
    balanceLabel:"10K",
    betLabel:"0",
    turnLabel:"BETTING · 8s",
    bettingPanel:{
      ...BLACKJACK_DEFAULT_BETTING_PANEL,
      selectedChipCredits:100,
      totalBetLabel:"0",
      readyLabel:"READY",
      bettingClosesLabel:"08",
      enabled:true,
      pending:false,
      canClear:false,
      canReady:false,
      availableBalanceCents:1_000_000,
    },
    ...overrides,
  };
}

describe("blackjack incremental DOM renderer",()=>{
  it("adopts an already-mounted connecting shell without replacing the root",()=>{
    const app=document.createElement("div");
    app.innerHTML=renderBlackjackTableShell(
      BLACKJACK_DEFAULT_TABLE_VIEW,
    );
    document.body.append(app);
    const root=app.querySelector(".blackjack-root");

    const renderer=createBlackjackTableDomRenderer(
      app,
      BLACKJACK_DEFAULT_TABLE_VIEW,
    );
    renderer.render(model({turnLabel:"BETTING · 8s"}));

    expect(app.querySelector(".blackjack-root")).toBe(root);
    expect(
      app.querySelector(".blackjack-turn-label")?.textContent,
    ).toBe("BETTING · 8s");
  });

  it("preserves the mounted table, chip focus and chip tray scroll on countdown-only patches",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    renderer.render(model());

    const root=app.querySelector(".blackjack-root");
    const tray=app.querySelector<HTMLElement>(".blackjack-chip-tray");
    const chip=app.querySelector<HTMLButtonElement>(
      '[data-blackjack-chip="100"]',
    );
    expect(root).not.toBeNull();
    expect(tray).not.toBeNull();
    expect(chip).not.toBeNull();

    tray!.scrollLeft=137;
    chip!.focus();
    expect(document.activeElement).toBe(chip);

    renderer.render(model({
      turnLabel:"BETTING · 7s",
      bettingPanel:{
        ...BLACKJACK_DEFAULT_BETTING_PANEL,
        selectedChipCredits:100,
        totalBetLabel:"0",
        readyLabel:"READY",
        bettingClosesLabel:"07",
        enabled:true,
        pending:false,
        canClear:false,
        canReady:false,
        availableBalanceCents:1_000_000,
      },
    }));

    expect(app.querySelector(".blackjack-root")).toBe(root);
    expect(
      app.querySelector('[data-blackjack-chip="100"]'),
    ).toBe(chip);
    expect(tray!.scrollLeft).toBe(137);
    expect(document.activeElement).toBe(chip);
    expect(
      app.querySelector(".blackjack-turn-label")?.textContent,
    ).toBe("BETTING · 7s");
    expect(
      app.querySelector(".blackjack-betting-deadline strong")
        ?.textContent,
    ).toBe("07");
  });

  it("patches a changed seat without replacing the seat node",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    const initial=model();
    renderer.render(initial);

    const root=app.querySelector(".blackjack-root");
    const seat1=app.querySelector('[data-seat="1"]');
    const seat2=app.querySelector('[data-seat="2"]');

    const seats=initial.seats.map((seat)=>
      seat.seatNumber===1
        ? {
            ...seat,
            label:"PLAYER A",
            status:"ACTIVE" as const,
            total:17,
            betLabel:"100",
            cards:[
              {rank:"10" as const,suit:"HEARTS" as const},
              {rank:"7" as const,suit:"SPADES" as const},
            ],
          }
        : seat,
    );

    renderer.render(model({seats}));

    expect(app.querySelector(".blackjack-root")).toBe(root);
    expect(app.querySelector('[data-seat="1"]')).toBe(seat1);
    expect(app.querySelector('[data-seat="2"]')).toBe(seat2);
    expect(
      app.querySelector(
        '[data-seat="1"] .blackjack-seat-label',
      )?.textContent,
    ).toBe("PLAYER A");
  });
  it("preserves a focused claimable seat node across contextual patches",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    const initial=model({
      interactionMode:"SEAT",
      interactionPrompt:"CHOOSE AN OPEN SEAT",
      seats:BLACKJACK_DEFAULT_TABLE_VIEW.seats.map((seat)=>
        seat.seatNumber===1
          ? {...seat,canClaim:true}
          : seat,
      ),
    });
    renderer.render(initial);

    const seat=app.querySelector<HTMLElement>('[data-seat="1"]');
    expect(seat).not.toBeNull();
    expect(seat?.dataset.blackjackSeatSelect).toBe("true");
    expect(seat?.getAttribute("role")).toBe("button");

    seat!.focus();
    expect(document.activeElement).toBe(seat);

    renderer.render(model({
      interactionMode:"SEAT",
      interactionPrompt:"CONFIRM YOUR SEAT",
      selectedSeatForClaim:1,
      seats:initial.seats.map((entry)=>
        entry.seatNumber===1
          ? {
              ...entry,
              label:"OPEN · TAP TO SIT",
              isSelectedForClaim:true,
            }
          : entry,
      ),
    }));

    expect(app.querySelector('[data-seat="1"]')).toBe(seat);
    expect(seat?.classList.contains("is-selected-for-claim")).toBe(true);
    expect(document.activeElement).toBe(seat);
    expect(
      app.querySelector("[data-blackjack-seat-confirm]")?.hasAttribute("hidden"),
    ).toBe(false);
    expect(
      app.querySelector("[data-blackjack-selected-seat]")?.textContent,
    ).toBe("1");
  });

  it("keeps dealer and seat card containers stable while patching card contents",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    renderer.render(model());

    const dealerCards=app.querySelector(".blackjack-dealer-cards");
    const seatCards=app.querySelector(
      '[data-seat="1"] .blackjack-seat-cards',
    );

    renderer.render(model({
      dealerCards:[
        {rank:"A",suit:"SPADES"},
        null,
      ],
      seats:BLACKJACK_DEFAULT_TABLE_VIEW.seats.map((seat)=>
        seat.seatNumber===1
          ? {
              ...seat,
              status:"ACTIVE" as const,
              label:"PLAYER",
              cards:[
                {rank:"10" as const,suit:"HEARTS" as const},
                {rank:"6" as const,suit:"CLUBS" as const},
              ],
            }
          : seat,
      ),
    }));

    expect(app.querySelector(".blackjack-dealer-cards"))
      .toBe(dealerCards);
    expect(
      app.querySelector('[data-seat="1"] .blackjack-seat-cards'),
    ).toBe(seatCards);
    expect(
      dealerCards?.querySelector('[data-card-rank="A"]'),
    ).not.toBeNull();
    expect(
      seatCards?.querySelector('[data-card-rank="10"]'),
    ).not.toBeNull();
  });

  it("switches betting and turn controls without replacing their regions",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    renderer.render(model({
      interactionMode:"BETTING",
      interactionPrompt:"PLACE YOUR BET",
      openDrawer:"BET",
      canOpenBetDrawer:true,
    }));

    const betting=app.querySelector<HTMLElement>(
      ".blackjack-betting-region",
    );
    const actions=app.querySelector<HTMLElement>(".blackjack-actions");
    expect(betting?.hidden).toBe(false);
    expect(actions?.hidden).toBe(true);

    renderer.render(model({
      interactionMode:"TURN",
      interactionPrompt:"YOUR TURN",
      enabledActions:["HIT","STAND"],
      openDrawer:null,
      canOpenBetDrawer:false,
    }));

    expect(app.querySelector(".blackjack-betting-region")).toBe(betting);
    expect(app.querySelector(".blackjack-actions")).toBe(actions);
    expect(betting?.hidden).toBe(true);
    expect(actions?.hidden).toBe(false);
    expect(
      app.querySelector<HTMLButtonElement>(
        '[data-blackjack-action="HIT"]',
      )?.hidden,
    ).toBe(false);
    expect(
      app.querySelector<HTMLButtonElement>(
        '[data-blackjack-action="DOUBLE"]',
      )?.hidden,
    ).toBe(true);
  });

  it("patches drawer state without replacing drawer nodes",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    renderer.render(model({
      interactionMode:"BETTING",
      openDrawer:"BET",
      canOpenBetDrawer:true,
      occupiedSeatsLabel:"2 / 5 SEATED",
    }));

    const betDrawer=app.querySelector<HTMLElement>(
      '[data-blackjack-drawer="BET"]',
    );
    const infoDrawer=app.querySelector<HTMLElement>(
      '[data-blackjack-drawer="INFO"]',
    );
    const betToggle=app.querySelector<HTMLButtonElement>(
      '[data-blackjack-drawer-toggle="BET"]',
    );

    expect(betDrawer?.hidden).toBe(false);
    expect(infoDrawer?.hidden).toBe(true);
    expect(betToggle?.getAttribute("aria-expanded")).toBe("true");

    renderer.render(model({
      interactionMode:"BETTING",
      openDrawer:"INFO",
      canOpenBetDrawer:true,
      occupiedSeatsLabel:"3 / 5 SEATED",
    }));

    expect(
      app.querySelector('[data-blackjack-drawer="BET"]'),
    ).toBe(betDrawer);
    expect(
      app.querySelector('[data-blackjack-drawer="INFO"]'),
    ).toBe(infoDrawer);
    expect(betDrawer?.hidden).toBe(true);
    expect(infoDrawer?.hidden).toBe(false);
    expect(
      app.querySelector('[data-blackjack-info="players"]')?.textContent,
    ).toBe("3 / 5 SEATED");
  });

});
