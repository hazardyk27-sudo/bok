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
const MAX_TRAIL_SAMPLES = 1800;
const MAX_DEBRIS_PARTICLES = 16;
const MOBILE_DEBRIS_PARTICLES = 9;

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
  private readonly reducedMotion: boolean;
  private readonly debrisCanvas?: HTMLCanvasElement;
  private readonly debrisContext?: CanvasRenderingContext2D;
  private readonly pointerId: { value: number | null } = { value: null };
  private readonly layers: ScratchLayer[];
  private readonly interactionCanvas: HTMLCanvasElement;
  private lastPoint: ScratchPoint | null = null;
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
    this.lastMoveAt = performance.now();
    this.interactionCanvas.setPointerCapture(event.pointerId);
    this.interactionCanvas.classList.add("is-scratching");
    if (!this.resultReady) this.ensureResultCommitted();
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
    const angle = Math.atan2(deltaY, deltaX);

    for (const sample of interpolateScratchPoints(this.lastPoint, point, 0.014)) {
      const depthGain = this.abrasionConfig.depthPerSample * (0.86 + speed * 0.34);
      this.progress.sampleCircle(sample.x, sample.y, this.abrasionConfig.brushRadius, depthGain);
      this.rememberTrail(sample, angle, speed);
      this.applyThreeLayerAbrasion(sample, angle, speed, this.resultReady);
    }

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
    this.pointerId.value = null;
    this.lastPoint = null;
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
      const baseAmount = phase(depth, 0.48, 0.9);
      if (baseAmount > 0) this.eraseLayer("base", sample.point, sample.angle, sample.speed, baseAmount);
    }
  }

  private resizeCanvases() {
    const rect = this.interactionCanvas.getBoundingClientRect();
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    for (const layer of this.layers) {
      layer.canvas.width = Math.max(1, Math.round(rect.width * ratio));
      layer.canvas.height = Math.max(1, Math.round(rect.height * ratio));
      layer.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    if (this.debrisCanvas && this.debrisContext) {
      this.debrisCanvas.width = Math.max(1, Math.round(rect.width * ratio));
      this.debrisCanvas.height = Math.max(1, Math.round(rect.height * ratio));
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
      base.addColorStop(0, "#9c6d39");
      base.addColorStop(.48, "#c89a56");
      base.addColorStop(1, "#79502c");
      context.fillStyle = base;
      context.fillRect(0, 0, width, height);
      context.globalAlpha = .18;
      context.fillStyle = "#f0d291";
      for (let y = 6; y < height; y += 9) context.fillRect(0, y, width, .6);
      context.globalAlpha = 1;
      return;
    }

    if (layer.name === "foil") {
      const foil = context.createLinearGradient(0, height, width, 0);
      foil.addColorStop(0, "#b07a39");
      foil.addColorStop(.22, "#e1bd72");
      foil.addColorStop(.5, "#8d6033");
      foil.addColorStop(.78, "#d5aa5f");
      foil.addColorStop(1, "#7d522e");
      context.fillStyle = foil;
      context.fillRect(0, 0, width, height);

      context.save();
      context.globalAlpha = .18;
      context.lineCap = "round";
      for (let index = -10; index < Math.ceil(width / 7) + 18; index += 1) {
        const x = index * 7;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x + height * .95, height);
        context.lineWidth = index % 4 === 0 ? 1.1 : .45;
        context.strokeStyle = index % 3 === 0 ? "#fff0bd" : "#3d2819";
        context.stroke();
      }
      context.restore();
      return;
    }

    const lacquer = context.createLinearGradient(0, 0, width, height);
    lacquer.addColorStop(0, "rgba(249, 218, 145, .96)");
    lacquer.addColorStop(.28, "rgba(177, 119, 55, .95)");
    lacquer.addColorStop(.52, "rgba(225, 181, 97, .94)");
    lacquer.addColorStop(.78, "rgba(132, 86, 43, .96)");
    lacquer.addColorStop(1, "rgba(239, 202, 126, .95)");
    context.fillStyle = lacquer;
    context.fillRect(0, 0, width, height);

    const shine = context.createRadialGradient(width * .28, height * .16, 0, width * .28, height * .16, width * .86);
    shine.addColorStop(0, "rgba(255,255,230,.34)");
    shine.addColorStop(.38, "rgba(255,235,177,.06)");
    shine.addColorStop(1, "rgba(44,26,15,.12)");
    context.fillStyle = shine;
    context.fillRect(0, 0, width, height);
  }

  private pointFromEvent(event: PointerEvent): ScratchPoint {
    const rect = this.interactionCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    };
  }

  private applyThreeLayerAbrasion(point: ScratchPoint, angle: number, speed: number, resultReady: boolean) {
    const depth = this.progress.depthAt(point.x, point.y);
    const lacquerAmount = phase(depth, 0.02, 0.34);
    const foilAmount = phase(depth, 0.24, 0.64);
    const baseAmount = phase(depth, 0.48, 0.9);

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
    const baseRadius = Math.max(6, width * this.abrasionConfig.brushRadius);
    const layerScale = name === "lacquer" ? .58 : name === "foil" ? .72 : .84;
    const radius = baseRadius * layerScale;
    const x = point.x * width;
    const y = point.y * height;
    const roughness = .9 + Math.sin(this.brushStep * 1.67 + (name === "foil" ? 1.3 : name === "base" ? 2.4 : 0)) * .07;
    this.brushStep += 1;

    layer.context.save();
    layer.context.translate(x, y);
    layer.context.rotate(angle);
    layer.context.globalCompositeOperation = "destination-out";
    layer.context.globalAlpha = clamp(.16 + amount * .5, .12, .72);
    layer.context.fillStyle = "#000";
    this.drawBrushPath(layer.context, radius, speed, roughness);
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
        size: .65 + speed * 1.05,
        rotation: angle + index,
        spin: (index % 2 ? 1 : -1) * (.04 + speed * .08),
        life: 0,
        maxLife: 200 + speed * 170,
        alpha: .3 + speed * .26,
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
      this.debrisContext!.fillStyle = lifeProgress < .42 ? "#f0d69a" : "#9e713f";
      this.debrisContext!.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * .52);
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
