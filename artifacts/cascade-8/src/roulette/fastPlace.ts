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

    // The server has caught up to this reservation. Once the matching plan is
    // confirmed, release local display ownership back to the server balance.
    if (
      displayed === pending.balanceCents &&
      planMatches &&
      !authority.optimistic
    ) {
      pendingVisibleBalance = null;
      return;
    }

    // A lower balance can only represent a newer local/server reservation. Do
    // not resurrect an older, higher pending value over it.
    if (
      displayed !== null &&
      displayed < pending.balanceCents
    ) {
      pendingVisibleBalance = null;
      return;
    }

    // Recovery/rejection returned authority to a different confirmed topology.
    // In that case the local reservation did not survive and server balance wins.
    if (
      !planMatches &&
      !authority.optimistic
    ) {
      pendingVisibleBalance = null;
      return;
    }

    // An older drag/poll/write response may repaint the pre-click server balance
    // after a newer click. Local committed stake owns the display until the
    // matching wager itself is confirmed or rejected.
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

      // On the serialized fallback path the runtime bubble handler must adopt
      // this exact plan in the same event task. If the click was swallowed or
      // rejected locally, release the visual reservation instead of lying about
      // money that never became a wager.
      if (!canUseFast) {
        queueMicrotask(() => {
          if (
            pendingVisibleBalance?.id !==
            reservation.id
          ) {
            return;
          }

          const afterClick =
            getRouletteBetAuthoritySnapshot();
          const adopted =
            afterClick.roundId === reservation.roundId &&
            afterClick.bets !== null &&
            sameBetTotals(
              afterClick.bets,
              reservation.plan,
            );

          if (!adopted) {
            pendingVisibleBalance = null;
            renderBalance(
              app,
              reservation.previousBalanceCents,
            );
          }
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
