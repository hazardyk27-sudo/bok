// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createBlackjackCardFlightPresentation } from "./cardFlightPresentation";
import type { BlackjackPresentationEvent } from "./presentationQueue";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  renderBlackjackTableShell,
} from "./tableView";

function mountTable(): HTMLElement {
  const app=document.createElement("div");
  app.innerHTML=renderBlackjackTableShell({
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    dealerCards:[
      { rank:"9", suit:"SPADES" },
      null,
    ],
    seats:BLACKJACK_DEFAULT_TABLE_VIEW.seats.map((seat)=>
      seat.seatNumber===1
        ? {
            ...seat,
            label:"YOUR SEAT",
            status:"ACTIVE" as const,
            cards:[
              { rank:"A" as const, suit:"HEARTS" as const },
              { rank:"10" as const, suit:"CLUBS" as const },
            ],
          }
        : seat,
    ),
  });
  document.body.append(app);
  return app;
}

function mountDealerTurnTable(): HTMLElement {
  const app=document.createElement("div");
  app.innerHTML=renderBlackjackTableShell({
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    dealerActive:true,
    dealerTotalLabel:"20",
    dealerCards:[
      { rank:"10", suit:"SPADES" },
      { rank:"6", suit:"HEARTS" },
      { rank:"4", suit:"CLUBS" },
    ],
  });
  document.body.append(app);
  return app;
}

function playerDeal(cardIndex:number): BlackjackPresentationEvent {
  const cards=[
    { rank:"A" as const, suit:"HEARTS" as const },
    { rank:"10" as const, suit:"CLUBS" as const },
  ];
  return Object.freeze({
    type:"PLAYER_CARD_DEALT" as const,
    eventSequence:7,
    stateVersion:9,
    roundId:"round-7",
    playerId:"player-1",
    seatNumber:1 as const,
    handId:"hand-1",
    cardIndex,
    card:cards[cardIndex]!,
  });
}

function dealerHiddenDeal(): BlackjackPresentationEvent {
  return Object.freeze({
    type:"DEALER_CARD_DEALT" as const,
    eventSequence:7,
    stateVersion:9,
    roundId:"round-7",
    cardIndex:1,
    hidden:true,
    card:null,
  });
}

function dealerHoleReveal(): BlackjackPresentationEvent {
  return Object.freeze({
    type:"DEALER_HOLE_REVEALED" as const,
    eventSequence:12,
    stateVersion:14,
    roundId:"round-12",
    cardIndex:1,
    card:Object.freeze({ rank:"6" as const, suit:"HEARTS" as const }),
  });
}

function dealerDraw(): BlackjackPresentationEvent {
  return Object.freeze({
    type:"DEALER_CARD_DEALT" as const,
    eventSequence:12,
    stateVersion:14,
    roundId:"round-12",
    cardIndex:2,
    hidden:false,
    card:Object.freeze({ rank:"4" as const, suit:"CLUBS" as const }),
  });
}

describe("blackjack card flight presentation",()=>{
  it("hides all newly dealt targets before paint and reveals them FIFO",async()=>{
    const app=mountTable();
    const presentation=createBlackjackCardFlightPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });
    const first=playerDeal(0);
    const second=playerDeal(1);

    presentation.prepare([first,second]);

    const cards=[...app.querySelectorAll<HTMLElement>(
      '.blackjack-seat[data-seat="1"] .blackjack-card-face',
    )];
    expect(cards[0]?.classList.contains("blackjack-card-flight-pending")).toBe(true);
    expect(cards[1]?.classList.contains("blackjack-card-flight-pending")).toBe(true);

    await presentation.play(first);
    expect(cards[0]?.classList.contains("blackjack-card-flight-pending")).toBe(false);
    expect(cards[1]?.classList.contains("blackjack-card-flight-pending")).toBe(true);

    await presentation.play(second);
    expect(cards[1]?.classList.contains("blackjack-card-flight-pending")).toBe(false);
    expect(document.querySelector(".blackjack-card-flight-ghost")).toBeNull();

    app.remove();
  });

  it("treats the dealer hole card as a face-down shoe delivery",async()=>{
    const app=mountTable();
    const presentation=createBlackjackCardFlightPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });
    const event=dealerHiddenDeal();

    presentation.prepare([event]);
    const hole=app.querySelector<HTMLElement>(
      '.blackjack-dealer-cards [data-card-hidden="true"]',
    );
    expect(hole?.classList.contains("blackjack-card-flight-pending")).toBe(true);

    await presentation.play(event);
    expect(hole?.classList.contains("blackjack-card-flight-pending")).toBe(false);
    expect(hole?.classList.contains("blackjack-card-flight-arrived")).toBe(true);

    app.remove();
  });

  it("keeps the dealer hole card face-down until its queued flip",async()=>{
    const app=mountDealerTurnTable();
    const presentation=createBlackjackCardFlightPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });
    const reveal=dealerHoleReveal();
    const draw=dealerDraw();

    presentation.prepare([reveal,draw]);
    const hole=app.querySelectorAll<HTMLElement>(
      ".blackjack-dealer-cards .blackjack-card-face",
    )[1];
    expect(hole?.classList.contains("blackjack-card-flip-pending")).toBe(true);
    expect(app.querySelector(".blackjack-dealer-total")?.textContent).toBe("10 + ?");

    await presentation.play(reveal);

    expect(hole?.classList.contains("blackjack-card-flip-pending")).toBe(false);
    expect(hole?.dataset.blackjackFlipKey).toBeUndefined();
    expect(app.querySelector(".blackjack-dealer-total")?.textContent).toBe("16");
    app.remove();
  });

  it("reveals and counts dealer cards one by one instead of leaking the final total",async()=>{
    const app=mountDealerTurnTable();
    const presentation=createBlackjackCardFlightPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });
    const reveal=dealerHoleReveal();
    const draw=dealerDraw();

    presentation.prepare([reveal,draw]);
    const dealerCards=[...app.querySelectorAll<HTMLElement>(
      ".blackjack-dealer-cards .blackjack-card-face",
    )];
    expect(dealerCards[1]?.classList.contains("blackjack-card-flip-pending")).toBe(true);
    expect(dealerCards[2]?.classList.contains("blackjack-card-flight-pending")).toBe(true);
    expect(app.querySelector(".blackjack-dealer-total")?.textContent).toBe("10 + ?");

    await presentation.play(reveal);
    expect(app.querySelector(".blackjack-dealer-total")?.textContent).toBe("16");
    expect(dealerCards[2]?.classList.contains("blackjack-card-flight-pending")).toBe(true);

    await presentation.play(draw);
    expect(app.querySelector(".blackjack-dealer-total")?.textContent).toBe("20");
    expect(dealerCards[2]?.classList.contains("blackjack-card-flight-pending")).toBe(false);
    expect(document.querySelector(".blackjack-card-flight-ghost")).toBeNull();
    app.remove();
  });

  it("clear removes ghosts and never leaves authoritative cards hidden",()=>{
    const app=mountDealerTurnTable();
    const presentation=createBlackjackCardFlightPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });
    presentation.prepare([dealerHoleReveal(),dealerDraw()]);

    presentation.clear();

    expect(app.querySelector(".blackjack-card-flight-pending")).toBeNull();
    expect(app.querySelector(".blackjack-card-flip-pending")).toBeNull();
    expect(document.querySelector(".blackjack-card-flight-ghost")).toBeNull();
    expect(app.querySelector(".blackjack-dealer-total")?.textContent).toBe("20");
    app.remove();
  });
});
