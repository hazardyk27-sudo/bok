// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import {
  BLACKJACK_SOUND_STORAGE_KEY,
  createBlackjackSoundPresentation,
  type BlackjackSoundCue,
  type BlackjackSoundEngine,
} from "./soundPresentation";
import type { BlackjackPresentationEvent } from "./presentationQueue";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  renderBlackjackTableShell,
} from "./tableView";

function mountTable(): HTMLElement {
  const app=document.createElement("div");
  app.innerHTML=renderBlackjackTableShell(BLACKJACK_DEFAULT_TABLE_VIEW);
  document.body.append(app);
  return app;
}

function cardEvent(): BlackjackPresentationEvent {
  return Object.freeze({
    type:"PLAYER_CARD_DEALT" as const,
    eventSequence:3,
    stateVersion:4,
    roundId:"round-1",
    playerId:"player-1",
    seatNumber:1 as const,
    handId:"hand-1",
    cardIndex:0,
    card:Object.freeze({ suit:"HEARTS" as const, rank:"A" as const }),
  });
}

function settlement(
  result:"WIN"|"LOSS"|"PUSH"|"BLACKJACK_WIN",
): BlackjackPresentationEvent {
  return Object.freeze({
    type:"HAND_SETTLED" as const,
    eventSequence:7,
    stateVersion:8,
    roundId:"round-1",
    playerId:"player-1",
    seatNumber:1 as const,
    handId:"hand-1",
    result,
    betCents:10_000,
    payoutCents:result==="LOSS" ? 0 : result==="BLACKJACK_WIN" ? 25_000 : 10_000,
  });
}

function fakeEngine() {
  const cues:BlackjackSoundCue[]=[];
  let unlocks=0;
  let destroys=0;
  const engine:BlackjackSoundEngine=Object.freeze({
    unlock:async()=>{
      unlocks+=1;
      return true;
    },
    play:(cue)=>{ cues.push(cue); },
    destroy:()=>{ destroys+=1; },
  });
  return {
    engine,
    cues,
    unlocks:()=>unlocks,
    destroys:()=>destroys,
  };
}

afterEach(()=>{
  document.body.replaceChildren();
  window.localStorage.clear();
  Object.defineProperty(document,"visibilityState",{
    configurable:true,
    value:"visible",
  });
});

describe("blackjack sound presentation",()=>{
  it("unlocks only from a user gesture then maps authoritative events to cues",async()=>{
    const app=mountTable();
    const fake=fakeEngine();
    const sound=createBlackjackSoundPresentation(app,{engine:fake.engine});

    sound.play(cardEvent());
    expect(fake.cues).toEqual([]);

    app.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.unlocks()).toBe(1);

    sound.play(cardEvent());
    sound.play(settlement("WIN"));
    sound.play(settlement("BLACKJACK_WIN"));
    sound.play(settlement("LOSS"));
    sound.play(settlement("PUSH"));
    expect(fake.cues).toEqual([
      "CARD","WIN","BLACKJACK","LOSS","PUSH",
    ]);
    sound.destroy();
  });

  it("persists mute state and does not play while muted",async()=>{
    const app=mountTable();
    const fake=fakeEngine();
    const sound=createBlackjackSoundPresentation(app,{engine:fake.engine});
    const toggle=app.querySelector<HTMLButtonElement>(
      "[data-blackjack-sound-toggle]",
    )!;

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    toggle.click();
    expect(sound.isEnabled()).toBe(false);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(window.localStorage.getItem(BLACKJACK_SOUND_STORAGE_KEY)).toBe("off");

    app.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));
    await Promise.resolve();
    sound.play(cardEvent());
    expect(fake.cues).toEqual([]);
    sound.destroy();
  });

  it("suppresses sound when the page is hidden",async()=>{
    const app=mountTable();
    const fake=fakeEngine();
    const sound=createBlackjackSoundPresentation(app,{engine:fake.engine});
    app.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));
    await Promise.resolve();
    await Promise.resolve();

    Object.defineProperty(document,"visibilityState",{
      configurable:true,
      value:"hidden",
    });
    sound.play(cardEvent());
    expect(fake.cues).toEqual([]);
    sound.destroy();
  });

  it("adds immediate tactile cues for enabled table controls",async()=>{
    const app=mountTable();
    const fake=fakeEngine();
    const sound=createBlackjackSoundPresentation(app,{engine:fake.engine});
    app.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}));
    await Promise.resolve();
    await Promise.resolve();

    const action=document.createElement("button");
    action.dataset.blackjackAction="HIT";
    app.append(action);
    action.click();

    const chip=document.createElement("button");
    chip.dataset.blackjackChip="25";
    app.append(chip);
    chip.click();

    expect(fake.cues).toEqual(["ACTION","CHIP"]);
    sound.destroy();
  });

  it("removes its control and destroys audio on teardown",()=>{
    const app=mountTable();
    const fake=fakeEngine();
    const sound=createBlackjackSoundPresentation(app,{engine:fake.engine});
    expect(app.querySelector("[data-blackjack-sound-toggle]")).not.toBeNull();

    sound.destroy();
    expect(app.querySelector("[data-blackjack-sound-toggle]")).toBeNull();
    expect(fake.destroys()).toBe(1);
  });
});
