// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { installBlackjackActionDock } from "./actionDock";
import {
  BLACKJACK_DEFAULT_TABLE_VIEW,
  renderBlackjackTableShell,
} from "./tableView";

function mountActions(
  enabledActions: readonly ("HIT"|"STAND"|"DOUBLE"|"SPLIT")[],
): HTMLElement {
  const app=document.createElement("div");
  app.innerHTML=renderBlackjackTableShell({
    ...BLACKJACK_DEFAULT_TABLE_VIEW,
    interactionMode:"TURN",
    interactionPrompt:"YOUR TURN",
    enabledActions,
  });
  document.body.append(app);
  return app;
}

afterEach(()=>{
  document.body.replaceChildren();
});

describe("blackjack player action dock",()=>{
  it("promotes HIT and STAND while keeping special moves collapsible",()=>{
    const app=mountActions(["HIT","STAND","DOUBLE","SPLIT"]);
    const controller=installBlackjackActionDock(app);
    const dock=app.querySelector<HTMLElement>(".blackjack-actions")!;
    const primary=dock.querySelector<HTMLElement>(".blackjack-action-primary")!;
    const special=dock.querySelector<HTMLDetailsElement>(".blackjack-action-special")!;

    expect(dock.dataset.blackjackActionDock).toBe("enhanced");
    expect(primary.querySelector('[data-blackjack-action="HIT"]')).not.toBeNull();
    expect(primary.querySelector('[data-blackjack-action="STAND"]')).not.toBeNull();
    expect(special.querySelector('[data-blackjack-action="DOUBLE"]')).not.toBeNull();
    expect(special.querySelector('[data-blackjack-action="SPLIT"]')).not.toBeNull();
    expect(special.hidden).toBe(false);
    expect(special.open).toBe(true);
    expect(special.querySelector('[data-blackjack-special-count="true"]')?.textContent)
      .toBe("2 AVAILABLE");

    const hit=dock.querySelector<HTMLButtonElement>('[data-blackjack-action="HIT"]')!;
    expect(hit.querySelector("strong")?.textContent).toBe("HIT");
    expect(hit.querySelector("small")?.textContent).toBe("TAKE A CARD");
    expect(hit.getAttribute("aria-label")).toContain("take a card");
    controller.destroy();
  });

  it("preserves a manual collapse while special availability is unchanged",()=>{
    const app=mountActions(["HIT","STAND","DOUBLE","SPLIT"]);
    const controller=installBlackjackActionDock(app);
    const special=app.querySelector<HTMLDetailsElement>(".blackjack-action-special")!;

    special.open=false;
    controller.refresh();
    expect(special.open).toBe(false);

    const split=app.querySelector<HTMLButtonElement>('[data-blackjack-action="SPLIT"]')!;
    split.disabled=true;
    controller.refresh();
    expect(special.open).toBe(false);
    controller.destroy();
  });

  it("hides special moves when unavailable and opens them on a new availability transition",()=>{
    const app=mountActions(["HIT","STAND"]);
    const controller=installBlackjackActionDock(app);
    const special=app.querySelector<HTMLDetailsElement>(".blackjack-action-special")!;
    const double=app.querySelector<HTMLButtonElement>('[data-blackjack-action="DOUBLE"]')!;

    expect(special.hidden).toBe(true);
    double.hidden=false;
    double.disabled=false;
    controller.refresh();

    expect(special.hidden).toBe(false);
    expect(special.open).toBe(true);
    expect(special.querySelector('[data-blackjack-special-count="true"]')?.textContent)
      .toBe("1 AVAILABLE");
    controller.destroy();
  });

  it("shows a locked server state when the authoritative client disables every move",()=>{
    const app=mountActions(["HIT","STAND"]);
    const controller=installBlackjackActionDock(app);
    const dock=app.querySelector<HTMLElement>(".blackjack-actions")!;
    const hit=app.querySelector<HTMLButtonElement>('[data-blackjack-action="HIT"]')!;
    const stand=app.querySelector<HTMLButtonElement>('[data-blackjack-action="STAND"]')!;

    hit.disabled=true;
    stand.disabled=true;
    controller.refresh();

    expect(dock.dataset.actionState).toBe("locked");
    expect(dock.querySelector(".blackjack-action-dock-state")?.textContent)
      .toBe("WAITING FOR SERVER");
    controller.destroy();
  });

  it("is idempotent for the same mounted table",()=>{
    const app=mountActions(["HIT","STAND"]);
    const first=installBlackjackActionDock(app);
    const second=installBlackjackActionDock(app);

    expect(second).toBe(first);
    expect(app.querySelectorAll(".blackjack-action-dock-head")).toHaveLength(1);
    first.destroy();
  });
});
