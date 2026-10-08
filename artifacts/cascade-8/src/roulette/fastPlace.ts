import {
  getRouletteBetTotals,
  type RouletteBetPlacement,
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
  registerRouletteCapturedPlaceIntent,
} from "./capturedPlaceIntent";
import {
  hasRouletteActiveExternalLatestMutation,
  registerRouletteExternalLatestMutation,
} from "./latestMutationDeduper";
import {
  RouletteWalletClient,
  type RouletteGlobalBetUpdateResponse,
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

function sameBetTotals(
  left: readonly RouletteBetPlacement[],
  right: readonly RouletteBetPlacement[],
) {
  const a = getRouletteBetTotals(left);
  const b = getRouletteBetTotals(right);
  const keys = new Set([
    ...Object.keys(a),
    ...Object.keys(b),
  ]);

  for (const key of keys) {
    if ((a[key] ?? 0) !== (b[key] ?? 0)) {
      return false;
    }
  }

  return true;
}

type PendingVisibleBalance = {
  id: number;
  roundId: string;
  plan: RouletteBetPlacement[];
  balanceCents: number;
  previousBalanceCents: number;
};

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
  const serializedWallet =
    new RouletteWalletClient();

  let pendingVisibleBalance: PendingVisibleBalance | null = null;
  let visibleBalanceSequence = 0;
  let balanceReconcileQueued = false;

  const reconcilePendingBalance = () => {
    balanceReconcileQueued = false;
    const pending = pendingVisibleBalance;
    if (!pending) return;

    if (page.dataset.phase === "settled") {
      pendingVisibleBalance = null;
      return;
    }

    const authority =
      getRouletteBetAuthoritySnapshot();
    const displayed =
      readDisplayedBalanceCents(app);
    const planMatches =
      authority.roundId === pending.roundId &&
      authority.bets !== null &&
      sameBetTotals(
        authority.bets,
        pending.plan,
      );

    if (
      displayed === pending.balanceCents &&
      planMatches &&
      !authority.optimistic
    ) {
      pendingVisibleBalance = null;
      return;
    }

    if (
      displayed !== null &&
      displayed < pending.balanceCents
    ) {
      pendingVisibleBalance = null;
      return;
    }

    if (
      !planMatches &&
      !authority.optimistic
    ) {
      pendingVisibleBalance = null;
      return;
    }

    if (displayed !== pending.balanceCents) {
      renderBalance(
        app,
        pending.balanceCents,
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
        page.dataset.phase !== "betting" ||
        page.dataset.bettingLocked === "true" ||
        panel.getAttribute("aria-disabled") === "true"
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

      const plan =
        addRoulettePlacementForFastWrite(
          current,
          betId,
          amount,
        );
      const hasMatchingActiveFastMutation =
        hasRouletteActiveExternalLatestMutation(
          authority.roundId,
          current,
        );
      const canUseFast =
        canRouletteUseFastPlace(
          authority.optimistic,
          hasMatchingActiveFastMutation,
        );

      registerRouletteCapturedPlaceIntent(
        betId,
        plan,
      );
      setRouletteBetAuthority(
        authority.roundId,
        plan,
        authority.revision,
        true,
      );

      const reservation: PendingVisibleBalance = {
        id: ++visibleBalanceSequence,
        roundId: authority.roundId,
        plan: plan.map((bet) => ({ ...bet })),
        balanceCents:
          displayedBalanceCents - amount * 100,
        previousBalanceCents:
          displayedBalanceCents,
      };
      pendingVisibleBalance = reservation;
      renderBalance(
        app,
        reservation.balanceCents,
      );

      if (!canUseFast) {
        // The click itself owns the serialized write. Calling updateGlobalBet
        // here synchronously puts this plan behind any older drag barrier while
        // preserving the user's local authority/balance immediately. Register
        // the returned promise only after enqueueing it, so the barrier cannot
        // ever wait on itself. The later roulette_gbet runtime writer consumes
        // this exact promise through latestMutationDeduper instead of sending a
        // duplicate request.
        const request =
          serializedWallet.updateGlobalBet(
            authority.roundId,
            plan,
            `roulette_captured_place_${crypto.randomUUID().replaceAll("-", "")}`,
            authority.revision,
          );

        registerRouletteExternalLatestMutation(
          authority.roundId,
          plan,
          request,
        );

        void request
          .then((response) => {
            if (
              pendingVisibleBalance?.id !==
              reservation.id
            ) {
              return;
            }

            const after =
              getRouletteBetAuthoritySnapshot();
            const stillSamePlan =
              after.roundId === reservation.roundId &&
              after.bets !== null &&
              sameBetTotals(
                after.bets,
                reservation.plan,
              );

            if (stillSamePlan) {
              pendingVisibleBalance = null;
              renderBalance(
                app,
                response.balanceCents,
              );
            }
          })
          .catch((error) => {
            console.error(
              "[roulette] serialized captured place sync failed",
              error,
            );
            queueBalanceReconcile();
          });
        return;
      }

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

          if (
            stillCurrent &&
            pendingVisibleBalance?.id ===
              reservation.id
          ) {
            pendingVisibleBalance = null;
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
