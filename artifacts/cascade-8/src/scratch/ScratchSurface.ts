import { AudioManager } from "../game/AudioManager";
import {
  interpolateScratchPoints,
  SCRATCH_ABRASION_CONFIG,
  ScratchProgressGrid,
  type ScratchAbrasionConfig,
  type ScratchPoint,
} from "./ScratchProgress";
import { prefersReducedMotion } from "./ScratchFeedback";

const MIN_AUDIO_INTERVAL_MS = 28;
const RESULT_COMMIT_MIN_COVERAGE = 0.2;
const RESULT_COMMIT_MIN_MS = 420;
const RESULT_COMMIT_MIN_DISTANCE_FACTOR = 1.5;
const MAX_TRAIL_SAMPLES = 1800;
const MAX_DEBRIS_PARTICLES = 24;
const MOBILE_DEBRIS_PARTICLES = 12;
const DEFAULT_BRUSH_RADIUS_PX = 14;

type ScratchLayerName = "lacquer" | "foil" | "base";

type ScratchLayer = {
  name: ScratchLayerName;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

type DebrisParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  life: number;
  maxLife: number;
  alpha: number;
};

type TrailSample = {
  point: ScratchPoint;
  angle: number;
  speed: number;
};

export type ScratchSurfaceOptions = {
  abrasion?: Partial<ScratchAbrasionConfig>;
  brushRadiusPx?: number;
  audio?: AudioManager;
  debrisCanvas?: HTMLCanvasElement;
  resultReady?: boolean;
  layerCanvases?: HTMLCanvasElement[];
  onCommit: () => Promise<void>;
};

const clamp = (value: number, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, value));
const phase = (depth: number, start: number, end: number) => clamp((depth - start) / Math.max(0.001, end - start));

export class ScratchSurface {
  private readonly progress: ScratchProgressGrid;
  private readonly onCommit: () => Promise<void>;
  private readonly audio?: AudioManager;
  private readonly abrasionConfig: ScratchAbrasionConfig;
  private readonly brushRadiusPx: number;
  private readonly reducedMotion: boolean;
  private readonly debrisCanvas?: HTMLCanvasElement;
  private readonly debrisContext?: CanvasRenderingContext2D;
  private readonly pointerId: { value: number | null } = { value: null };
  private readonly layers: ScratchLayer[];
  private readonly interactionCanvas: HTMLCanvasElement;
  private lastPoint: ScratchPoint | null = null;
  private gestureStartedAt = 0;
  private scratchDistancePx = 0;
  private resultReady = false;
  private resultRequest: Promise<void> | null = null;
  private lastMoveAt = 0;
  private lastAudioAt = -Infinity;
  private brushStep = 0;
  private trail: TrailSample[] = [];
  private debrisFrame: number | null = null;
  private debrisFrameAt = 0;
  private debris: DebrisParticle[] = [];

  private readonly handlePointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    this.pointerId.value = event.pointerId;
    this.lastPoint = this.pointFromEvent(event);
    this.gestureStartedAt = performance.now();
    this.scratchDistancePx = 0;
    this.lastMoveAt = this.gestureStartedAt;

    // Make the first physical contact visible exactly under the pointer/finger.
    // This is only a surface scuff; settlement still requires the existing
    // coverage/time/distance anti-spoiler thresholds.
    const localWidth = Math.max(1, this.interactionCanvas.clientWidth);
    const localHeight = Math.max(1, this.interactionCanvas.clientHeight);
    const initialRadius = this.getBrushRadiusPx(localWidth, localHeight) / Math.max(1, Math.min(localWidth, localHeight));
    const initialDepthGain = this.abrasionConfig.depthPerSample * 1.15;
    this.progress.sampleCircle(this.lastPoint.x, this.lastPoint.y, initialRadius, initialDepthGain);
    this.rememberTrail(this.lastPoint, 0, 0.08);
    this.applyThreeLayerAbrasion(this.lastPoint, 0, 0.08, this.resultReady);
    this.eraseLayer("lacquer", this.lastPoint, 0, 0.08, 0.82);

    this.interactionCanvas.setPointerCapture(event.pointerId);
    this.interactionCanvas.classList.add("is-scratching");
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (this.pointerId.value !== event.pointerId || !this.lastPoint) return;
    const point = this.pointFromEvent(event);
    const deltaX = point.x - this.lastPoint.x;
    const deltaY = point.y - this.lastPoint.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 0.0005) return;

    const now = performance.now();
    const distancePx = distance * Math.max(1, this.interactionCanvas.clientWidth);
    const elapsed = Math.max(8, now - this.lastMoveAt);
    const speed = clamp(distancePx / elapsed / 1.05);
    const pressure = event.pressure > 0 ? clamp(event.pressure, .35, 1) : .62;
    const angle = Math.atan2(deltaY, deltaX);
    this.scratchDistancePx += distancePx;

    const localWidth = Math.max(1, this.interactionCanvas.clientWidth);
    const localHeight = Math.max(1, this.interactionCanvas.clientHeight);
    const normalizedBrushRadius = this.getBrushRadiusPx(localWidth, localHeight) / Math.max(1, Math.min(localWidth, localHeight));

    for (const sample of interpolateScratchPoints(this.lastPoint, point, 0.012)) {
      const depthGain = this.abrasionConfig.depthPerSample * (0.78 + speed * 0.24) * (0.86 + pressure * 0.32);
      this.progress.sampleCircle(sample.x, sample.y, normalizedBrushRadius, depthGain);
      this.rememberTrail(sample, angle, speed);
      this.applyThreeLayerAbrasion(sample, angle, speed, this.resultReady);
    }

    // Keep the visible scratch head centered under the live pointer. This only
    // clears the top lacquer; deeper result reveal still follows abrasion depth.
    this.eraseLayer("lacquer", point, angle, speed, 0.78);

    this.maybeCommitResult(now);
    this.emitDebris(point, angle, speed);
    if (now - this.lastAudioAt >= MIN_AUDIO_INTERVAL_MS) {
      this.audio?.scratch(speed, this.progress.depthAt(point.x, point.y));
      this.lastAudioAt = now;
    }

    this.lastPoint = point;
    this.lastMoveAt = now;
    event.preventDefault();
  };

  private readonly finishPointer = (event: PointerEvent) => {
    if (this.pointerId.value !== event.pointerId) return;
    if (this.interactionCanvas.hasPointerCapture(event.pointerId)) this.interactionCanvas.releasePointerCapture(event.pointerId);
    this.maybeCommitResult(performance.now());
    this.pointerId.value = null;
    this.lastPoint = null;
    this.gestureStartedAt = 0;
    this.scratchDistancePx = 0;
    this.lastMoveAt = 0;
    this.interactionCanvas.classList.remove("is-scratching");
  };

  constructor(
    fallbackCanvas: HTMLCanvasElement,
    options: ScratchSurfaceOptions,
  ) {
    const canvases = options.layerCanvases?.length ? options.layerCanvases : [fallbackCanvas];
    this.layers = canvases.map((canvas) => {
      const name = (canvas.dataset.scratchLayer ?? "lacquer") as ScratchLayerName;
      return { name, canvas, context: canvas.getContext("2d")! };
    });
    this.interactionCanvas =
      this.layers.find((layer) => layer.name === "lacquer")?.canvas ??
      this.layers.at(-1)?.canvas ??
      fallbackCanvas;

    this.abrasionConfig = { ...SCRATCH_ABRASION_CONFIG, ...options.abrasion };
    this.brushRadiusPx = Math.max(8, options.brushRadiusPx ?? DEFAULT_BRUSH_RADIUS_PX);
    this.progress = new ScratchProgressGrid(22, 14, 1, this.abrasionConfig);
    this.onCommit = options.onCommit;
    this.audio = options.audio;
    this.reducedMotion = prefersReducedMotion();
    this.debrisCanvas = options.debrisCanvas;
    this.debrisContext = options.debrisCanvas?.getContext("2d") ?? undefined;
    this.resultReady = options.resultReady ?? false;
    if (this.resultReady) this.resultRequest = Promise.resolve();

    this.resizeCanvases();
    this.paintLayers();

    this.interactionCanvas.addEventListener("pointerdown", this.handlePointerDown);
    this.interactionCanvas.addEventListener("pointermove", this.handlePointerMove);
    this.interactionCanvas.addEventListener("pointerup", this.finishPointer);
    this.interactionCanvas.addEventListener("pointercancel", this.finishPointer);
    this.interactionCanvas.addEventListener("lostpointercapture", this.finishPointer);
  }

  destroy() {
    this.cancelDebris();
    if (this.pointerId.value !== null && this.interactionCanvas.hasPointerCapture(this.pointerId.value)) {
      this.interactionCanvas.releasePointerCapture(this.pointerId.value);
    }
    this.pointerId.value = null;
    this.lastPoint = null;
    this.interactionCanvas.classList.remove("is-scratching");
    this.interactionCanvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.interactionCanvas.removeEventListener("pointermove", this.handlePointerMove);
    this.interactionCanvas.removeEventListener("pointerup", this.finishPointer);
    this.interactionCanvas.removeEventListener("pointercancel", this.finishPointer);
    this.interactionCanvas.removeEventListener("lostpointercapture", this.finishPointer);
  }

  reset() {
    if (this.pointerId.value !== null && this.interactionCanvas.hasPointerCapture(this.pointerId.value)) {
      this.interactionCanvas.releasePointerCapture(this.pointerId.value);
    }
    this.pointerId.value = null;
    this.lastPoint = null;
    this.gestureStartedAt = 0;
    this.scratchDistancePx = 0;
    this.lastMoveAt = 0;
    this.lastAudioAt = -Infinity;
    this.brushStep = 0;
    this.trail = [];
    this.resultReady = false;
    this.resultRequest = null;
    this.progress.reset();
    this.layers.forEach((layer) => layer.context.clearRect(0, 0, layer.canvas.clientWidth, layer.canvas.clientHeight));
    this.clearDebris();
    this.paintLayers();
  }

  private rememberTrail(point: ScratchPoint, angle: number, speed: number) {
    this.trail.push({ point, angle, speed });
    if (this.trail.length > MAX_TRAIL_SAMPLES) {
      this.trail.splice(0, this.trail.length - MAX_TRAIL_SAMPLES);
    }
  }

  private maybeCommitResult(now: number) {
    if (this.resultReady || this.resultRequest || this.gestureStartedAt <= 0) return;
    const elapsed = now - this.gestureStartedAt;
    const minimumDistance = Math.max(70, this.interactionCanvas.clientWidth * RESULT_COMMIT_MIN_DISTANCE_FACTOR);
    if (
      elapsed < RESULT_COMMIT_MIN_MS
      || this.scratchDistancePx < minimumDistance
      || this.progress.coverage < RESULT_COMMIT_MIN_COVERAGE
    ) return;
    this.ensureResultCommitted();
  }

  private ensureResultCommitted() {
    if (this.resultReady || this.resultRequest) return;
    this.resultRequest = this.onCommit()
      .then(() => {
        this.resultReady = true;
        this.replayBaseLayer();
      })
      .catch(() => {
        this.resultReady = false;
        this.resultRequest = null;
      });
  }

  private replayBaseLayer() {
    for (const sample of this.trail) {
      const depth = this.progress.depthAt(sample.point.x, sample.point.y);
      const baseAmount = phase(depth, 0.50, 0.94);
      if (baseAmount > 0) this.eraseLayer("base", sample.point, sample.angle, sample.speed, baseAmount);
    }
  }

  private resizeCanvases() {
    const width = Math.max(1, this.interactionCanvas.clientWidth);
    const height = Math.max(1, this.interactionCanvas.clientHeight);
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    for (const layer of this.layers) {
      layer.canvas.width = Math.max(1, Math.round(width * ratio));
      layer.canvas.height = Math.max(1, Math.round(height * ratio));
      layer.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    if (this.debrisCanvas && this.debrisContext) {
      this.debrisCanvas.width = Math.max(1, Math.round(width * ratio));
      this.debrisCanvas.height = Math.max(1, Math.round(height * ratio));
      this.debrisContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }

  private paintLayers() {
    for (const layer of this.layers) this.paintLayer(layer);
  }

  private paintLayer(layer: ScratchLayer) {
    const width = layer.canvas.clientWidth;
    const height = layer.canvas.clientHeight;
    const context = layer.context;

    if (layer.name === "base") {
      const base = context.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "#6f4728");
      base.addColorStop(.46, "#9f6d3d");
      base.addColorStop(1, "#52331f");
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = .24;
      for (let y = 4; y < height; y += 7) {
        context.fillStyle = y % 14 === 0 ? "#d2a363" : "#3b2618";
        context.fillRect(0, y, width, .55);
      }
      for (let x = 8; x < width; x += 13) {
        const y = 6 + ((x * 17) % Math.max(8, height - 12));
        context.fillStyle = x % 26 === 0 ? "#e6bd7a" : "#2d1b12";
        context.fillRect(x, y, 1.1, .8);
      }
      context.restore();
      return;
    }

    if (layer.name === "foil") {
      const foil = context.createLinearGradient(0, height, width, 0);
      foil.addColorStop(0, "#8d5928");
      foil.addColorStop(.16, "#d7a952");
      foil.addColorStop(.34, "#f0cf82");
      foil.addColorStop(.53, "#a56a2f");
      foil.addColorStop(.74, "#e2b75f");
      foil.addColorStop(1, "#73451f");
      context.fillStyle = foil;
      context.fillRect(0, 0, width, height);

      context.save();
      context.lineCap = "round";
      for (let index = -14; index < Math.ceil(width / 5) + 24; index += 1) {
        const x = index * 5;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + height * .82, height);
        context.lineWidth = index % 5 === 0 ? 1.05 : .34;
        context.globalAlpha = index % 4 === 0 ? .22 : .11;
        context.strokeStyle = index % 3 === 0 ? "#fff0b6" : "#56351c";
        context.stroke();
      }
      const band = context.createLinearGradient(0, 0, width, height);
      band.addColorStop(0, "rgba(255,255,255,.02)");
      band.addColorStop(.42, "rgba(255,244,199,.22)");
      band.addColorStop(.54, "rgba(255,255,255,.05)");
      band.addColorStop(1, "rgba(35,18,8,.12)");
      context.globalAlpha = 1;
      context.fillStyle = band;
      context.fillRect(0, 0, width, height);
      context.restore();
      return;
    }

    context.fillStyle = "rgba(255, 231, 168, .24)";
    context.fillRect(0, 0, width, height);

    const gloss = context.createLinearGradient(0, 0, width, height);
    gloss.addColorStop(0, "rgba(255,255,239,.36)");
    gloss.addColorStop(.20, "rgba(255,246,210,.10)");
    gloss.addColorStop(.43, "rgba(255,255,255,.30)");
    gloss.addColorStop(.58, "rgba(255,238,189,.05)");
    gloss.addColorStop(1, "rgba(67,35,17,.12)");
    context.fillStyle = gloss;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalAlpha = .16;
    context.strokeStyle = "#fff6d6";
    context.lineWidth = .45;
    for (let y = 3; y < height; y += 6) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y + Math.sin(y * .4) * .8);
      context.stroke();
    }
    context.restore();
  }

  private pointFromEvent(event: PointerEvent): ScratchPoint {
    const rect = this.interactionCanvas.getBoundingClientRect();
    const portraitLandscapeScene =
      window.matchMedia?.("(max-width: 600px) and (orientation: portrait)").matches ?? false;

    // The whole mobile game scene is rotated 90deg in portrait. Convert the
    // screen-space pointer back into the canvas' unrotated local coordinates.
    // This intentionally uses clientX/clientY + the transformed canvas rect
    // instead of offsetX/offsetY, whose behavior is inconsistent across
    // browsers when an ancestor is transformed.
    if (portraitLandscapeScene) {
      return {
        x: clamp((event.clientY - rect.top) / Math.max(1, rect.height)),
        y: clamp((rect.right - event.clientX) / Math.max(1, rect.width)),
      };
    }

    return {
      x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)),
    };
  }

  private getBrushRadiusPx(width: number, height: number) {
    const cellLimit = Math.max(8, Math.min(width, height) * 0.34);
    return Math.min(this.brushRadiusPx, cellLimit);
  }

  private applyThreeLayerAbrasion(point: ScratchPoint, angle: number, speed: number, resultReady: boolean) {
    const depth = this.progress.depthAt(point.x, point.y);
    const lacquerAmount = phase(depth, 0.015, 0.30);
    const foilAmount = phase(depth, 0.20, 0.62);
    const baseAmount = phase(depth, 0.50, 0.94);

    if (lacquerAmount > 0) this.eraseLayer("lacquer", point, angle, speed, lacquerAmount);
    if (foilAmount > 0) this.eraseLayer("foil", point, angle, speed, foilAmount);
    if (resultReady && baseAmount > 0) this.eraseLayer("base", point, angle, speed, baseAmount);
  }

  private eraseLayer(
    name: ScratchLayerName,
    point: ScratchPoint,
    angle: number,
    speed: number,
    amount: number,
  ) {
    const layer = this.layers.find((candidate) => candidate.name === name);
    if (!layer) return;

    const width = layer.canvas.clientWidth;
    const height = layer.canvas.clientHeight;
    const baseRadius = this.getBrushRadiusPx(width, height);
    const layerScale = name === "lacquer" ? .72 : name === "foil" ? .86 : 1;
    const radius = baseRadius * layerScale;
    const x = point.x * width;
    const y = point.y * height;
    const roughness = .9 + Math.sin(this.brushStep * 1.67 + (name === "foil" ? 1.3 : name === "base" ? 2.4 : 0)) * .07;
    this.brushStep += 1;

    layer.context.save();
    layer.context.translate(x, y);
    layer.context.rotate(angle);
    layer.context.globalCompositeOperation = "destination-out";
    layer.context.globalAlpha = clamp(.11 + amount * .46, .10, .62);
    layer.context.fillStyle = "#000";
    this.drawBrushPath(layer.context, radius, speed, roughness);

    layer.context.globalAlpha = clamp(.08 + amount * .24, .06, .34);
    layer.context.lineCap = "round";
    layer.context.strokeStyle = "#000";
    for (let groove = -1; groove <= 1; groove += 1) {
      const offset = groove * radius * .22;
      layer.context.beginPath();
      layer.context.moveTo(-radius * .72, offset);
      layer.context.lineTo(radius * (.42 + speed * .28), offset + Math.sin(this.brushStep + groove) * radius * .06);
      layer.context.lineWidth = Math.max(.55, radius * .045);
      layer.context.stroke();
    }
    layer.context.restore();
  }

  private drawBrushPath(
    context: CanvasRenderingContext2D,
    radius: number,
    speed: number,
    roughness: number,
  ) {
    context.beginPath();
    for (let index = 0; index < 20; index += 1) {
      const theta = (index / 20) * Math.PI * 2;
      const variation = roughness + Math.sin(index * 3.73 + this.brushStep * .29) * .085;
      const pointX = Math.cos(theta) * radius * variation;
      const pointY = Math.sin(theta) * radius * (.68 + speed * .1) * variation;
      if (index === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
    context.fill();
  }

  private emitDebris(point: ScratchPoint, angle: number, speed: number) {
    if (this.reducedMotion || !this.debrisContext || speed < .09) return;
    const isCompact = window.innerWidth <= 720 || (navigator.maxTouchPoints ?? 0) > 0;
    const limit = isCompact ? MOBILE_DEBRIS_PARTICLES : MAX_DEBRIS_PARTICLES;
    const count = speed > .66 ? 2 : 1;
    const width = this.interactionCanvas.clientWidth;
    const height = this.interactionCanvas.clientHeight;

    for (let index = 0; index < count; index += 1) {
      if (this.debris.length >= limit) this.debris.shift();
      const spread = (index - (count - 1) / 2) * .32;
      this.debris.push({
        x: point.x * width,
        y: point.y * height,
        vx: Math.cos(angle + Math.PI + spread) * (.22 + speed * .95),
        vy: Math.sin(angle + Math.PI + spread) * (.22 + speed * .95) - (.16 + speed * .55),
        size: .75 + speed * 1.25,
        rotation: angle + index,
        spin: (index % 2 ? 1 : -1) * (.04 + speed * .08),
        life: 0,
        maxLife: 250 + speed * 190,
        alpha: .34 + speed * .30,
      });
    }

    if (this.debrisFrame === null) {
      this.debrisFrameAt = performance.now();
      this.debrisFrame = window.requestAnimationFrame(this.animateDebris);
    }
  }

  private readonly animateDebris = (timestamp: number) => {
    if (!this.debrisContext || !this.debrisCanvas) {
      this.debrisFrame = null;
      return;
    }
    const elapsed = Math.min(34, Math.max(1, timestamp - this.debrisFrameAt));
    this.debrisFrameAt = timestamp;
    const width = this.debrisCanvas.clientWidth;
    const height = this.debrisCanvas.clientHeight;
    this.debrisContext.clearRect(0, 0, width, height);

    this.debris = this.debris.filter((particle) => {
      particle.life += elapsed;
      particle.x += particle.vx * elapsed;
      particle.y += particle.vy * elapsed;
      particle.vy += .0012 * elapsed;
      particle.rotation += particle.spin * elapsed;
      const lifeProgress = particle.life / particle.maxLife;
      if (lifeProgress >= 1) return false;

      this.debrisContext!.save();
      this.debrisContext!.translate(particle.x, particle.y);
      this.debrisContext!.rotate(particle.rotation);
      this.debrisContext!.globalAlpha = particle.alpha * (1 - lifeProgress);
      this.debrisContext!.fillStyle = lifeProgress < .34 ? "#f4dfaa" : lifeProgress < .68 ? "#bd8a48" : "#6c4728";
      this.debrisContext!.fillRect(-particle.size / 2, -particle.size / 2, particle.size * 1.35, particle.size * .42);
      this.debrisContext!.restore();

      return particle.x > -8 && particle.x < width + 8 && particle.y > -8 && particle.y < height + 8;
    });

    if (this.debris.length > 0) this.debrisFrame = window.requestAnimationFrame(this.animateDebris);
    else this.debrisFrame = null;
  };

  private clearDebris() {
    this.cancelDebris();
    this.debris = [];
    this.debrisContext?.clearRect(0, 0, this.debrisCanvas?.clientWidth ?? 0, this.debrisCanvas?.clientHeight ?? 0);
  }

  private cancelDebris() {
    if (this.debrisFrame !== null) {
      window.cancelAnimationFrame(this.debrisFrame);
      this.debrisFrame = null;
    }
  }
}
