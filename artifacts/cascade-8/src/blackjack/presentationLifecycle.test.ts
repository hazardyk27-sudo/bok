// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { installBlackjackPresentationLifecycle } from "./presentationLifecycle";

afterEach(()=>{
  document.body.replaceChildren();
  Object.defineProperty(document,"visibilityState",{
    configurable:true,
    value:"visible",
  });
});

describe("blackjack presentation lifecycle",()=>{
  it("suppresses and clears presentation when the page becomes hidden",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    let suspends=0;
    const lifecycle=installBlackjackPresentationLifecycle(app,()=>{
      suspends+=1;
    });

    expect(lifecycle.isSuppressed()).toBe(false);
    Object.defineProperty(document,"visibilityState",{
      configurable:true,
      value:"hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(lifecycle.isSuppressed()).toBe(true);
    expect(suspends).toBe(1);

    Object.defineProperty(document,"visibilityState",{
      configurable:true,
      value:"visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(lifecycle.isSuppressed()).toBe(false);
    expect(suspends).toBe(1);
    lifecycle.destroy();
  });

  it("treats pagehide as terminal presentation suspension",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    let suspends=0;
    const lifecycle=installBlackjackPresentationLifecycle(app,()=>{
      suspends+=1;
    });

    window.dispatchEvent(new Event("pagehide"));
    expect(lifecycle.isSuppressed()).toBe(true);
    expect(suspends).toBe(1);
    lifecycle.destroy();
  });

  it("cleans visibility listeners on destroy",()=>{
    const app=document.createElement("div");
    document.body.append(app);
    let suspends=0;
    const lifecycle=installBlackjackPresentationLifecycle(app,()=>{
      suspends+=1;
    });
    lifecycle.destroy();

    Object.defineProperty(document,"visibilityState",{
      configurable:true,
      value:"hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    expect(suspends).toBe(0);
  });

  it("is a safe no-op for non-DOM test doubles",()=>{
    const lifecycle=installBlackjackPresentationLifecycle(
      {} as HTMLElement,
      ()=>{
        throw new Error("must not suspend");
      },
    );
    expect(lifecycle.isSuppressed()).toBe(false);
    expect(()=>lifecycle.destroy()).not.toThrow();
  });
});
