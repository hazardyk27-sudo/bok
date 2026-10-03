import {describe,expect,it,vi} from "vitest";
import {mountBlackjackSessionUnavailable} from "./index";

describe("blackjack session bootstrap failure UI",()=>{
  it("replaces endless CONNECTING with an error and one-shot retry",()=>{
    const app=document.createElement("div");
    const retry=vi.fn();

    mountBlackjackSessionUnavailable(app,retry);

    expect(app.querySelector(".blackjack-connection-label")?.textContent)
      .toBe("ERROR");
    expect(app.querySelector(".blackjack-context-prompt")?.textContent)
      .toBe("TABLE SESSION UNAVAILABLE");
    expect(app.querySelector('[data-blackjack-stat="phase"]')?.textContent)
      .toBe("CONNECTION ERROR");

    const button=app.querySelector<HTMLButtonElement>(
      "[data-blackjack-session-retry]",
    );
    expect(button?.textContent).toBe("RETRY");
    button?.click();
    button?.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
