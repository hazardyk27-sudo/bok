import "./roulette.css";
import {
  createBallOrbit,
  sampleBallOrbit,
  type BallOrbit,
} from "./ballMotion";
import {
  createRotorSpin,
  sampleRotorSpin,
  type RotorSpin,
} from "./spinMotion";
import {
  collectRouletteSimulationEvents,
  createRouletteSimulationEvents,
  type RouletteSimulationEvent,
} from "./simulationEvents";
import { RouletteAudioEngine } from "./rouletteAudio";
import { readSettledWinningResult } from "./spinResult";
import { renderRouletteWheel } from "./wheelRenderer";

type RouletteViewState = {
  rotorAngle: number;
  ballAngle: number;
  ballRadiusRatio: number;
  ballVisible: boolean;
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
          aria-label="European roulette wheel. Press to spin the wheel and ball."
        ></canvas>
      </section>
    </main>
  `;

  const canvas = app.querySelector<HTMLCanvasElement>("[data-roulette-wheel]");
  if (!canvas) throw new Error("Roulette canvas was not mounted.");

  const initialBallOrbit = createBallOrbit();

  const viewState: RouletteViewState = {
    rotorAngle: 0,
    ballAngle: initialBallOrbit.startAngle,
    ballRadiusRatio: initialBallOrbit.trackRadius,
    ballVisible: true,
  };

  let activeRotorSpin: RotorSpin | null = null;
  let activeBallOrbit: BallOrbit | null = null;
  let motionStartedAt = 0;
  let lastEventElapsedMs = -1;
  let simulationEvents: RouletteSimulationEvent[] = [];
  let frameId = 0;
  const rouletteAudio =
    new RouletteAudioEngine();

  const redraw = () => renderCanvas(canvas, viewState);

  const animate = (timestamp: number) => {
    const elapsedMs = timestamp - motionStartedAt;
    let rotorAngularVelocity = 0;

    if (activeRotorSpin) {
      const rotorSample = sampleRotorSpin(activeRotorSpin, elapsedMs);
      viewState.rotorAngle = rotorSample.angle;
      rotorAngularVelocity = rotorSample.angularVelocity;
      if (rotorSample.done) activeRotorSpin = null;
    }

    if (activeBallOrbit) {
      const dueEvents =
        collectRouletteSimulationEvents(
          simulationEvents,
          lastEventElapsedMs,
          elapsedMs,
        );

      dueEvents.forEach((event) => {
        rouletteAudio.handleEvent(event);
        canvas.dispatchEvent(
          new CustomEvent<RouletteSimulationEvent>(
            "roulette-simulation-event",
            {
              detail: event,
              bubbles: true,
            },
          ),
        );
      });
      lastEventElapsedMs = elapsedMs;

      const ballSample = sampleBallOrbit(activeBallOrbit, elapsedMs);
      viewState.ballAngle = ballSample.angle;
      viewState.ballRadiusRatio = ballSample.radiusRatio;

      rouletteAudio.updateMotion({
        rotorAngularVelocity,
        ballAngularVelocity:
          ballSample.angularVelocity,
        ballPhase: ballSample.phase,
      });

      if (ballSample.done) {
        const completedOrbit = activeBallOrbit;
        const result = readSettledWinningResult(completedOrbit);

        if (result) {
          canvas.dataset.rouletteState = "settled";
          canvas.dataset.roulettePocketIndex = String(result.pocketIndex);
          canvas.dataset.rouletteWinningNumber = String(result.number);
          canvas.dataset.rouletteWinningColor = result.color;
          canvas.setAttribute(
            "aria-label",
            `European roulette wheel. Result ${result.number}. Press to spin again.`,
          );
        } else {
          canvas.dataset.rouletteState = "unsettled";
          delete canvas.dataset.roulettePocketIndex;
          delete canvas.dataset.rouletteWinningNumber;
          delete canvas.dataset.rouletteWinningColor;
        }

        activeBallOrbit = null;
        rouletteAudio.stopMotion();
      }
    }

    redraw();

    if (!activeRotorSpin && !activeBallOrbit) {
      rouletteAudio.stopMotion();
      frameId = 0;
      return;
    }

    frameId = window.requestAnimationFrame(animate);
  };

  const startSpin = async () => {
    if (activeRotorSpin || activeBallOrbit) return;

    await rouletteAudio.ensureStarted();

    if (activeRotorSpin || activeBallOrbit) return;

    canvas.dataset.rouletteState = "spinning";
    delete canvas.dataset.roulettePocketIndex;
    delete canvas.dataset.rouletteWinningNumber;
    delete canvas.dataset.rouletteWinningColor;
    canvas.setAttribute(
      "aria-label",
      "European roulette wheel. Spin in progress.",
    );

    activeRotorSpin = createRotorSpin(viewState.rotorAngle, 1);
    activeBallOrbit = createBallOrbit(
      viewState.ballAngle,
      activeRotorSpin,
    );

    simulationEvents =
      createRouletteSimulationEvents(
        activeBallOrbit,
      );
    lastEventElapsedMs = -1;

    const initialBallSample = sampleBallOrbit(activeBallOrbit, 0);
    viewState.ballAngle = initialBallSample.angle;
    viewState.ballRadiusRatio = initialBallSample.radiusRatio;

    motionStartedAt = performance.now();

    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(animate);
  };

  canvas.dataset.rouletteState = "ready";

  const observer = new ResizeObserver(redraw);
  observer.observe(canvas);
  redraw();

  canvas.addEventListener("click", () => {
    void startSpin();
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void startSpin();
  });

  window.addEventListener("resize", redraw, { passive: true });
}
