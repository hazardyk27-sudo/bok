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

const FAST_PLACE_ENDPOINT =
  "/api/roulette/global-bets/latest";

export function addRoulettePlacementForFastWrite(
  bets: readonly RouletteBetPlacement[],
  betId: string,
  amount: number,
) {
  return [
    ...bets.map((bet) => ({ ...bet })),
    { betId, amount },
  ];
}

export function canRouletteUseFastPlace(
  optimistic: boolean,
  hasMatchingActiveFastMutation: boolean,
) {
  return (
    !optimistic ||
    hasMatchingActiveFastMutation
  );
}

export function parseRouletteDisplayedBalanceCents(
  text: string | null | undefined,
) {
  if (!text) return null;
  const normalized = text.replace(/[^0-9.-]/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function renderBalance(
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

function readFastPlaceResponse(
  response: Response,
) {
  return response
    .json()
    .catch(() => ({}))
    .then((body) => {
      if (!response.ok) {
        throw new Error(
          typeof (body as { error?: unknown }).error === "string"
            ? String((body as { error?: unknown }).error)
            : "ROULETTE_FAST_PLACE_FAILED",
        );
      }
      return body as RouletteGlobalBetUpdateResponse;
    });
}

function readSelectedChipAmount(
  app: HTMLDivElement,
) {
  const selected = app.querySelector<HTMLElement>(
    '[data-chip-value][aria-pressed="true"]',
  );
  const amount = Number(selected?.dataset.chipValue);
  return Number.isFinite(amount) && amount > 0
    ? amount
    : null;
}

function readDisplayedBalanceCents(
  app: HTMLDivElement,
) {
  return parseRouletteDisplayedBalanceCents(
    app.querySelector<HTMLElement>(
      "[data-wallet-balance]",
    )?.textContent,
  );
}

export function installRouletteFastPlace(
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
    panel.dataset.fastPlaceInstalled === "true"
  ) {
    return;
  }

  panel.dataset.fastPlaceInstalled = "true";

  panel.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const cell = target.closest<HTMLElement>(
        "[data-bet-id]",
      );
      if (
        !cell ||
        page.dataset.bettingLocked === "true"
      ) {
        return;
      }

      const betId = cell.dataset.betId;
      const amount = readSelectedChipAmount(app);
      const displayedBalanceCents =
        readDisplayedBalanceCents(app);

      if (
        !betId ||
        amount === null ||
        displayedBalanceCents === null ||
        displayedBalanceCents < amount * 100
      ) {
        return;
      }

      const authority =
        getRouletteBetAuthoritySnapshot();
      const current = authority.bets;

      if (!authority.roundId || !current) {
        return;
      }

      // Visual wallet reservation belongs to the user action, not to the network
      // path. Deduct before deciding whether this click can use the fast endpoint.
      // If drag/undo/etc. currently owns optimistic authority, the runtime will
      // serialize the write, but the player still sees the stake leave the wallet
      // in this same click task instead of waiting for server ping/queue latency.
      renderBalance(
        app,
        displayedBalanceCents - amount * 100,
      );

      const hasMatchingActiveFastMutation =
        hasRouletteActiveExternalLatestMutation(
          authority.roundId,
          current,
        );

      // Repeated normal placements stay on the immediate path. If an unrelated
      // optimistic undo/drag/clear/rebet owns topology, fall back to the normal
      // serialized writer rather than crossing that mutation boundary.
      if (
        !canRouletteUseFastPlace(
          authority.optimistic,
          hasMatchingActiveFastMutation,
        )
      ) {
        return;
      }

      const plan =
        addRoulettePlacementForFastWrite(
          current,
          betId,
          amount,
        );
      const sequence =
        reserveRouletteExternalLatestMutation();
      const idempotencyKey =
        `roulette_fast_place_${crypto.randomUUID().replaceAll("-", "")}`;

      // Most important deadline invariant: start the HTTP request in capture
      // phase, before the runtime bubble handler and before any client write queue.
      const request = fetch(
        FAST_PLACE_ENDPOINT,
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
        .then(readFastPlaceResponse)
        .then((response) => {
          const stillCurrent =
            confirmRouletteExternalLatestMutation(
              authority.roundId!,
              plan,
              response,
              sequence,
            );

          if (stillCurrent) {
            renderBalance(
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
        // The runtime bubble handler consumes the same promise and performs the
        // authoritative bootstrap recovery. Do not issue a second write here.
        console.error(
          "[roulette] fast place sync failed",
          error,
        );
      });
    },
    { capture: true },
  );
}
