// @vitest-environment happy-dom

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  installRouletteAuthorityBetDomGuard,
  renderRouletteBetTopology,
} from "./authorityBetDom";
import {
  clearRouletteBetAuthority,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";

function createApp() {
  const app = document.createElement("div");
  app.innerHTML = `
    <main data-roulette-page data-phase="betting">
      <section data-roulette-bet-panel>
        <button data-bet-id="straight-24"></button>
        <button data-bet-id="straight-25"></button>
      </section>
    </main>
  `;
  document.body.append(app);
  return app;
}

function chipAmount(
  app: HTMLDivElement,
  betId: string,
) {
  const chip = app.querySelector<HTMLElement>(
    `[data-bet-id="${betId}"] > .roulette-placed-chip`,
  );
  return chip?.dataset.betAmount ?? null;
}

afterEach(() => {
  clearRouletteBetAuthority();
  document.body.replaceChildren();
});

describe("roulette authority placed-chip DOM", () => {
  it("renders the moved authority topology with source empty and target occupied", () => {
    const app = createApp();

    renderRouletteBetTopology(app, [
      { betId: "straight-25", amount: 40 },
    ]);

    expect(chipAmount(app, "straight-24")).toBeNull();
    expect(chipAmount(app, "straight-25")).toBe("40");
  });

  it("restores authority before paint when a stale renderer puts the chip back on the source", async () => {
    const app = createApp();
    setRouletteBetAuthority(
      "round-1",
      [{ betId: "straight-25", amount: 40 }],
      7,
      true,
    );
    renderRouletteBetTopology(app, [
      { betId: "straight-25", amount: 40 },
    ]);
    installRouletteAuthorityBetDomGuard(app);

    renderRouletteBetTopology(app, [
      { betId: "straight-24", amount: 40 },
    ]);

    expect(chipAmount(app, "straight-24")).toBe("40");
    expect(chipAmount(app, "straight-25")).toBeNull();

    await Promise.resolve();
    await Promise.resolve();

    expect(chipAmount(app, "straight-24")).toBeNull();
    expect(chipAmount(app, "straight-25")).toBe("40");
  });

  it("keeps moved authority topology through the spin transition", async () => {
    const app = createApp();
    const page = app.querySelector<HTMLElement>("[data-roulette-page]")!;
    setRouletteBetAuthority(
      "round-1",
      [{ betId: "straight-25", amount: 40 }],
      7,
      false,
    );
    renderRouletteBetTopology(app, [
      { betId: "straight-25", amount: 40 },
    ]);
    installRouletteAuthorityBetDomGuard(app);

    page.dataset.phase = "spinning";
    renderRouletteBetTopology(app, [
      { betId: "straight-24", amount: 40 },
    ]);

    await Promise.resolve();
    await Promise.resolve();

    expect(chipAmount(app, "straight-24")).toBeNull();
    expect(chipAmount(app, "straight-25")).toBe("40");
  });

  it("allows intentional table cleanup once the round is settled", async () => {
    const app = createApp();
    const page = app.querySelector<HTMLElement>("[data-roulette-page]")!;
    setRouletteBetAuthority(
      "round-1",
      [{ betId: "straight-25", amount: 40 }],
      7,
      false,
    );
    renderRouletteBetTopology(app, [
      { betId: "straight-25", amount: 40 },
    ]);
    installRouletteAuthorityBetDomGuard(app);

    page.dataset.phase = "settled";
    renderRouletteBetTopology(app, []);

    await Promise.resolve();
    await Promise.resolve();

    expect(chipAmount(app, "straight-25")).toBeNull();
  });
});
