export const BLACKJACK_ROUTE = "/blackjack";
export const BLACKJACK_MAX_SEATS = 5;

export const BLACKJACK_SHELL_MARKUP = `
  <main class="blackjack-root" data-game="blackjack" data-phase="foundation">
    <section class="blackjack-foundation" aria-labelledby="blackjack-title">
      <p>TABLE EXPERIENCE</p>
      <h1 id="blackjack-title">BLACKJACK</h1>
      <p>Multiplayer table foundation</p>
      <div aria-label="Blackjack table seats">
        <span>SEAT 1</span>
        <span>SEAT 2</span>
        <span>SEAT 3</span>
        <span>SEAT 4</span>
        <span>SEAT 5</span>
      </div>
      <p role="status">FOUNDATION READY</p>
    </section>
  </main>
`;

export function mountBlackjack(app: HTMLElement) {
  app.innerHTML = BLACKJACK_SHELL_MARKUP;
}
