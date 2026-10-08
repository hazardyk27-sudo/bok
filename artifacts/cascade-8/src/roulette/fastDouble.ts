import type {
  RouletteBetPlacement,
} from "./betState";
import {
  confirmRouletteExternalLatestMutation,
  reserveRouletteExternalLatestMutation,
} from "./betAuthority";
import {
  getRouletteBetAuthoritySnapshot,
  setRouletteBetAuthority,
} from "./betAuthorityVisual";
import {
  registerRouletteExternalLatestMutation,
} from "./latestMutationDeduper";
import type {
  RouletteGlobalBetUpdateResponse,
} from "./rouletteWalletClient";
import {
  formatRouletteBalance,
  getRouletteBalanceScale,
} from "./uiFormat";

const FAST_DOUBLE_ENDPOINT =
  "/api/roulette/global-bets/latest";

export function doubleRoulettePlacementsForFastWrite(
  bets: readonly RouletteBetPlacement[],
) {
  return bets.map((bet) => ({
    ...bet,
    amount: bet.amount * 2,
  }));
}

function renderFastConfirmedBalance(
  app: HTMLDivElement,
  balanceCents: number,
) {
  if (!Number.isFinite(balanceCents)) return;

  const balance = balanceCents / 100;
  app
    .querySelectorAll<HTMLElement>(
      "[data-wallet-balance]",
    )
    .forEach((display) => {
      display.textContent =
        formatRouletteBalance(balance);
      display.dataset.balanceScale =
        getRouletteBalanceScale(balance);
    });
}

async function readFastDoubleResponse(
  response: Response,
) {
  const body = await response
    .json()
    .catch(() => ({})) as
      | RouletteGlobalBetUpdateResponse
      | { error?: unknown };

  if (!response.ok) {
    throw new Error(
      typeof (body as { error?: unknown }).error === "string"
        ? String((body as { error?: unknown }).error)
        : "ROULETTE_FAST_DOUBLE_FAILED",
    );
  }

  return body as RouletteGlobalBetUpdateResponse;
}

export function installRouletteFastDouble(
  app: HTMLDivElement,
) {
  const page = app.querySelector<HTMLElement>(
    "[data-roulette-page]",
  );
  const panel = app.querySelector<HTMLElement>(
    "[data-roulette-bet-panel]",
  );

  if (
    !page ||
    !panel ||
    panel.dataset.fastDoubleInstalled === "true"
  ) {
    return;
  }

  panel.dataset.fastDoubleInstalled = "true";

  panel.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest<HTMLButtonElement>(
        "[data-double-bet]",
      );
      if (
        !button ||
        button.disabled ||
        page.dataset.bettingLocked === "true"
      ) {
        return;
      }

      const authority =
        getRouletteBetAuthoritySnapshot();
      const current = authority.bets;

      if (
        !authority.roundId ||
        !current ||
        current.length === 0
      ) {
        return;
      }

      const plan =
        doubleRoulettePlacementsForFastWrite(
          current,
        );
      const sequence =
        reserveRouletteExternalLatestMutation();
      const idempotencyKey =
        `roulette_fast_double_${crypto.randomUUID().replaceAll("-", "")}`;

      // Claim authority before the runtime bubble handler executes. The runtime
      // still performs its normal optimistic reducer/render, but the matching
      // network call is deduplicated onto this exact server-stamped request.
      setRouletteBetAuthority(
        authority.roundId,
        plan,
        authority.revision,
        true,
      );

      const request = fetch(
        FAST_DOUBLE_ENDPOINT,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roundId: authority.roundId,
            bets: plan,
            idempotencyKey,
          }),
        },
      )
        .then(readFastDoubleResponse)
        .then((response) => {
          confirmRouletteExternalLatestMutation(
            authority.roundId!,
            plan,
            response,
            sequence,
          );
          renderFastConfirmedBalance(
            app,
            response.balanceCents,
          );
          return response;
        });

      registerRouletteExternalLatestMutation(
        authority.roundId,
        plan,
        request,
      );

      void request.catch((error) => {
        // The normal runtime queue shares this same promise. Its failure path
        // performs the authoritative bootstrap recovery; do not launch a second
        // write here.
        console.error(
          "[roulette] fast x2 sync failed",
          error,
        );
      });
    },
    { capture: true },
  );
}
