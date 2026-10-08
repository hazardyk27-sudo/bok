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

  it("deducts visible balance and launches HTTP synchronously on the click task", async () => {
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

    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => pending,
    );
    vi.stubGlobal("fetch", fetchMock);

    installRouletteFastPlace(app);
    app
      .querySelector<HTMLButtonElement>(
        '[data-bet-id="straight-8"]',
      )!
      .click();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/roulette/global-bets/latest",
    );
    expect(
      app.querySelector<HTMLElement>(
        "[data-wallet-balance]",
      )?.textContent,
    ).toBe("$90");

    resolveFetch(
      new Response(
        JSON.stringify({
          globalBet: {
            id: "bet-1",
            roundId: "round-1",
            bets: [{ betId: "straight-8", amount: 10 }],
            stakeCents: 1_000,
            payoutCents: 0,
            revision: 1,
            settlement: null,
            settledAtMs: null,
            updatedAtMs: Date.now(),
          },
          balanceCents: 9_000,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );
    await pending;
    await Promise.resolve();
    await Promise.resolve();
  });

  it("deducts immediately on the serialized path and rejects stale poll balance while optimistic", async () => {
    const app = document.createElement("div");
    app.innerHTML = `
      <main data-roulette-page data-phase="betting" data-betting-locked="false">
        <strong data-wallet-balance>$100</strong>
        <section data-roulette-bet-panel>
          <button data-chip-value="10" aria-pressed="true">10</button>
          <button data-bet-id="straight-19">19</button>
        </section>
      </main>
    `;
    document.body.append(app);

    setRouletteBetAuthority(
      "round-1",
      [{ betId: "straight-19", amount: 10 }],
      4,
      true,
    );

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    installRouletteFastPlace(app);
    app
      .querySelector<HTMLButtonElement>(
        '[data-bet-id="straight-19"]',
      )!
      .click();

    expect(fetchMock).not.toHaveBeenCalled();
    const balance = app.querySelector<HTMLElement>(
      "[data-wallet-balance]",
    )!;
    expect(balance.textContent).toBe("$90");

    // Simulate a background /state poll repainting the last server balance while
    // the local wager is still optimistic. The visible reservation must win.
    balance.textContent = "$100";
    await Promise.resolve();
    await Promise.resolve();

    expect(balance.textContent).toBe("$90");
  });
});
