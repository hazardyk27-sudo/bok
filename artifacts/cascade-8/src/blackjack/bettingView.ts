export const BLACKJACK_BASE_CHIP_DENOMINATIONS = [
  10,
  25,
  50,
  100,
  250,
  500,
  1_000,
] as const;

export const BLACKJACK_HIGH_CHIP_BASE_CREDITS = 1_000 as const;

export type BlackjackBaseChipDenomination =
  (typeof BLACKJACK_BASE_CHIP_DENOMINATIONS)[number];

export type BlackjackBettingPanelViewModel = Readonly<{
  selectedChipCredits: number;
  totalBetLabel: string;
  readyLabel: string;
  bettingClosesLabel: string;
  enabled: boolean;
  pending: boolean;
  canClear: boolean;
  canReady: boolean;
  availableBalanceCents: number | null;
}>;

export const BLACKJACK_DEFAULT_BETTING_PANEL: BlackjackBettingPanelViewModel =
  Object.freeze({
    selectedChipCredits: 100,
    totalBetLabel: "0",
    readyLabel: "READY",
    bettingClosesLabel: "WAITING",
    enabled: false,
    pending: false,
    canClear: false,
    canReady: false,
    availableBalanceCents: null,
  });

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function assertPositiveSafeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "Blackjack " + label + " must be a positive safe integer",
    );
  }
}

export function getBlackjackHighChipCredits(
  doublingSteps: number,
): number {
  if (!Number.isSafeInteger(doublingSteps) || doublingSteps < 0) {
    throw new RangeError(
      "Blackjack chip doublingSteps must be a non-negative safe integer",
    );
  }

  let value = BLACKJACK_HIGH_CHIP_BASE_CREDITS;
  for (let step = 0; step < doublingSteps; step += 1) {
    if (value > Number.MAX_SAFE_INTEGER / 2) {
      throw new RangeError(
        "Blackjack chip denomination exceeds safe integer range",
      );
    }
    value *= 2;
  }

  return value;
}

export function isBlackjackChipDenomination(value: number): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) return false;

  if (
    (BLACKJACK_BASE_CHIP_DENOMINATIONS as readonly number[]).includes(value)
  ) {
    return true;
  }

  if (value < BLACKJACK_HIGH_CHIP_BASE_CREDITS) return false;

  let candidate = BLACKJACK_HIGH_CHIP_BASE_CREDITS;
  while (candidate < value && candidate <= Number.MAX_SAFE_INTEGER / 2) {
    candidate *= 2;
  }
  return candidate === value;
}

export function doubleBlackjackChipCredits(
  currentCredits: number,
): number {
  assertPositiveSafeInteger("chip credits", currentCredits);

  if (currentCredits < BLACKJACK_HIGH_CHIP_BASE_CREDITS) {
    throw new RangeError(
      "Blackjack high-chip doubling starts at 1K credits",
    );
  }
  if (currentCredits > Number.MAX_SAFE_INTEGER / 2) {
    throw new RangeError(
      "Blackjack chip denomination exceeds safe integer range",
    );
  }

  return currentCredits * 2;
}

export function formatBlackjackChipCredits(credits: number): string {
  assertPositiveSafeInteger("chip credits", credits);

  if (credits >= 1_000_000) {
    const millions = credits / 1_000_000;
    return millions.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 3,
      useGrouping: false,
    }) + "M";
  }
  if (credits >= 1_000 && credits % 1_000 === 0) {
    return String(credits / 1_000) + "K";
  }
  return credits.toLocaleString("en-US");
}

export function getBlackjackChipTier(credits: number): string {
  if (credits >= 4_000_000) return "ultra";
  if (credits >= 256_000) return "vip";
  if (credits >= 16_000) return "high-roller";
  if (credits >= 1_000) return "premium";
  return "classic";
}

function renderChipButton(
  credits: number,
  selectedChipCredits: number,
  model: BlackjackBettingPanelViewModel,
): string {
  const selected = credits === selectedChipCredits;
  const label = formatBlackjackChipCredits(credits);
  const affordable =
    model.availableBalanceCents === null ||
    credits * 100 <= model.availableBalanceCents;
  const disabled = !model.enabled || model.pending || !affordable;

  return `
    <button
      type="button"
      class="blackjack-chip${selected ? " is-selected" : ""}"
      data-blackjack-chip="${credits}"
      data-chip-tier="${getBlackjackChipTier(credits)}"
      aria-pressed="${selected ? "true" : "false"}"${disabled ? " disabled" : ""}
    >
      <span class="blackjack-chip-edge" aria-hidden="true"></span>
      <span class="blackjack-chip-face">
        <span class="blackjack-chip-value">${label}</span>
      </span>
    </button>
  `;
}

export function renderBlackjackBettingPanel(
  model: BlackjackBettingPanelViewModel =
    BLACKJACK_DEFAULT_BETTING_PANEL,
): string {
  assertPositiveSafeInteger(
    "selected chip credits",
    model.selectedChipCredits,
  );
  if (!isBlackjackChipDenomination(model.selectedChipCredits)) {
    throw new RangeError(
      "Blackjack selected chip is not an approved denomination",
    );
  }

  const highChip =
    model.selectedChipCredits >= BLACKJACK_HIGH_CHIP_BASE_CREDITS
      ? model.selectedChipCredits
      : BLACKJACK_HIGH_CHIP_BASE_CREDITS;

  return `
    <section class="blackjack-betting-panel" aria-label="Blackjack betting controls">
      <div class="blackjack-chip-tray" aria-label="Chip denominations">
        ${BLACKJACK_BASE_CHIP_DENOMINATIONS.map((credits) =>
          renderChipButton(credits, model.selectedChipCredits, model),
        ).join("")}
      </div>

      <div class="blackjack-high-chip-control" data-chip-tier="${getBlackjackChipTier(highChip)}">
        <span>HIGH CHIP</span>
        <button
          type="button"
          class="blackjack-high-chip-value"
          data-blackjack-chip="${highChip}"
          data-blackjack-selected-chip="${highChip}"${!model.enabled || model.pending || (model.availableBalanceCents !== null && highChip * 100 > model.availableBalanceCents) ? " disabled" : ""}
        >${formatBlackjackChipCredits(highChip)}</button>
        <button
          type="button"
          data-blackjack-chip-scale="DOUBLE"
          aria-label="Double selected high-value chip"${!model.enabled || model.pending ? " disabled" : ""}
        >×2</button>
      </div>

      <div class="blackjack-bet-circle" aria-label="Current Blackjack bet">
        <span>BET</span>
        <strong>${escapeHtml(model.totalBetLabel)}</strong>
      </div>

      <div class="blackjack-betting-actions">
        <button type="button" data-blackjack-bet-action="UNDO"${model.canClear && !model.pending ? "" : " disabled"}>
          UNDO
        </button>
        <button type="button" data-blackjack-bet-action="CLEAR"${model.canClear && !model.pending ? "" : " disabled"}>
          CLEAR
        </button>
        <button type="button" data-blackjack-bet-action="READY"${model.canReady && !model.pending ? "" : " disabled"}>
          ${escapeHtml(model.readyLabel)}
        </button>
      </div>

      <div class="blackjack-betting-deadline">
        <span>BETTING CLOSES</span>
        <strong>${escapeHtml(model.bettingClosesLabel)}</strong>
      </div>
    </section>
  `;
}
