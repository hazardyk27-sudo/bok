// @vitest-environment happy-dom

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  addRoulettePlacementForFastWrite,
  canRouletteUseFastPlace,
  installRouletteFastPlace,
  parseRouletteDisplayedBalanceCents,
} from "./fastPlace";
import {
  clearRouletteBetAuthority,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import {
  clearRouletteExternalLatestMutationForTests,
} from "./latestMutationDeduper";

afterEach(() => {
  clearRouletteBetAuthority();
  clearRouletteExternalLatestMutationForTests();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("roulette fast normal placement", () => {
  it("adds the selected amount without changing existing topology", () => {
    expect(
      addRoulettePlacementForFastWrite(
        [{ betId: "straight-8", amount: 20 }],
        "red",
        10,
      ),
    ).toEqual([
      { betId: "straight-8", amount: 20 },
      { betId: "red", amount: 10 },
    ]);
  });

  it("parses the rendered wallet balance exactly to cents", () => {
    expect(parseRouletteDisplayedBalanceCents("$390,255.73")).toBe(39_025_573);
    expect(parseRouletteDisplayedBalanceCents("$100")).toBe(10_000);
  });

  it("permits repeated fast placements only across confirmed/active-fast topology", () => {
    expect(canRouletteUseFastPlace(false, false)).toBe(true);
    expect(canRouletteUseFastPlace(true, true)).toBe(true);
    expect(canRouletteUseFastPlace(true, false)).toBe(false);
  });

  it("deducts visible balance and launches HTTP synchronously on the click task", () => {
    const app = document.createElement("div");
    app.innerHTML = `
      <main data-roulette-page data-phase="betting" data-betting-locked="false">
        <strong data-wallet-balance>$100</strong>
        <section data-roulette-bet-panel>
          <button data-chip-value="10" aria-pressed="true">10</button>
          <button data-bet-id="straight-8">8</button>
        </section>
      </main>
    `;
    document.body.append(app);

    setRouletteBetAuthority(
      "round-1",
      [],
      0,
      false,
    );

    const never = new Promise<Response>(() => {});
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => never,
    );
    vi.stubGlobal("fetch", fetchMock);

    installRouletteFastPlace(app);
    app
      .querySelector<HTMLButtonElement>(
        '[data-bet-id="straight-8"]',
      )!
      .click();

    // No await: both effects must happen before the browser yields a frame.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/roulette/global-bets/latest",
    );
    expect(
      app.querySelector<HTMLElement>(
        "[data-wallet-balance]",
      )?.textContent,
    ).toBe("$90");
  });
});
