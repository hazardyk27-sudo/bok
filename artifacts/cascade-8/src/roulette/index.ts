import "./roulette.css";
import { renderRouletteWheel } from "./wheelRenderer";

function sizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Roulette canvas 2D context is unavailable.");

  renderRouletteWheel(ctx, width, height);
}

export function mountRoulette(app: HTMLDivElement) {
  app.innerHTML = `
    <main class="roulette-page" aria-label="Roulette 2D">
      <section class="roulette-stage" aria-label="European roulette wheel">
        <canvas class="roulette-wheel-canvas" data-roulette-wheel></canvas>
      </section>
    </main>
  `;

  const canvas = app.querySelector<HTMLCanvasElement>("[data-roulette-wheel]");
  if (!canvas) throw new Error("Roulette canvas was not mounted.");

  const redraw = () => sizeCanvas(canvas);
  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  redraw();

  window.addEventListener("resize", redraw, { passive: true });
}
