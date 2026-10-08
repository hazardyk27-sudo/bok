import type {
  RouletteBetPlacement,
} from "./betState";
import {
  confirmRouletteExternalLatestMutation,
  reserveRouletteExternalLatestMutation,
} from "./betAuthority";
import {
  getRouletteBetAuthoritySnapshot,
} from "./betAuthorityVisual";
import {
  hasRouletteActiveExternalLatestMutation,
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

export function canRouletteUseFastDouble(
  optimistic: boolean,
  hasMatchingActiveFastMutation: boolean,
) {
  return (
    !optimistic ||
    hasMatchingActiveFastMutation
  );
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

      const hasMatchingActiveFastMutation =
        hasRouletteActiveExternalLatestMutation(
          authority.roundId,
          current,
        );

      // If a normal optimistic action (undo/clear/place/drag/rebet) changed the
      // topology after the last confirmed/fast plan, do not bypass it with the
      // monotonic latest endpoint. Let the runtime bubble handler apply x2 and
      // serialize it through the normal authority queue instead.
      if (
        !canRouletteUseFastDouble(
          authority.optimistic,
          hasMatchingActiveFastMutation,
        )
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

      // Start the server-stamped request at capture time, but do not mutate
      // local authority yet. The runtime bubble handler must still apply x2
      // exactly once from the pre-click topology. Its matching network call is
      // then deduplicated onto this request.
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
          const stillCurrent =
            confirmRouletteExternalLatestMutation(
              authority.roundId!,
              plan,
              response,
              sequence,
            );

          // A later mutation or a round rollover may already own the UI. Never
          // let an older fast response paint its stale wallet balance over it.
          if (stillCurrent) {
            renderFastConfirmedBalance(
              app,
              response.balanceCents,
            );
          }
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
