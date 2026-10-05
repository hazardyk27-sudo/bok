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

  it("clear removes ghosts and never leaves authoritative cards hidden",()=>{
    const app=mountTable();
    const presentation=createBlackjackCardFlightPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });
    presentation.prepare([playerDeal(0),playerDeal(1)]);

    presentation.clear();

    expect(app.querySelector(".blackjack-card-flight-pending")).toBeNull();
    expect(document.querySelector(".blackjack-card-flight-ghost")).toBeNull();
    app.remove();
  });
});
