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
  it("preserves a focused seat action when the seat remains claimable",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    const renderer=createBlackjackTableDomRenderer(app);

    const initial=model({
      seats:BLACKJACK_DEFAULT_TABLE_VIEW.seats.map((seat)=>
        seat.seatNumber===1
          ? {...seat,canClaim:true}
          : seat,
      ),
    });
    renderer.render(initial);

    const seat=app.querySelector<HTMLElement>('[data-seat="1"]');
    const button=app.querySelector<HTMLButtonElement>(
      '[data-seat="1"] [data-blackjack-seat-action="CLAIM"]',
    );
    expect(seat).not.toBeNull();
    expect(button).not.toBeNull();

    button!.focus();
    expect(document.activeElement).toBe(button);

    renderer.render(model({
      seats:initial.seats.map((entry)=>
        entry.seatNumber===1
          ? {...entry,label:"OPEN · TAP TO SIT"}
          : entry,
      ),
    }));

    expect(app.querySelector('[data-seat="1"]')).toBe(seat);
    expect(
      app.querySelector(
        '[data-seat="1"] [data-blackjack-seat-action="CLAIM"]',
      ),
    ).toBe(button);
    expect(document.activeElement).toBe(button);
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

});
