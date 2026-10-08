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

  let pendingVisibleBalanceCents: number | null = null;
  let balanceReconcileQueued = false;

  const reconcilePendingBalance = () => {
    balanceReconcileQueued = false;
    if (pendingVisibleBalanceCents === null) return;

    const authority =
      getRouletteBetAuthoritySnapshot();

    // Once the authoritative write/recovery has completed, server balance owns
    // the display again. Until then, a background state poll is not allowed to
    // overwrite the stake the player already committed locally.
    if (!authority.optimistic) {
      pendingVisibleBalanceCents = null;
      return;
    }

    if (
      readDisplayedBalanceCents(app) !==
      pendingVisibleBalanceCents
    ) {
      renderBalance(
        app,
        pendingVisibleBalanceCents,
      );
    }
  };

  const queueBalanceReconcile = () => {
    if (balanceReconcileQueued) return;
    balanceReconcileQueued = true;
    queueMicrotask(reconcilePendingBalance);
  };

  const balanceObserver =
    new MutationObserver(queueBalanceReconcile);

  app
    .querySelectorAll<HTMLElement>(
      "[data-wallet-balance]",
    )
    .forEach((display) => {
      balanceObserver.observe(display, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });

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

      // Wallet acknowledgement belongs to the click itself, not to network RTT.
      // Reserve the visible amount in this task even when drag/undo/etc. forces
      // the actual write onto the serialized path.
      pendingVisibleBalanceCents =
        displayedBalanceCents - amount * 100;
      renderBalance(
        app,
        pendingVisibleBalanceCents,
      );

      const hasMatchingActiveFastMutation =
        hasRouletteActiveExternalLatestMutation(
          authority.roundId,
          current,
        );

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
            pendingVisibleBalanceCents = null;
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
        // authoritative bootstrap recovery. The balance guard keeps the local
        // reservation only while authority remains optimistic.
        console.error(
          "[roulette] fast place sync failed",
          error,
        );
        queueBalanceReconcile();
      });
    },
    { capture: true },
  );
}
