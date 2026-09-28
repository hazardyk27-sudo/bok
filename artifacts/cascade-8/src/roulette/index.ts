import "./roulette.css";
import {
  createRotorSpin,
  sampleRotorSpin,
  type RotorSpin,
} from "./spinMotion";
import { renderRouletteWheel } from "./wheelRenderer";

type RouletteViewState = {
  rotorAngle: number;
};

function renderCanvas(
  canvas: HTMLCanvasElement,
  viewState: RouletteViewState,
) {
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

  renderRouletteWheel(ctx, width, height, viewState);
}

export function mountRoulette(app: HTMLDivElement) {
  app.innerHTML = `
    <main class="roulette-page" aria-label="Roulette 2D">
      <section class="roulette-stage" aria-label="European roulette wheel">
        <canvas
          class="roulette-wheel-canvas"
          data-roulette-wheel
          role="button"
          tabindex="0"
          aria-label="European roulette wheel. Press to spin the wheel."
        ></canvas>
      </section>
    </main>
  `;

  const canvas = app.querySelector<HTMLCanvasElement>("[data-roulette-wheel]");
  if (!canvas) throw new Error("Roulette canvas was not mounted.");

  const viewState: RouletteViewState = {
    rotorAngle: 0,
  };

  let activeSpin: RotorSpin | null = null;
  let spinStartedAt = 0;
  let frameId = 0;

  const redraw = () => renderCanvas(canvas, viewState);

  const animate = (timestamp: number) => {
    if (!activeSpin) return;

    const sample = sampleRotorSpin(activeSpin, timestamp - spinStartedAt);
    viewState.rotorAngle = sample.angle;
    redraw();

    if (sample.done) {
      activeSpin = null;
      frameId = 0;
      return;
    }

    frameId = window.requestAnimationFrame(animate);
  };

  const startSpin = () => {
    if (activeSpin) return;

    activeSpin = createRotorSpin(viewState.rotorAngle, 1);
    spinStartedAt = performance.now();

    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(animate);
  };

  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  redraw();

  canvas.addEventListener("click", startSpin);
  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    startSpin();
  });

  window.addEventListener("resize", redraw, { passive: true });

  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.setTimeout(startSpin, 280);
  }
}
