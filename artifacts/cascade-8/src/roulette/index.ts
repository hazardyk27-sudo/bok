import "./roulette.css";

export function mountRoulette(app: HTMLDivElement) {
  app.innerHTML = `
    <main class="roulette-page" aria-label="Roulette 2D">
      <section class="roulette-stage">
        <div class="roulette-bootstrap">ROULETTE 2D</div>
      </section>
    </main>
  `;
}
