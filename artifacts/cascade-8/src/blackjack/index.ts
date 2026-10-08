import "./blackjack.css";

type DemoSeat = {
  id: number;
  total?: number;
  bet?: number;
  cards?: Array<{ rank: string; suit: string; red?: boolean }>;
  state: "active" | "empty";
};

const DEMO_SEATS: DemoSeat[] = [
  {
    id: 1,
    total: 19,
    bet: 50,
    state: "active",
    cards: [
      { rank: "A", suit: "♠" },
      { rank: "8", suit: "♠" },
    ],
  },
  { id: 2, state: "empty" },
  {
    id: 3,
    total: 16,
    bet: 100,
    state: "active",
    cards: [
      { rank: "9", suit: "♥", red: true },
      { rank: "7", suit: "♦", red: true },
    ],
  },
  { id: 4, state: "empty" },
  {
    id: 5,
    total: 16,
    bet: 125,
    state: "active",
    cards: [
      { rank: "K", suit: "♠" },
      { rank: "6", suit: "♣" },
    ],
  },
];

function renderCard(card: NonNullable<DemoSeat["cards"]>[number]) {
  return `
    <div class="bj-card${card.red ? " bj-card--red" : ""}" aria-label="${card.rank}${card.suit}">
      <span class="bj-card__rank">${card.rank}</span>
      <span class="bj-card__suit">${card.suit}</span>
      <span class="bj-card__pip">${card.suit}</span>
    </div>
  `;
}

function renderSeat(seat: DemoSeat) {
  if (seat.state === "empty") {
    return `
      <div class="bj-seat bj-seat--${seat.id} bj-seat--empty" data-seat="${seat.id}">
        <div class="bj-seat__bet-circle">
          <div class="bj-seat__empty-icon" aria-hidden="true">♣</div>
          <div class="bj-seat__empty-copy">SEAT ${seat.id} · EMPTY</div>
          <button class="bj-seat__take-seat" type="button">TAKE SEAT</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="bj-seat bj-seat--${seat.id} bj-seat--active" data-seat="${seat.id}">
      <div class="bj-seat__total">${seat.total}</div>
      <div class="bj-seat__cards">
        ${seat.cards?.map(renderCard).join("") ?? ""}
      </div>
      <div class="bj-seat__chip-stack" aria-hidden="true">
        <span class="bj-chip bj-chip--green"></span>
        <span class="bj-chip bj-chip--black"></span>
        <span class="bj-chip bj-chip--red"></span>
      </div>
      <div class="bj-seat__bet">$${seat.bet}</div>
      <div class="bj-seat__badge">
        <span class="bj-seat__person" aria-hidden="true"></span>
        <span><strong>Seat ${seat.id}</strong><small>BET READY</small></span>
      </div>
    </div>
  `;
}

function chipButton(value: string, variant: string, selected = false) {
  return `
    <button class="bj-console-chip bj-console-chip--${variant}${selected ? " is-selected" : ""}" type="button" aria-pressed="${selected}">
      <span>${value}</span>
    </button>
  `;
}

export function mountBlackjack(app: HTMLDivElement) {
  app.innerHTML = `
    <main class="bj-root" data-blackjack-part="1">
      <div class="bj-casino-backdrop" aria-hidden="true">
        <span class="bj-bokeh bj-bokeh--1"></span>
        <span class="bj-bokeh bj-bokeh--2"></span>
        <span class="bj-bokeh bj-bokeh--3"></span>
        <span class="bj-bokeh bj-bokeh--4"></span>
      </div>

      <section class="bj-stage" aria-label="Blackjack table">
        <aside class="bj-hud bj-hud--bankroll">
          <div class="bj-hud__pair">
            <span>BALANCE</span>
            <strong>$2,450.00</strong>
          </div>
          <div class="bj-hud__pair">
            <span>TOTAL BET</span>
            <strong>$275.00</strong>
          </div>
          <div class="bj-hud__min">
            <span>TABLE MIN</span>
            <strong>$10</strong>
          </div>
        </aside>

        <aside class="bj-hud bj-hud--status">
          <span>ROUND STATUS</span>
          <strong>PLACE YOUR BETS</strong>
          <small>Seats 1, 3 and 5 ready</small>
        </aside>

        <div class="bj-dealer-zone" aria-label="Dealer">
          <div class="bj-chip-rack" aria-hidden="true">
            <span class="bj-rack-chip bj-rack-chip--black"></span>
            <span class="bj-rack-chip bj-rack-chip--green"></span>
            <span class="bj-rack-chip bj-rack-chip--red"></span>
            <span class="bj-rack-chip bj-rack-chip--purple"></span>
            <span class="bj-rack-chip bj-rack-chip--gold"></span>
          </div>

          <div class="bj-dealer-figure" aria-hidden="true">
            <div class="bj-dealer-figure__hair"></div>
            <div class="bj-dealer-figure__head"></div>
            <div class="bj-dealer-figure__neck"></div>
            <div class="bj-dealer-figure__torso">
              <span class="bj-dealer-figure__shirt"></span>
              <span class="bj-dealer-figure__vest"></span>
              <span class="bj-dealer-figure__bow"></span>
            </div>
            <div class="bj-dealer-figure__arms"></div>
            <div class="bj-dealer-figure__hands"></div>
          </div>

          <div class="bj-shoe" aria-hidden="true">
            <div class="bj-shoe__deck"></div>
          </div>
          <div class="bj-discard" aria-hidden="true">
            <div class="bj-discard__cards"></div>
            <span>DISCARD</span>
          </div>
        </div>

        <div class="bj-table-shell">
          <div class="bj-rail bj-rail--outer"></div>
          <div class="bj-rail bj-rail--inner"></div>
          <div class="bj-felt">
            <div class="bj-dealer-hand">
              <div class="bj-dealer-hand__label">DEALER</div>
              <div class="bj-dealer-hand__cards">
                ${renderCard({ rank: "Q", suit: "♠" })}
                ${renderCard({ rank: "2", suit: "♥", red: true })}
                <span class="bj-dealer-hand__total">12</span>
              </div>
            </div>

            <div class="bj-table-copy" aria-hidden="true">
              <div>BLACKJACK PAYS 3 TO 2</div>
              <span>DEALER MUST HIT SOFT 17</span>
              <div>INSURANCE PAYS 2 TO 1</div>
            </div>

            <div class="bj-table-arc bj-table-arc--outer" aria-hidden="true"></div>
            <div class="bj-table-arc bj-table-arc--inner" aria-hidden="true"></div>

            <div class="bj-seats">
              ${DEMO_SEATS.map(renderSeat).join("")}
            </div>
          </div>
        </div>

        <section class="bj-console" aria-label="Blackjack controls">
          <div class="bj-console__chips" aria-label="Select chip">
            <button class="bj-chip-arrow" type="button" aria-label="Previous chips">‹</button>
            ${chipButton("$1", "white")}
            ${chipButton("$5", "red")}
            ${chipButton("$25", "green", true)}
            ${chipButton("$100", "blue")}
            ${chipButton("$500", "black")}
            <button class="bj-chip-arrow" type="button" aria-label="Next chips">›</button>
          </div>

          <div class="bj-console__bet-actions">
            <button class="bj-action bj-action--place" type="button">
              <span class="bj-action__icon">＋</span>
              <span><strong>PLACE BET</strong><small>Selected seat</small></span>
            </button>
            <button class="bj-action bj-action--neutral" type="button">
              <span class="bj-action__icon">↶</span>
              <span><strong>UNDO</strong><small>Last chip</small></span>
            </button>
            <button class="bj-action bj-action--gold" type="button">
              <span class="bj-action__icon">X2</span>
              <span><strong>X2 BET</strong><small>Pre-deal only</small></span>
            </button>
            <button class="bj-action bj-action--neutral" type="button">
              <span class="bj-action__icon">⌫</span>
              <span><strong>CLEAR BET</strong><small>Selected seat</small></span>
            </button>
          </div>

          <div class="bj-console__round-actions" aria-label="In round actions">
            <button class="bj-round-action bj-round-action--hit" type="button" disabled>HIT</button>
            <button class="bj-round-action bj-round-action--stand" type="button" disabled>STAND</button>
            <button class="bj-round-action bj-round-action--double" type="button" disabled>DOUBLE</button>
            <button class="bj-round-action bj-round-action--split" type="button" disabled>SPLIT</button>
          </div>
        </section>
      </section>
    </main>
  `;
}
