// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { createBlackjackSettlementChipPresentation } from "./settlementChipPresentation";
import type { BlackjackPresentationEvent } from "./presentationQueue";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  renderBlackjackTableShell,
} from "./tableView";

function mountTable(): HTMLElement {
  const app=document.createElement("div");
  app.innerHTML=renderBlackjackTableShell({
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    seats:BLACKJACK_DEFAULT_TABLE_VIEW.seats.map((seat)=>
      seat.seatNumber===1
        ? { ...seat, label:"YOUR SEAT", isLocal:true }
        : seat,
    ),
  });
  document.body.append(app);

  const dealer=app.querySelector<HTMLElement>(".blackjack-dealer-zone")!;
  const seat=app.querySelector<HTMLElement>('.blackjack-seat[data-seat="1"]')!;
  dealer.getBoundingClientRect=()=>({
    x:80,y:40,left:80,top:40,right:180,bottom:100,width:100,height:60,
    toJSON:()=>({}),
  } as DOMRect);
  seat.getBoundingClientRect=()=>({
    x:280,y:260,left:280,top:260,right:380,bottom:320,width:100,height:60,
    toJSON:()=>({}),
  } as DOMRect);
  return app;
}

function settlement(
  result:"WIN"|"LOSS"|"PUSH"|"BLACKJACK_WIN",
  payoutCents:number,
): BlackjackPresentationEvent {
  return Object.freeze({
    type:"HAND_SETTLED" as const,
    eventSequence:12,
    stateVersion:14,
    roundId:"round-12",
    playerId:"player-1",
    seatNumber:1 as const,
    handId:"hand-1",
    result,
    betCents:10_000,
    payoutCents,
  });
}

function deferredWait() {
  let release: (()=>void) | null=null;
  const wait=()=>new Promise<void>((resolve)=>{ release=resolve; });
  return {
    wait,
    release:()=>{
      if(release===null) throw new Error("wait was not started");
      release();
    },
  };
}

describe("blackjack settlement chip presentation",()=>{
  it("flies winnings from dealer to the settled seat using net profit",async()=>{
    const app=mountTable();
    const deferred=deferredWait();
    const presentation=createBlackjackSettlementChipPresentation(app,{
      wait:deferred.wait,
      reducedMotion:()=>false,
    });

    const playing=presentation.play(settlement("WIN",20_000));
    await Promise.resolve();

    const flight=document.querySelector<HTMLElement>(
      '[data-blackjack-settlement-flight="true"]',
    );
    expect(flight?.classList.contains("is-win")).toBe(true);
    expect(flight?.querySelector(".blackjack-settlement-chip-label")?.textContent).toBe("+100");
    expect(flight?.style.getPropertyValue("--blackjack-settlement-x")).toBe("-200px");
    expect(flight?.style.getPropertyValue("--blackjack-settlement-y")).toBe("-220px");

    deferred.release();
    await playing;
    expect(document.querySelector('[data-blackjack-settlement-flight="true"]')).toBeNull();
    app.remove();
  });

  it("sweeps a losing wager from the seat to the dealer",async()=>{
    const app=mountTable();
    const deferred=deferredWait();
    const presentation=createBlackjackSettlementChipPresentation(app,{
      wait:deferred.wait,
      reducedMotion:()=>false,
    });

    const playing=presentation.play(settlement("LOSS",0));
    await Promise.resolve();

    const flight=document.querySelector<HTMLElement>(
      '[data-blackjack-settlement-flight="true"]',
    );
    expect(flight?.classList.contains("is-loss")).toBe(true);
    expect(flight?.querySelector(".blackjack-settlement-chip-label")?.textContent).toBe("−100");
    expect(flight?.style.getPropertyValue("--blackjack-settlement-x")).toBe("200px");
    expect(flight?.style.getPropertyValue("--blackjack-settlement-y")).toBe("220px");

    deferred.release();
    await playing;
    app.remove();
  });

  it("shows a push without inventing a gain or loss",async()=>{
    const app=mountTable();
    const presentation=createBlackjackSettlementChipPresentation(app,{
      wait:async()=>{},
      reducedMotion:()=>false,
    });

    await presentation.play(settlement("PUSH",10_000));

    expect(document.querySelector('[data-blackjack-settlement-flight="true"]')).toBeNull();
    expect(app.querySelector(".blackjack-seat.is-settling-chips")).toBeNull();
    app.remove();
  });

  it("clear removes in-flight chips without touching authoritative table state",async()=>{
    const app=mountTable();
    const deferred=deferredWait();
    const presentation=createBlackjackSettlementChipPresentation(app,{
      wait:deferred.wait,
      reducedMotion:()=>false,
    });

    const playing=presentation.play(settlement("BLACKJACK_WIN",25_000));
    await Promise.resolve();
    expect(document.querySelector('[data-blackjack-settlement-flight="true"]')).not.toBeNull();

    presentation.clear();
    expect(document.querySelector('[data-blackjack-settlement-flight="true"]')).toBeNull();
    expect(app.querySelector(".blackjack-seat.is-settling-chips")).toBeNull();

    deferred.release();
    await playing;
    app.remove();
  });
});
