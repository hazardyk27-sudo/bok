import {
  RED_NUMBERS,
} from "./config";
import {
  ROULETTE_CHIP_VALUES,
} from "./betState";

export type RouletteBetCell = {
  id: string;
  label: string;
  kind:
    | "straight"
    | "column"
    | "dozen"
    | "outside";
  number?: number;
};

export const ROULETTE_STRAIGHT_BETS: RouletteBetCell[] = [
  {
    id: "straight-0",
    label: "0",
    kind: "straight",
    number: 0,
  },
  ...Array.from(
    { length: 36 },
    (_, index) => {
      const number = index + 1;
      return {
        id: `straight-${number}`,
        label: String(number),
        kind: "straight" as const,
        number,
      };
    },
  ),
];

export const ROULETTE_COLUMN_BETS: RouletteBetCell[] = [
  { id: "column-3", label: "2 TO 1", kind: "column" },
  { id: "column-2", label: "2 TO 1", kind: "column" },
  { id: "column-1", label: "2 TO 1", kind: "column" },
];

export const ROULETTE_DOZEN_BETS: RouletteBetCell[] = [
  { id: "dozen-1", label: "1ST 12", kind: "dozen" },
  { id: "dozen-2", label: "2ND 12", kind: "dozen" },
  { id: "dozen-3", label: "3RD 12", kind: "dozen" },
];

export const ROULETTE_OUTSIDE_BETS: RouletteBetCell[] = [
  { id: "low", label: "1-18", kind: "outside" },
  { id: "even", label: "EVEN", kind: "outside" },
  { id: "red", label: "RED", kind: "outside" },
  { id: "black", label: "BLACK", kind: "outside" },
  { id: "odd", label: "ODD", kind: "outside" },
  { id: "high", label: "19-36", kind: "outside" },
];

export function getStraightBetColorClass(
  number: number,
) {
  if (number === 0) return "is-green";
  return RED_NUMBERS.has(number)
    ? "is-red"
    : "is-black";
}

function getDesktopRow(number: number) {
  const remainder = number % 3;
  if (remainder === 0) return 1;
  if (remainder === 2) return 2;
  return 3;
}

function renderStraightNumber(number: number) {
  const desktopColumn = Math.ceil(number / 3);
  const desktopRow = getDesktopRow(number);
  const mobileColumn =
    number % 3 === 0
      ? 3
      : number % 3;
  const mobileRow = Math.ceil(number / 3);

  return `
    <button
      class="roulette-bet-cell roulette-number-cell ${getStraightBetColorClass(number)}"
      type="button"
      data-bet-id="straight-${number}"
      data-bet-kind="straight"
      data-bet-number="${number}"
      aria-label="${number} straight up"
      style="
        --desktop-column: ${desktopColumn};
        --desktop-row: ${desktopRow};
        --mobile-column: ${mobileColumn};
        --mobile-row: ${mobileRow};
      "
    >
      <span>${number}</span>
    </button>
  `;
}

function renderSimpleBet(
  bet: RouletteBetCell,
  extraClass = "",
) {
  return `
    <button
      class="roulette-bet-cell ${extraClass}"
      type="button"
      data-bet-id="${bet.id}"
      data-bet-kind="${bet.kind}"
      aria-label="${bet.label}"
    >
      <span>${bet.label}</span>
    </button>
  `;
}

export function renderRouletteBetTable() {
  const chips = ROULETTE_CHIP_VALUES
    .map(
      (value) => `
        <button
          class="roulette-chip-option roulette-casino-chip"
          type="button"
          data-chip-value="${value}"
          aria-label="Select ${value} chip"
          aria-pressed="${value === 10 ? "true" : "false"}"
        >
          <span class="roulette-chip-face-value">${value}</span>
        </button>
      `,
    )
    .join("");

  const numberCells = Array.from(
    { length: 36 },
    (_, index) =>
      renderStraightNumber(index + 1),
  ).join("");

  const columns = ROULETTE_COLUMN_BETS
    .map((bet) =>
      renderSimpleBet(
        bet,
        "roulette-column-cell",
      ),
    )
    .join("");

  const dozens = ROULETTE_DOZEN_BETS
    .map((bet) =>
      renderSimpleBet(
        bet,
        "roulette-dozen-cell",
      ),
    )
    .join("");

  const outside = ROULETTE_OUTSIDE_BETS
    .map((bet) => {
      const colorClass =
        bet.id === "red"
          ? "is-red-symbol"
          : bet.id === "black"
            ? "is-black-symbol"
            : "";

      const label =
        bet.id === "red" ||
        bet.id === "black"
          ? '<span class="roulette-diamond" aria-hidden="true"></span>'
          : `<span>${bet.label}</span>`;

      return `
        <button
          class="roulette-bet-cell roulette-outside-cell ${colorClass}"
          type="button"
          data-bet-id="${bet.id}"
          data-bet-kind="${bet.kind}"
          aria-label="${bet.label}"
        >
          ${label}
        </button>
      `;
    })
    .join("");

  return `
    <section
      class="roulette-bet-panel"
      aria-label="European roulette betting table"
      data-roulette-bet-panel
    >
      <div class="roulette-bet-panel__header">
        <span class="roulette-bet-status" data-bet-status aria-live="polite">BETTING OPEN</span>
        <span class="roulette-bet-hint">SELECT A BET</span>
      </div>

      <div class="roulette-table-layout">
        <div class="roulette-bet-table">
          <button
            class="roulette-bet-cell roulette-zero-cell is-green"
            type="button"
            data-bet-id="straight-0"
            data-bet-kind="straight"
            data-bet-number="0"
            aria-label="0 straight up"
          >
            <span>0</span>
          </button>

          <div class="roulette-number-grid" aria-label="Straight up numbers 1 to 36">
            ${numberCells}
          </div>

          <div class="roulette-column-bets" aria-label="Column bets">
            ${columns}
          </div>

          <div class="roulette-dozen-bets" aria-label="Dozen bets">
            ${dozens}
          </div>

          <div class="roulette-outside-bets" aria-label="Outside bets">
            ${outside}
          </div>
        </div>

        <div class="roulette-mobile-control-rail" aria-label="Mobile wager controls">
          <div class="roulette-mobile-utility" data-mobile-stats>
            <button
              class="roulette-mobile-rail-button roulette-mobile-stats-toggle"
              type="button"
              data-mobile-stats-toggle
              aria-label="Show recent statistics"
              aria-expanded="false"
            >
              <svg
                class="roulette-rail-icon"
                viewBox="0 0 20 20"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M4 15V10M10 15V5M16 15V8" />
              </svg>
            </button>
            <div
              class="roulette-mobile-stats-panel"
              data-mobile-stats-panel
              aria-label="Recent roulette statistics"
              hidden
            >
              <div class="roulette-mobile-stats-title">LAST 11</div>
              <div class="roulette-mobile-stats-row">
                <span>RED</span><strong data-stat-red>0</strong>
              </div>
              <div class="roulette-mobile-stats-row">
                <span>BLACK</span><strong data-stat-black>0</strong>
              </div>
              <div class="roulette-mobile-stats-row">
                <span>ZERO</span><strong data-stat-zero>0</strong>
              </div>
            </div>
          </div>

          <button
            class="roulette-mobile-rail-button roulette-mobile-undo"
            type="button"
            data-undo-bet
            aria-label="Undo last bet"
            disabled
          >
            <svg
              class="roulette-rail-icon roulette-rail-icon--undo"
              viewBox="0 0 20 20"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M7.3 6.2H4.2V3.1" />
              <path d="M4.5 6.1A6.2 6.2 0 1 1 3.9 13" />
            </svg>
          </button>

          <div class="roulette-mobile-chip-picker" data-mobile-chip-picker>
            <button
              class="roulette-mobile-rail-button roulette-mobile-chip-toggle roulette-casino-chip"
              type="button"
              data-mobile-chip-toggle
              aria-label="Choose chip"
              aria-expanded="false"
            >
              <span class="roulette-chip-face-value" data-mobile-selected-chip>10</span>
            </button>
            <div
              class="roulette-mobile-chip-menu"
              data-mobile-chip-menu
              aria-label="Chip values"
              hidden
            >
              ${chips}
            </div>
          </div>

          <button
            class="roulette-mobile-rail-button roulette-mobile-double"
            type="button"
            data-double-bet
            aria-label="Double current bet"
            disabled
          >
            ×2
          </button>

          <button
            class="roulette-mobile-rail-button roulette-mobile-rebet"
            type="button"
            data-rebet
            aria-label="Repeat previous bet"
            disabled
          >
            <svg
              class="roulette-rail-icon roulette-rail-icon--rebet"
              viewBox="0 0 20 20"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12.7 4.6h3.1V1.5" />
              <path d="M15.5 4.7A6.2 6.2 0 1 0 16.1 13" />
            </svg>
          </button>

          <button
            class="roulette-mobile-rail-button roulette-mobile-clear"
            type="button"
            data-clear-bets
            aria-label="Clear all bets"
            disabled
          >
            C
          </button>
        </div>
      </div>

      <div class="roulette-bet-console" aria-label="Roulette wager controls">
        <div class="roulette-chip-tray" aria-label="Chip values">
          ${chips}
        </div>

        <div class="roulette-bet-summary">
          <div class="roulette-bet-metric roulette-balance-metric">
            <span>BALANCE</span>
            <strong data-wallet-balance aria-live="polite">…</strong>
          </div>
          <div class="roulette-bet-metric">
            <span>TOTAL BET</span>
            <strong data-total-bet>$0</strong>
          </div>
          <div class="roulette-bet-metric roulette-return-metric">
            <span>RETURN</span>
            <strong data-round-return aria-live="polite">—</strong>
          </div>
          <div class="roulette-bet-metric roulette-profit-metric" data-round-outcome="idle">
            <span>NET</span>
            <strong data-round-profit aria-live="polite">—</strong>
          </div>
        </div>

        <div class="roulette-bet-actions">
          <button type="button" data-undo-bet disabled>UNDO</button>
          <button type="button" data-rebet disabled>REBET</button>
          <button class="roulette-spin-button" type="button" data-spin-button>
            SPIN
          </button>
        </div>
      </div>
    </section>
  `;
}
